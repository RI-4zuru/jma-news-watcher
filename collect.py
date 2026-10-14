#!/usr/bin/env python3
"""Google News RSS collector for GitHub Actions; Python standard library only."""
from __future__ import annotations

import concurrent.futures
import datetime as dt
import email.utils
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
CFG = json.loads((ROOT / 'config.json').read_text(encoding='utf-8'))
STORE = ROOT / 'store' / 'news.json'
SITE = ROOT / 'site'
UTC = dt.timezone.utc
NOW = dt.datetime.now(UTC)
CATS = CFG['categories']
CATS_REGEX = [(c, re.compile(c['pattern'], re.I)) for c in CATS]
EXCLUDE = re.compile(CFG['exclude_pattern'], re.I)
IMPORTANT = re.compile(CFG['important_pattern'], re.I)
# Conservative headline-only geographic classifier.
# A newspaper's publisher is NOT the incident location. Avoid ambiguous bare
# place names such as 有田, 田辺, 新宮, 白浜, 橋本, 大津, 草津, 吉野.
# City/town suffixes are necessary for such names: 佐賀県有田町 != 和歌山県有田市.
AREA_PATTERNS = {
    '近畿': r'近畿|関西',
    '大阪': r'大阪(?=府|市|湾|[でのにへ、・\s]|$)|堺市|枚方市|豊中市|高槻市|吹田市|東大阪市|岸和田市|茨木市|寝屋川市|八尾市|泉佐野市',
    '京都': r'(?<!東)京都(?=府|市|[でのにへ、・\s]|$)|宇治市|舞鶴市|福知山市|亀岡市|京丹後市|京田辺市|長岡京市|城陽市',
    '兵庫': r'兵庫(?=県|[でのにへ、・\s]|$)|神戸市|姫路市|尼崎市|西宮市|宝塚市|明石市|淡路島|淡路市|豊岡市|加古川市|洲本市|南あわじ市',
    '滋賀': r'滋賀(?=県|[でのにへ、・\s]|$)|大津市|彦根市|草津市|長浜市|近江八幡市|甲賀市|栗東市|守山市|野洲市|東近江市',
    '奈良': r'奈良(?=県|市|[でのにへ、・\s]|$)|橿原市|生駒市|大和郡山市|天理市|五條市|桜井市|吉野町|葛城市',
    '和歌山': r'和歌山(?=県|市|[でのにへ、・\s]|$)|(?<!京)田辺市|新宮市|白浜町|橋本市|有田市|有田川町|紀の川市|御坊市|海南市|岩出市|串本町',
}
AREA_REGEX = [(name, re.compile(pattern)) for name, pattern in AREA_PATTERNS.items()]



def read_old():
    if STORE.exists():
        try:
            data = json.loads(STORE.read_text(encoding='utf-8-sig'))
            if isinstance(data.get('items'), list):
                return data
        except (ValueError, OSError) as e:
            print(f'Warning: old data cannot be read: {e}', file=sys.stderr)
    return None


def normalize_title(title, source):
    title = re.sub(r'\s+', ' ', title).strip()
    if source and title.endswith(' - ' + source):
        title = title[:-(len(source) + 3)].strip()
    return title


def article_id(title, source):
    norm = re.sub(r'[\s\u3000\W_]+', '', title, flags=re.UNICODE).lower()
    return hashlib.sha256((norm + '|' + source.lower()).encode('utf-8')).hexdigest()[:20]


def extract_areas(title):
    return [name for name, regex in AREA_REGEX if regex.search(title)]


def fetch_one(feed_query):
    q = urllib.parse.urlencode({'q': feed_query, 'hl': 'ja', 'gl': 'JP', 'ceid': 'JP:ja'})
    request = urllib.request.Request(
        'https://news.google.com/rss/search?' + q,
        headers={'User-Agent': 'Mozilla/5.0 (compatible; NewsWatch/1.0)', 'Accept': 'application/rss+xml, application/xml, */*'}
    )
    with urllib.request.urlopen(request, timeout=28) as response:
        xml = response.read()
    root = ET.fromstring(xml)
    records = []
    for node in root.findall('.//item'):
        title = (node.findtext('title') or '').strip()
        url = (node.findtext('link') or '').strip()
        source = (node.findtext('source') or '').strip()
        pub = (node.findtext('pubDate') or '').strip()
        if not title or not url or not url.startswith('https://news.google.com/'):
            continue
        try:
            published = email.utils.parsedate_to_datetime(pub)
            if published.tzinfo is None:
                published = published.replace(tzinfo=UTC)
            published = published.astimezone(UTC)
        except (ValueError, TypeError):
            continue
        if (NOW - published).total_seconds() > CFG['retention_days'] * 86400 or (published - NOW).total_seconds() > 1800:
            continue
        title = normalize_title(title, source)
        if EXCLUDE.search(title):
            continue
        categories = [c['id'] for c, pat in CATS_REGEX if pat.search(title)]
        if not categories:
            continue
        priority = max(c['priority'] for c in CATS if c['id'] in categories)
        if IMPORTANT.search(title):
            priority = 3
        records.append({
            'id': article_id(title, source), 'title': title, 'url': url,
            'source': source or '配信元不明', 'published_at': published.isoformat().replace('+00:00', 'Z'),
            'categories': categories, 'priority': priority,
            'areas': extract_areas(title),
        })
    return records


