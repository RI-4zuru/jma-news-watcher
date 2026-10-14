"""Offline smoke tests for classification, deduplication and first-run behavior."""
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import collect


def feed(items):
    from xml.sax.saxutils import escape
    content = ''.join(
        '<item><title>{}</title><link>{}</link><source>{}</source><pubDate>{}</pubDate></item>'.format(
            escape(title), 'https://news.google.com/rss/articles/demo'+str(i), escape(src),
            collect.NOW.strftime('%a, %d %b %Y %H:%M:%S GMT')
        ) for i, (title, src) in enumerate(items)
    )
    return ('<?xml version="1.0" encoding="UTF-8"?><rss><channel>' + content + '</channel></rss>').encode()


class TestCollector(unittest.TestCase):
    def test_windows_powershell_source_has_utf8_bom(self):
        ps1 = Path(__file__).resolve().parents[1] / "collect.ps1"
        self.assertTrue(ps1.read_bytes().startswith(b"\xef\xbb\xbf"))

    def test_failed_first_scan_does_not_enable_backlog_notifications(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(collect, 'STORE', root / 'store' / 'news.json'), patch.object(collect, 'SITE', root / 'site'):
                with patch.object(collect.urllib.request, 'urlopen', side_effect=OSError('network unavailable')), patch.object(collect, 'telegram_send'):
                    collect.main()
                    first = json.loads((root / 'store' / 'news.json').read_text())
                    self.assertFalse(first['baseline_ready'])
                    self.assertEqual(first['success_feeds'], 0)
                with patch.object(collect.urllib.request, 'urlopen', side_effect=lambda *args, **kwargs: io.BytesIO(feed([('京都で土砂崩れ', '新聞A')]))), patch.object(collect, 'telegram_send') as notify:
                    collect.main()
                    recovered = json.loads((root / 'store' / 'news.json').read_text())
                    self.assertTrue(recovered['baseline_ready'])
                    self.assertEqual(recovered['new_ids'], [])
                    self.assertTrue(notify.call_args.args[1])

    def test_classification_and_deduplication(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(collect, 'STORE', root / 'store' / 'news.json'), patch.object(collect, 'SITE', root / 'site'):
                content1 = feed([('大阪市で住宅火災、2人が避難', '新聞A'), ('滋賀県内に黄砂が飛来', '新聞B'), ('地震保険の新プラン', '新聞C')])
                with patch.object(collect.urllib.request, 'urlopen', side_effect=lambda *args, **kwargs: io.BytesIO(content1)), patch.object(collect, 'telegram_send') as notify:
                    collect.main()
                    data1 = json.loads((root / 'store' / 'news.json').read_text())
                    self.assertEqual(len(data1['items']), 2)
                    self.assertEqual(data1['new_ids'], [])  # First run establishes baseline
                    self.assertIn('housefire', next(x for x in data1['items'] if '火災' in x['title'])['categories'])
                    self.assertIn('大阪', next(x for x in data1['items'] if '火災' in x['title'])['areas'])
                    notify.assert_called_once()
                    self.assertTrue(notify.call_args.args[1])
                content2 = feed([('大阪市で住宅火災、2人が避難', '新聞A'), ('滋賀県内に黄砂が飛来', '新聞B'), ('兵庫県で竜巻被害が発生', '新聞D')])
                with patch.object(collect.urllib.request, 'urlopen', side_effect=lambda *args, **kwargs: io.BytesIO(content2)), patch.object(collect, 'telegram_send') as notify:
                    collect.main()
                    data2 = json.loads((root / 'site' / 'data.json').read_text())
                    self.assertEqual(len(data2['items']), 3)
                    self.assertEqual(len(data2['new_ids']), 1)
                    self.assertEqual(len(notify.call_args.args[0]), 1)
                    self.assertIn('tornado', next(x for x in data2['items'] if '竜巻' in x['title'])['categories'])


if __name__ == '__main__':
    unittest.main()

class TestAreaClassifier(unittest.TestCase):
    def test_ambiguous_place_names_do_not_force_wakayama(self):
        cases = [
            ('佐賀県有田町で山林火災', []),
            ('佐賀県有田町で落雷', []),
            ('和歌山県有田市で山林火災', ['和歌山']),
            ('和歌山県有田川町で洪水', ['和歌山']),
            ('新宮町で火災', []),  # 福岡県にも存在する
            ('新宮市で大雨', ['和歌山']),
            ('橋本で地震', []),  # 人名か地名か区別できない
            ('橋本市で大雨', ['和歌山']),
            ('京田辺市で霜害', ['京都']),
            ('田辺市で豪雨', ['和歌山']),
            ('東京都で震度3', []),  # 「東京都」を「京都」と誤認しない
            ('京都府で地震', ['京都']),
            ('群馬県草津町で降雪', []),
            ('滋賀県草津市で降雪', ['滋賀']),
            ('大阪市で住宅火災', ['大阪']),
            ('近畿地方で黄砂が観測', ['近畿']),
        ]
        for title, expected in cases:
            with self.subTest(title=title):
                self.assertEqual(collect.extract_areas(title), expected)

    def test_new_classifier_overwrites_previous_wrong_area(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            db = root / 'store' / 'news.json'
            db.parent.mkdir(parents=True)
            record = {'id': 'oldid', 'title': '佐賀県有田町で山林火災',
                      'source': '佐賀新聞', 'url': 'https://news.google.com/rss/articles/test',
                      'published_at': collect.NOW.isoformat(), 'categories':['forestfire'],
                      'priority':2, 'areas':['和歌山']}
            db.write_text(json.dumps({'items':[record], 'baseline_ready':True}))
            with patch.object(collect, 'STORE', db), patch.object(collect, 'SITE', root / 'site'), \
                 patch.object(collect.urllib.request, 'urlopen', side_effect=OSError('offline')), \
                 patch.object(collect, 'telegram_send'):
                collect.main()
                actual = json.loads(db.read_text())
                self.assertEqual(actual['items'][0]['areas'], [])
