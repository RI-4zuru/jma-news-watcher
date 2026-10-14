# 気象・防災ニュース監視 / JMA News Watcher

全国の気象・防災関連ニュースをGoogleニュースの検索RSSから収集し、分類・絞り込み・既読管理・CSV出力を行う、追加ライブラリ不要のニュースビューアです。**気象庁公式サービスではありません。**

## できること

- 指定ジャンルのニュースを自動収集し、記事の見出し・配信元・日時（JST）・リンクを表示
- 22分類に自動振り分け。住宅火災、林野火災、水難事故、黄砂、地震、津波、土砂災害、河川・浸水、竜巻、降雹、濃霧、霜、大雨、台風・暴風、大雪、高潮・高波、火山、猛暑、雷、乾燥、寒波、異常気象
- 近畿6府県・府県ごとの絞り込み、重要度・未読・直近の新着・保存記事で絞り込み
- ローカルブラウザの既読・保存管理、CSVダウンロード、表示中に限ったブラウザ通知
- Windowsの通知領域への簡易バルーン通知（動作はOS設定・実行環境に依存）
- **任意設定**のTelegramプッシュ通知（ページやPCを閉じていても、GitHubで収集が動けば通知）
- 保管7日、最大900件、同一記事の重複検出、取得失敗時のデータ保持

> **2026-10-14 修正:** Windows PowerShell 5.1 の日本語ソース読み取りでエラーにならないよう `collect.ps1` を UTF-8（BOM付き）に修正しました。以前のZIPは使わず、この修正版に置き換えてください。GitHubのセットアップは **`GITHUB-SETUP.md`** にまとめています。

## 方式の選び方

| | ローカル版 | GitHub版 |
|---|---|---|
| 追加アプリ | 不要（Windows標準PowerShell 5.1） | 不要（GitHubアカウント） |
| ニュース取得 | Windows PCで実行している時だけ | GitHub Actionsの定期実行 |
| 表示 | `site/index.html` をEdge/Chromeで開く | GitHub PagesでWeb表示 |
| 継続通知 | Windows通知（環境依存）、またはTelegram | Telegramが推奨 |
| PCを閉じた後の収集 | 不可 | 可 |
| おすすめ | 職場で開いて監視する場合 | 常時自動収集とスマホ通知が必要な場合 |

## A. Windowsでローカル運用（最も簡単）

1. ZIPを展開。`update.cmd` をダブルクリックして、初回のニュースを収集します。初回は既存記事の通知を行わず、基準データを作ります。
2. `site/index.html` をEdge/Chromeで開きます。ページ内の「表示更新」で直近の収集結果を読み直せます。開いたままなら約2分ごとに自動で読み直します。
3. 継続して監視する場合、`start-monitor.cmd` を実行します。**30分ごと**にニュースを更新します。このウィンドウを閉じると監視が止まります。
4. 更新ウィンドウを画面に出したくない場合は、Windowsの「タスク スケジューラ」で、`powershell.exe` に次の引数を付けて30分ごとに実行するタスクを作成できます。

   `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\（展開先）\JMA-News-Watcher\collect.ps1"`

   「プログラム/スクリプト」は `powershell.exe`。**ユーザーがログオンしているときのみ実行**を指定すると、Windowsの簡易通知が出やすくなります。タスクが実際に起動できるか、Windowsのタスク履歴と`site/data.json`の更新日時で確認してください。

### ローカル運用の注意点

- `site/index.html` は通信不要で表示しますが、ニュースの取得にはPowerShellから `news.google.com` へのインターネット接続が必要です。職場のフィルター・プロキシが遮断している場合は、GitHub運用が候補です。
- コマンドでの一時的な実行ポリシー指定のみで、PC全体のPowerShell実行ポリシーは変更しません。ただし組織のセキュリティ設定や管理者ポリシーには従ってください。
- バッチとスクリプトの実行が組織のルールで禁止されている場合は実行しないでください。GitHubで収集済みのWeb画面だけを閲覧する構成にしてください。
- Edge/Chromeによってはローカルファイルでのブラウザ通知が使えません。Windows通知も抑制される場合があります。その場合はTelegram通知が確実性の高い選択肢です。

## B. GitHubで自動収集・公開