def telegram_send(new_items, first_run):
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '').strip()
    chat = os.environ.get('TELEGRAM_CHAT_ID', '').strip()
    local_settings = ROOT / 'telegram.local.json'
    if local_settings.exists() and not (token and chat):
        try:
            local = json.loads(local_settings.read_text(encoding='utf-8-sig'))
            token, chat = str(local.get('bot_token', '')).strip(), str(local.get('chat_id', '')).strip()
        except (OSError, ValueError):
            pass
    if first_run or not token or not chat:
        return
    selected = [x for x in new_items if x['priority'] >= CFG['notify_min_priority']]
    if not selected:
        return
    selected.sort(key=lambda x: (x['priority'], x['published_at']), reverse=True)
    max_n = int(CFG['max_notifications_per_scan'])
    lines = [f'【気象・防災ニュース】新着 {len(selected)}件']
    for item in selected[:max_n]:
        headline = item['title'][:100]
        lines.append(f'\n・{headline}\n{item["url"]}')
    if len(selected) > max_n:
        lines.append(f'\nほか {len(selected) - max_n}件。ニュース一覧で確認してください。')
    # Telegram limit is 4096 chars. Split into chunks, each with title.
    parts = []
    current = lines[0]
    for line in lines[1:]:
        if len(current) + len(line) > 3900:
            parts.append(current)
            current = '【気象・防災ニュース（続き）】'
        current += line
    parts.append(current)
    for msg in parts:
        body = urllib.parse.urlencode({'chat_id': chat, 'text': msg, 'disable_web_page_preview': 'true'}).encode()
        req = urllib.request.Request('https://api.telegram.org/bot' + token + '/sendMessage', data=body, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                response = json.loads(res.read().decode('utf-8'))
                if not response.get('ok'):
                    print('Telegram reported a delivery error', file=sys.stderr)
        except Exception as e:
            # Do not print the URL (contains secret bot token).
            print(f'Telegram delivery failed: {type(e).__name__}', file=sys.stderr)


def main():
    old = read_old()
    first_run = old is None or old.get('baseline_ready') is False
    prior = {x['id']: x for x in old['items']} if old else {}
    # Reassess saved headlines after improvements to location detection.
    for article in prior.values():
        article['areas'] = extract_areas(article.get('title', ''))
    gathered = []
    errors = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        future_map = {pool.submit(fetch_one, q): q for q in CFG['feeds']}
        for future in concurrent.futures.as_completed(future_map):
            query = future_map[future]
            try:
                chunk = future.result()
                gathered.extend(chunk)
                print(f'OK: {query[:28]} ({len(chunk)})')
            except Exception as e:
                errors.append(f'{query[:26]}: {type(e).__name__}')
                print(f'FAILED: {query[:35]}: {type(e).__name__}: {e}', file=sys.stderr)
    success = len(CFG['feeds']) - len(errors)
    # Do not erase saved data if one or all feeds fail.
    combined = dict(prior)
    for article in gathered:
        if article['id'] in combined:
            existing = combined[article['id']]
            article['categories'] = sorted(set(existing['categories']) | set(article['categories']))
            # Never preserve a previous false-positive area assignment.
            article['areas'] = extract_areas(article['title'])
            article['priority'] = max(existing['priority'], article['priority'])
            if existing['published_at'] < article['published_at']:
                article['published_at'] = existing['published_at']
        combined[article['id']] = article
    cutoff = NOW - dt.timedelta(days=CFG['retention_days'])
    items = []
    for item in combined.values():
        try:
            if dt.datetime.fromisoformat(item['published_at'].replace('Z', '+00:00')) >= cutoff:
                items.append(item)
        except ValueError:
            pass
    items.sort(key=lambda x: x['published_at'], reverse=True)
    items = items[:CFG['max_items']]
    newly_added = [x for x in items if x['id'] not in prior] if success and not first_run else []
    payload = {
        'generated_at': NOW.isoformat().replace('+00:00', 'Z'),
        # Prevent notification floods if the first scan cannot reach any feed.
        'baseline_ready': bool(success) or not first_run,
        'success_feeds': success, 'total_feeds': len(CFG['feeds']),
        'errors': errors, 'new_ids': [x['id'] for x in newly_added[:150]],
        'categories': [{k: c[k] for k in ('id', 'name', 'icon', 'priority')} for c in CATS],
        'items': items,
    }
    STORE.parent.mkdir(parents=True, exist_ok=True)
    SITE.mkdir(parents=True, exist_ok=True)
    formatted = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    # Only local HTML needs JS; data.json is also available for other integrations.
    STORE.write_text(formatted + '\n', encoding='utf-8')
    (SITE / 'data.json').write_text(formatted + '\n', encoding='utf-8')
    (SITE / 'data.js').write_text('window.NEWS_PAYLOAD = ' + formatted + ';\n', encoding='utf-8')
    print(f'Successful feeds: {success}/{len(CFG["feeds"])}. Items: {len(items)}. New: {len(newly_added)}. First run: {first_run}')
    telegram_send(newly_added, first_run)
    # Broken feeds must be visible in the UI, but don't discard existing results.
    if success == 0:
        print('Warning: all news feeds failed; showing saved data.', file=sys.stderr)


if __name__ == '__main__':
    main()
