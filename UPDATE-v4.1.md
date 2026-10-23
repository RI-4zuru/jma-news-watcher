# JMA News Watcher v4.1（v4からの改良版）

## 反映するファイル

この配布物は **現在運用しているv4向け差分**です。GitHubリポジトリの同じパスに上書きしてください。

```
collect.py
.github/workflows/news.yml
site/index.html
site/styles.css
site/app.js
site/common.js
site/alerts.html
site/alerts.js
```

* `config.json`、`geography.py`、`site/regions.js` は **既存のv4を継続使用**します。
* `site/data.json`、`site/data.js`、`store/news.json` は **この配布物には含まれません**。過去の記事は上書きしません。
* 設定や保存記事のIDは、元のv4と同じブラウザ保存領域を使用します。

## GitHubへの反映

1. ZIPを解凍し、上記ファイルをフォルダ構成を保ったままGitHubへ反映します。
2. `.github/workflows/news.yml` を忘れずに反映します。
3. `Commit changes` を押します。
4. `Actions → Collect and publish weather news → Run workflow` を一度実行します。
5. `collect` と `deploy` の両方が成功したら、サイトを `Ctrl+F5` で更新します。
6. ヘッダーの表示が `MONITOR / v4.1` になっていることを確認してください。

GitHub Actionsの収集スケジュールは **毎時7、17、27、37、47、57分（UTC）** に起動するよう設定しています。実際の実行は遅延・省略される場合があります。画面は60秒ごとに公開データを確認します。

## 改良点

* 監視エリア 1～8、画面幅に応じて最大4列の自動配置
* 全分類を多列表示（PC画面ではスクロール不要）
* 同一見出しの重複統合：複数府県や複数媒体をまとめ、すべての対象地域を保持
* 収集後35分以上経過時の注意表示
* 外部取得した見出しをHTML文字列として解釈せず、DOMのテキストとして表示
* 記事データを `data.js` の実行ではなく、`data.json` の読み込みで取得
* クリック先の記事リンクをHTTPSのURLに限定

※ 見出しが異なる別の記事、または同じ見出しでも48時間以上離れている記事は自動的には統合しません。

## セキュリティについて

v5配布物でMicrosoft Defenderの検出が報告されています。このv4.1ではコードを見直しましたが、検出原因は未特定であり、ウイルス対策ソフトに検出されないことや安全性を保証するものではありません。**検出された場合は実行せず、保護の履歴で検出対象を確認してください。例外設定や検査の無効化は不要です。**

## テスト

* Pythonの収集・地域判定・重複処理：テスト10件
* 全ブラウザ用JavaScript：構文検査
* Node.jsで重複統合・対象地域・リンク制限・設定保存形式の検査
* Chromiumのオフライン表示テストで、8エリア、分類メニュー、4列/2列への自動調整を確認

※ 公開GitHubリポジトリでの運用実験、ウイルス対策ソフトによるスキャンは行っていません。
