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
