"""Conservative headline-only location inference for all 47 prefectures."""
from __future__ import annotations
import json
from pathlib import Path
import re

GEOGRAPHY = json.loads((Path(__file__).resolve().parent / 'regions.json').read_text(encoding='utf-8'))
PREFECTURES = GEOGRAPHY['prefectures']
GROUPS = GEOGRAPHY['groups']
assert len(PREFECTURES) == len(set(PREFECTURES)) == 47
assert sorted(x for g in GROUPS for x in g['prefectures']) == sorted(PREFECTURES)

# Full prefecture spelling and explicit prepositions: do not treat substring
# inside a publisher or a different geographic name as incident location.
# In particular, "東京都" contains 京都, but must not match Kyoto.
SUFFIX = '道'  # only used for Hokkaido; others follow their official suffixes
PREF_SUFFIX = {'東京': '都', '京都': '府', '大阪': '府', '北海道': ''}
BARE_AFTER = r'(?=$|[\s　、。・：:「」（）()でのにはがをへも、])'
PREF_PATTERNS = {}
for pref in PREFECTURES:
    suffix = PREF_SUFFIX.get(pref, '県')
    official = re.escape(pref + suffix)
    # Recognize headlines "大阪で..." and "福岡の..." without false "佐賀新聞".
    # Tokyo/Kyoto substring collision avoided by non-prefix requirement.
    boundary = r'(?<!東)' if pref == '京都' else ''
    PREF_PATTERNS[pref] = re.compile(r'(?:' + official + r'|' + boundary + re.escape(pref) + BARE_AFTER + r')')
CITY_PATTERNS = {
    pref: re.compile('|'.join(sorted(map(re.escape, cities), key=len, reverse=True)))
    for pref, cities in GEOGRAPHY['cities'].items()
}
CITY_PATTERNS['三重'] = re.compile(CITY_PATTERNS['三重'].pattern.replace('津市', r'(?<![大唐沼焼中宮魚草])津市'))
CITY_PATTERNS['和歌山'] = re.compile(CITY_PATTERNS['和歌山'].pattern.replace('田辺市', r'(?<!京)田辺市'))
REGION_TERMS = {
    '近畿地方': r'近畿|関西',
    '北海道地方': r'北海道地方',
    '東北地方': r'東北(?:地方)?',
    '関東地方': r'関東(?:地方)?',
    '甲信越地方': r'甲信越(?:地方)?',
    '北陸地方': r'北陸(?:地方)?',
    '東海地方': r'東海(?:地方)?',
    '中国地方': r'中国地方|山陰|山陽',
    '四国地方': r'四国(?:地方)?',
    '九州地方': r'九州(?:地方)?',
    '沖縄地方': r'沖縄地方',
}
REGION_PATTERNS = {k: re.compile(v) for k, v in REGION_TERMS.items()}
NATIONWIDE = re.compile(r'全国(?:各地|的|規模|で|に|の|へ|は|一斉|各県|都道府県|$)')


def extract_areas(headline: str) -> list[str]:
    """Only read an article headline; never infer location from publisher."""
    matched = [p for p in PREFECTURES
               if PREF_PATTERNS[p].search(headline) or CITY_PATTERNS[p].search(headline)]
    matched += [g for g, pattern in REGION_PATTERNS.items() if pattern.search(headline)]
    if NATIONWIDE.search(headline):
        matched.append('全国')
    return list(dict.fromkeys(matched))