1. **初めての方は `GITHUB-SETUP.md` の手順に沿ってください。** GitHubに新しいリポジトリ（例 `jma-news-watcher`）を作成します。無償のGitHub FreeでPagesを公開する場合は**Public**を選択してください。公開したくない情報を絶対にアップロードしないでください。
2. ZIPの**中身をルートに**アップロードしてください。`.github/workflows/news.yml` フォルダー構造もそのまま残してください。GitHubのWeb画面からアップロードするとドットで始まる隠しフォルダーの取り扱いに注意してください。Gitでpushする方が確実です。
3. **Settings → Pages → Build and deployment → Source: GitHub Actions** に変更します。
4. **Actions → Collect and publish weather news → Run workflow** で一度手動実行して、`collect` と `deploy` が成功したことを確認します。
5. `https://あなたのユーザー名.github.io/リポジトリ名/` で閲覧します。以降、ワークフローは原則**毎時17分（UTC）**に実行されます（遅延・スキップの可能性あり）。

`news.yml` が収集し、`store/news.json` と `site/data.js`・`site/data.json` を更新してコミットした後、GitHub Pagesに公開します。**Publicリポジトリのニュースデータは公開されます**。Telegramのトークンはコードに入れずSecretsに登録してください。

### Telegram通知（ローカル/GitHub共通・任意）

TelegramでBotFatherから自分のBotを作成し、ボットにメッセージを送ってから、`getUpdates` などで自分の `chat_id` を調べます。トークンとchat IDは外部に共有しないでください。通知は初回収集後の新着記事から送ります。

- GitHub版：**Settings → Secrets and variables → Actions → New repository secret** で `TELEGRAM_BOT_TOKEN` と `TELEGRAM_CHAT_ID` をそれぞれ登録します。**Publicなファイルや`config.json`には書かないでください。**
- ローカル版：`telegram.local.json.example` を `telegram.local.json` にコピーし、`bot_token` と `chat_id` を埋めます（`.gitignore` に登録済み）。
- メッセージには見出しとGoogleニュースのURLが入ります。通知時にTelegramのサーバーへ送信される点は認識しておいてください。

通知する重要度の下限は`config.json`の`notify_min_priority`で変更できます。`1` は幅広く通知、`2` は注目以上、`3` は重要のみ。`max_notifications_per_scan` は1回の通知に含める最大件数です。取りこぼしを避けるため通知に使わなかったニュースも一覧に記録します。

## 分類のカスタマイズ

`config.json` の `feeds` はRSS検索クエリ、`categories` は表示分類です。`pattern` は正規表現で**記事見出し**と照合します。既定の分類はキーワードによる一次仕分けであり、気象庁の警報・災害認定と同じではありません。検索クエリ内の `when:1d` で原則直近1日の検索結果を対象にしています。

- RSSごとの結果件数に上限がある可能性があります。収集間隔が長いほど取り逃がしやすくなります。
- 分類は複数付くことがあります。火災や水難事故が気象を原因とするとは限らず、**気象庁に関係し得るニュース**という広い取り方です。
- 府県判定は見出し中の都道府県名・主要地名による簡易推定です。地名がないニュースや同名地名では、誤判定・漏れがあり得ます。
- 収集したニュースはGoogleニュース経由のリンクです。出版社の元記事への直接URLとは限りません。
- `retention_days` と `max_items` で保存期間と件数上限を調整できます。ブラウザの既読/お気に入り情報は閲覧しているブラウザごとの保存で、ローカルとGitHub間で同期はされません。

## 技術上の制限

Googleニュースの検索RSSは、現在使われている公開フィード形式ですが、**公式の安定提供APIではありません**。検索結果の件数・見出し・分類は外部仕様に依存します。全件保証、リアルタイム保証はありません。GitHub Actionsのスケジュールも厳密な時刻には動かず、Publicリポジトリで60日間活動がない場合に自動無効化されることがあります。収集結果が長期間更新されない時はActionsログを確認してください。

安全のため本文の転載はせず、見出し・媒体・日時・リンクのみ保存します。RSSを取得しすぎないよう、既定ではGitHubは約1時間、ローカルは30分間隔です。利用先サービスの規約や運用制約が変わる場合は設定を見直してください。

## ファイル一覧

```
JMA-News-Watcher/
├─ update.cmd                 # Windowsで1回収集
├─ start-monitor.cmd          # Windowsで30分ごとに自動収集
├─ collect.ps1                # Windows標準PowerShell収集器
├─ collect.py                 # GitHub Actions（標準Python）収集器
├─ config.json                # 検索クエリと分類設定
├─ telegram.local.json.example
├─ site/
│  ├─ index.html              # ダッシュボード
│  ├─ data.js                 # 最新結果をブラウザに読み込む
│  └─ data.json               # 外部システムでも使用できるJSON（初回生成）
├─ store/
│  └─ news.json               # 差分検出・継続保存用（初回生成）
└─ .github/workflows/news.yml
```
