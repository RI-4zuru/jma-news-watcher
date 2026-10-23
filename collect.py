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
from geography import extract_areas, PREFECTURES


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


def story_fingerprint(title):
    """Stable article text key, independent of RSS query, source and prefecture labels."""
    title = normalize_title(str(title), '')
    # Remove an optional leading feed/location label; other headline text is kept.
    title = re.sub(r'^[\s　]*[【\[［][^】\]］]{1,28}[】\]］]\s*', '', title)
    return re.sub(r'[\W_]+', '', title, flags=re.UNICODE).casefold()


def areas_for_evidence(title):
    areas = set(extract_areas(title))
    # [大阪] / 【兵庫】 at the start of syndicated headlines is an explicit
    # regional edition tag, not an ambiguous free-text city name.
    label = re.match(r'^[\s　]*[【\[［]([^】\]］]{1,12})[】\]］]', str(title))
    if label:
        tag = label.group(1)
        if tag not in PREFECTURES:
            tag = re.sub(r'[都府県]$', '', tag)
        if tag in PREFECTURES:
            areas.add(tag)
    return sorted(areas)


def merge_article_records(records, preferred_ids=()):
    """Collapse syndicated/duplicate headlines while preserving all prefectures.

    Different reports about the *same event* with different headlines stay separate.
    Identical generic headlines more than 36 hours apart are not merged.
    Old IDs are processed first so bookmarked IDs remain stable.
    """
    preferred_ids = set(preferred_ids)
    records = sorted(records, key=lambda a: (a['id'] not in preferred_ids, a.get('published_at', ''), a.get('id', '')))
    groups = {}
    result = []
    for row in records:
        fingerprint = story_fingerprint(row.get('title', ''))
        try:
            published = dt.datetime.fromisoformat(row['published_at'].replace('Z', '+00:00'))
        except (ValueError, KeyError, AttributeError):
            published = NOW
        match = None
        if fingerprint:
            for existing, existing_time in groups.get(fingerprint, []):
