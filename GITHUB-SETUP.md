# GitHub設定ガイド

**すでに公開しているv3からv4に更新する場合は [UPDATE-v4.md](UPDATE-v4.md) を参照してください。** 以下は初回登録を中心とした説明です。

# GitHubへの登録手順（追加ソフト不要）

このフォルダの中身をGitHubにアップロードすれば、GitHub Actionsがニュースを定期収集し、GitHub Pagesから閲覧できます。**ZIPファイルをそのままリポジトリへアップロードしても実行されません。**

## 1. 新規リポジトリ

1. https://github.com/new を開きます。
2. Repository name に `jma-news-watcher` と入力します。名前は変更しても構いません。
3. GitHub Freeで公開する場合は `Public` を選び、`Create repository` をクリックします。記事見出し・分類・ニュースリンクを公開する構成です。

## 2. ファイル登録

1. ZIPを展開し、`JMA-News-Watcher` フォルダ**の中身**を開きます。
2. GitHubリポジトリ画面で `uploading an existing file` または `Add file` → `Upload files` をクリックします。
3. Windowsエクスプローラーから以下を**まとめて**ドラッグ＆ドロップして `Commit changes` をクリックします：
   - `.github`（先頭にドットが付くフォルダ。**これが最重要**）
   - `site`、`tests` フォルダ
   - `collect.py`、`config.json`、`collect.ps1`、`README.md`、`.gitignore`、`.cmd` などのファイル
4. GitHubの `Code` タブで**`.github/workflows/news.yml` が存在することを確認**します。これが表示されなければActionsは動きません。フォルダをドラッグしても入らない場合は `Add file` → `Create new file` で、ファイル名に `.github/workflows/news.yml` と入力し、手元の同名ファイルの内容を貼り付けて保存してください。

※ `telegram.local.json` は絶対にアップロードしないでください。Botの秘密情報を含む可能性があります。

## 3. GitHub Pagesを有効化

1. リポジトリの `Settings` → 左側 `Pages` を開きます。
2. `Build and deployment` → `Source` を **GitHub Actions** に切り替えます。

## 4. 初回の収集を実行

1. `Actions` タブ → 左側 `Collect and publish weather news` を開きます。
2. `Run workflow` → `Run workflow` を押します。初期アップロード時に自動実行済みの場合もあります。
3. 実行履歴に緑色のチェックが付いたら、`Settings` → `Pages` に表示されるサイトのURLを開いてください。
4. 名前を `jma-news-watcher` にした場合、URLは通常 `https://ユーザー名.github.io/jma-news-watcher/` です。

以降は **約5分ごと（UTC基準、2・7・12…分を目安）** に自動実行されます。GitHub側の都合で遅れたり、実行が省略されたりする場合があります。

## 5. スマホ等への通知（任意）

サイトの公開だけではページを閉じている間のプッシュ通知は届きません。Telegram通知を使う場合は、TelegramでBotFatherを使ってBotを作成して、自分のBotにメッセージを送信した後、Bot APIの `getUpdates` 等で自分のchat IDを確認してください。

リポジトリの `Settings` → `Secrets and variables` → `Actions` → `New repository secret` に、以下をそれぞれ作成します：
- 名前 `TELEGRAM_BOT_TOKEN`：Botトークン
- 名前 `TELEGRAM_CHAT_ID`：通知先のチャットID

**トークンはユーザーへ公開されるファイルやチャットに貼らないでください。** 初回の収集では過去記事の大量通知を避けるため通知を送りません。2回目以降の新着が通知対象です。

## 表示されないときの確認

- `Actions` にワークフローがない：`.github/workflows/news.yml` が所定の場所にあるか確認
- `Actions` が赤色：その実行を開き、失敗したステップのログを確認。ネットワークエラーなら一時的なRSS取得失敗の可能性あり
- `Persist collected data` が `Permission denied`：組織のActions権限ポリシーを確認。個人リポジトリなら `.github/workflows/news.yml` に `contents: write` があることを確認
- `Deploy website` が失敗：`Settings` → `Pages` の `Source` が GitHub Actions か確認
- ページが空：実行ログの `Successful feeds: n/17` で成功数を確認。0/17ならGoogleニュースへの接続に問題が発生している可能性あり

## 大事な制限

- Googleニュース検索RSSは網羅性・更新間隔・仕様維持が保証される公式APIではありません。速報用途での完全性は保証できません。
- GitHub FreeでPagesを使うためのPublicリポジトリは公開です。保存されるニュース一覧と分類も公開されます。
- 公開リポジトリで60日間活動がないと、GitHubによりスケジュールが自動無効化される場合があります。定期的に`Actions`と更新日時を確認してください。
- ブラウザの既読・保存状態はブラウザごとに保持され、別PCやスマホとの間では同期しません。

## 追加更新：1分表示と通知ウィンドウ

1. 新しいZIPから **`collect.py` / `site/index.html` / `site/alerts.html` / `.github/workflows/news.yml`** を既存の同名ファイルと同じ場所へ登録します。`site/alerts.html` は新規ファイルです。
2. GitHubの `Actions → Collect and publish weather news → Run workflow` で更新後の収集を実行します。完了後、サイトを再読み込みしてください。
3. サイト上部の **⚙ 設定** を開き「新着を別ウィンドウで通知」をON。ブラウザがブロックした場合はサイトのポップアップを許可し、**通知ウィンドウを開く／開き直す** を押します。
4. 通知窓は独立して1分ごとに公開済みの記事データを読み直します。閉じた場合は設定から再び開いてください。OFFにすると監視を止められます。

**時間の違い**：GitHubの収集は原則5分ごと（遅延あり）で、その後にPagesへ公開します。画面の1分更新は「公開結果を1分間隔で確認する」意味です。1分以内のニュース速報を保証するものではありません。
