# やること手順書：GitHubの設定からRusutsuを移行する

**あなたがまずすることは、GitHubにAPIキーを3つ登録し、初回のスイッチを設定することです。**
外部バックアップ先の契約、暗号鍵の準備、友人への事前の設定依頼は、この手順にはありません。
仕組みから知りたい場合は、別冊の[基本から理解する解説書](backend-migration-explained.md)を読んでください。

この手順は、既存のGitHub ActionsからVPSへ公開できており、本番のアプリとDBが残っている環境を対象にしています。
新しいコードを最初に1回公開する必要があります。**GitHubの設定を変えるだけで、Macにある未公開のコードが本番へ届くわけではありません。**
コードの準備と公開作業は開発担当に任せ、その後の設定変更はGitHubの画面から行えます。

## 0. 今回の方針と、役割分担

| 項目 | 今回の扱い |
| --- | --- |
| 今あるDB | データを残して使い続ける。空のDBに作り直さない |
| 外部バックアップ | 取らない。外部サービスへDBを送らない |
| VPS内のバックアップ | DB変更前と毎日、同じVPS内に自動でコピーする。追加設定は不要 |
| 新しいAPIキー | あなたがGitHub Secretsに登録する |
| 今のDB接続・Googleログイン設定 | 公開処理が既存コンテナから引き継ぐ |
| 保存用フォルダー・実行権限 | 公開処理が自動で用意する |
| VPSへの直接ログイン | 通常の移行手順では不要 |

VPS内のコピーは、移行失敗や誤編集から戻すためのものです。同じVPSのディスク全体が壊れた場合には使えません。
これは「外部には保存しない」という今回の方針による違いです。

この改修はまだ本番へ反映していません。本番の設定や接続を実際に確認するのは公開時です。
既存のSSH接続・Dockerの権限などに問題がある場合は、その具体的なエラーが出てから対応します。

## 1. APIキーを3つ用意する

**作業する場所：あなたのMacの「ターミナル」。**
APIキーは、プログラムが「許可された相手です」と伝えるための長い合言葉です。
今回の3つは用途が違うので、別々の値にします。

1. Macで「ターミナル」を開く。
2. 次の1行を入力し、Enterを押す。

```bash
openssl rand -hex 32
```

3. 表示された64文字の英数字をコピーし、次の「2」で1つ目のSecretに登録する。
4. 同じコマンドをもう一度実行して2つ目を登録し、さらにもう一度実行して3つ目を登録する。

**同じ出力を3か所に貼るのではなく、毎回生成します。**
これらはMacのパスワードやGoogleのパスワードとは別物です。
公開する資料やチャットに貼らず、安全なパスワード保管先に保存してください。

## 2. GitHub Secretsに登録する

**作業する場所：ブラウザーのGitHub。**

1. GitHubで `babcs2035/rusutsu` を開く。
2. 上部の **Settings** を開く。
3. 左側の **Secrets and variables → Actions** を開く。
4. **Secrets** タブを選ぶ。
5. **New repository secret** を押す。
6. NameとSecretに、下の表の内容を入力して保存する。

| Name：そのままコピーする名前 | Secret：入力する値 |
| --- | --- |
| `INTERNAL_DATA_API_ADMIN_TOKEN` | 1回目に生成した64文字 |
| `INTERNAL_DATA_API_CRAWLER_TOKEN` | 2回目に生成した64文字 |
| `INTERNAL_DATA_API_DIAGNOSTICS_TOKEN` | 3回目に生成した64文字 |

同名のSecretがある場合は編集します。Secretの値は、保存後にGitHubから読み直せません。
入力画面の説明は[GitHub公式のSecrets手順](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)にもあります。

### すでに登録されている次の値は、そのまま使う

従来の公開で使っている設定です。今回のAPIキーをこれらの欄に貼らないでください。

| 既存のSecret | 役割 |
| --- | --- |
| `DEPLOY_HOST`、`DEPLOY_PORT` | VPSへの接続先 |
| `DEPLOY_USER`、`DEPLOY_KEY` | VPSへ接続するアカウントと鍵 |
| `DEPLOY_TARGET` | VPS上で公開用ファイルを置く場所 |
| `TS_OAUTH_CLIENT_ID`、`TS_OAUTH_SECRET` | VPSまでの通信経路を用意する設定 |
| `GHCR_DEPLOY_TOKEN` | 実行用パッケージをVPSへ取得するための鍵 |
| `SUBMODULES_TOKEN` | `src/private`も取得するための鍵 |

`DEPLOY_TARGET`はURLではなく、VPS内のフォルダーの場所です。
例えば`~/rusutsu`の`~`は、VPSに接続するユーザーのホームフォルダーを表します。
今回の修正版はこの書き方にも対応しています。実際の場所が分かっている場合は、
`/home/ユーザー名/rusutsu`のように`/`から始まる絶対パスでも指定できます。
Mac上のパスや、この例をそのまま貼るのではなく、従来の配置先を使ってください。

**完了の目印：新しい3つの名前がSecrets一覧にあり、既存の接続設定も残っている。**

## 3. 初回のスイッチと、本番URLを登録する

**同じSettings画面の、今度はVariablesタブを使います。**
Secretsは秘密の値、Variablesは公開されても困らない設定を入れる場所です。

1. **Variables** タブを選ぶ。
2. **New repository variable** を押す。
3. 次の3つを登録する。同名のものがあれば編集する。

| Name | Value | 意味 |
| --- | --- | --- |
| `INITIALIZE_CANONICAL_DATA` | `true` | 初回だけ、料金・レビュー等のファイルと短縮名をDBへ取り込む |
| `ENABLE_CRAWL_LATEST_SCHEDULER` | `false` | 最新営業情報の全件自動収集は、動作確認が終わるまで止める |
| `DATA_API_BASE_URL` | あなたの本番サイトのURL。例：`https://example.com/rusutsu` | APIと公開後の動作確認の接続先 |

`true`はON、`false`はOFFです。半角小文字で、引用符を付けずに入力します。
URLは、普段ブラウザーで開く本番サイトのアドレスを確認して入力します。`example.com`は説明用なので、そのまま使いません。
末尾は`/rusutsu`です。ローカルの`localhost`は入力しません。

URLは未登録でも、現在のGoogleログイン設定のURLから自動で引き継げる場合があります。
この手順では、接続先が自分にも分かるように明示しておきます。

Variablesの画面は[GitHub公式の変数設定手順](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables)でも確認できます。

**完了の目印：初回がtrue、全件収集がfalse、本番URLが登録されている。**

## 4. コードの確認と、最初の公開を開発担当に依頼する

**あなたがGitの複雑な操作や、VPSのコマンドを手入力する必要はありません。**

この段階で依頼する内容は次のとおりです。

```text
新しいAPIキー3つと、初回用のGitHub Variablesを登録しました。
外部バックアップを使わない版の公開前確認を進めてください。
親リポジトリと src/private の必要な変更がそろっていることを確認してください。
実行用Dockerイメージのビルド・起動など、未完了の確認があれば先に終えてください。
既存のデータや私の未コミット変更は保全してください。
公開する変更と確認結果を提示し、まだ本番には反映しないでください。
```

検証結果を確認し、公開できる状態になったら、開発担当へ本番反映を依頼します。
管理画面で編集する人に切替時間を伝え、その間の保存・手動クローラーを止めてもらいます。
反映中はアプリを入れ替えるため、一時的にサイトを利用できない時間があります。

公開は、`src/private`の必要な変更を先にcommit・pushし、それを参照するアプリ本体を`main`へpushする順です。
`main`は公開用のブランチです。変更を送ると、GitHub Actionsが自動で検査と公開を始めます。
この手順書を開いただけで公開処理が始まることはありません。

### 公開中に見る場所

GitHub上部の **Actions → CI/CD** で、今回の実行を開きます。
次の3つがすべて成功するまで待ってください。

| 表示名 | やっていること |
| --- | --- |
| `Code Quality Checks` | プログラムとDB変更の検査 |
| `Build and Push Image` | サーバーで動かすパッケージの作成 |
| `Deploy Image to VPS` | 設定の引き継ぎ、VPS内のDBコピー、DBの追加変更、初回データ取り込み、アプリ起動・応答確認 |

最後の処理の`Deploy via SSH`に、次の文が出れば公開処理は成功です。

```text
Deployment completed; database and /rusutsu readiness checks passed.
```

失敗した場合は、下の「困ったとき」を参照します。

**完了の目印：最後のDeploy Image to VPSまで成功している。**

## 5. 初回設定を戻し、画面とバックアップを確認する

1. GitHubのVariablesで、`INITIALIZE_CANONICAL_DATA`を`false`に戻す。この変更だけのために再実行する必要はありません。
2. 本番の`/rusutsu`を開き、地図・一覧・スキー場詳細を確認する。
3. 本番の`/rusutsu/admin`でGoogleログインする。
4. 実際に直したい情報を1つ保存し、画面を開き直して変更が残ることを確認する。
5. 公開画面にも反映されたことを確認する。複数人で管理する場合は、各管理者のログインも確認する。
6. 確認が済んだら、編集している人に利用再開を知らせる。

短縮名や公開・非公開の設定は、`/rusutsu/admin/resort`で変更できます。

### VPS内のコピーから戻せるか、一度確認する

1. GitHubの **Actions → Daily database backup → Run workflow** を開く。
2. ブランチは`main`、`test_restore`にチェックを入れて実行する。
3. 成功したことを確認する。

これで、VPS内にDBコピーを作り、さらに別の使い捨てDBへ戻せるかを自動確認します。
本番DBに上書きする操作ではありません。秘密鍵の入力やバックアップのダウンロードも不要です。
初回のCI/CDが成功してから実行してください。
手動実行の画面は[GitHub公式の操作説明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)でも確認できます。

**完了の目印：公開画面・ログイン・保存と、VPS内のバックアップ・復元試験が成功している。**

## 6. 少数のクローラーを試してから、自動収集を有効にする

開発担当に「まず1スキー場をMacのファイルに保存して確認し、その後1件、次に数件を本番へ保存して確認する」と依頼します。
公式サイトへの取得と本番データの更新を行うため、対象を決めて実施します。
詳細なコマンドは[運用手順書](backend-migration-runbook.md)にあります。

確認が済んだら、次の操作で全件の定期実行を始めます。

1. Variablesの`ENABLE_CRAWL_LATEST_SCHEDULER`を`true`にする。
2. `INITIALIZE_CANONICAL_DATA`は`false`であることを確認する。
3. **Actions → CI/CD → Run workflow** を開く。
4. ブランチを`main`にし、`initialize_data`と`force_database_backup`はチェックせず実行する。
5. 最後の公開処理まで成功したことを確認する。

**設定変更とRun workflowの両方が必要です。設定を保存しただけでは、稼働中のアプリは変わりません。**

| 自動処理 | 日本時間 | 開始するタイミング |
| --- | --- | --- |
| VPS内のDBコピー | 毎日01:15 | 初回の公開後。GitHub側の都合で遅れる場合がある |
| 雪マジの取得 | 毎日03:00 | 初回の公開後。最新情報スイッチとは別に動く |
| 最新営業情報の全件取得 | 毎日07:00 | 全件収集をtrueにして再公開した後 |

起動直後にはクロールせず、次の予定時刻に実行します。雪マジは初回公開後の次の03:00から動きます。
翌日の実行結果も開発担当と確認してください。

## 7. 移行後、普段やること

| 用事 | 操作 |
| --- | --- |
| 料金・レビュー・短縮名などの編集 | 本番管理画面で保存する。Gitへのpushは不要 |
| 閉業した施設を公開から外す | 管理画面で公開をOFFにする。データは残る |
| プログラムの変更 | Macで修正・検証してGitHubへ送る |
| APIキーの変更 | GitHub Secretsを更新して、CI/CDをmainに対して手動実行する。Mac側で使っているキーも合わせる |
| 自動収集の停止 | 最新情報のVariableをfalseにして、CI/CDを手動実行する。雪マジはこのスイッチの対象外 |
| コピーの成功確認 | ActionsのDaily database backupで直近の成功日時を見る |
| 復元の確認 | 必要時にDaily database backupをtest_restore付きで手動実行する |

### ログイン設定をGitHubから変更したい場合

次のSecretsは任意です。**登録しなければ、既存アプリの値を引き継ぎます。**
分からない値を入力して埋める必要はありません。

| Secret | 変更する場合の内容 |
| --- | --- |
| `ADMIN_EMAILS` | 管理者のGoogleメールアドレス。複数ならカンマ区切り |
| `AUTH_SECRET` | ログイン処理の秘密鍵。通常は既存値を維持する |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` | 既存Google OAuthアプリの認証設定を更新するときに使う |

変更後はCI/CDをmainに対して手動実行します。
本番ドメインやGoogle OAuthアプリ自体を変える場合は、Google側の登録URLなども合わせる作業があります。

## 困ったとき

| 止まった場所・内容 | 最初に見るもの |
| --- | --- |
| Prepare production settingsで失敗 | APIキー3つが64文字で、すべて違う値か |
| 本番URLのエラー | DATA_API_BASE_URLがHTTPSで、末尾が/rusutsuか |
| 既存のログイン設定がない | エラーに示された同名Secretを登録する。分からない場合は開発担当と確認 |
| `Login Succeeded`の後に`cd: ... no such file or directory` | `DEPLOY_TARGET`への移動失敗。下の説明を参照 |
| SSH接続やDockerの権限で失敗 | 従来の公開用Secretsと接続状況。VPS側の対応が必要と判明した場合だけ、その内容を友人に依頼 |
| 既存DB・volume・接続の確認で失敗 | 開発担当に実行URLとエラーを渡す。空DBで代用しない |
| VPS内バックアップで失敗 | 開発担当がディスク容量やDBの状態を調べる。外部保存先を設定する必要はない |
| 公開後の応答確認で失敗 | 本番URLと、失敗した工程を開発担当へ渡す |

エラーを伝えるときは「この手順書の何番か」「Actionsの実行URL」「秘密を含まないエラー文」があれば十分です。
APIキー、パスワード、設定ファイルの全文は貼り付けません。
DBを消す`db:reset`や`docker compose down -v`を実行せず、原因を確認してから再実行します。

### `Login Succeeded`の後、配置先への移動で止まる場合

SSH接続とイメージ保管場所へのログインは成功しています。
`cd`は「フォルダーへ移動する」命令で、ここで止まった場合は、
その実行では`deploy.sh`によるアプリの起動し直しやDB移行はまだ始まっていません。

以前の実装には、`DEPLOY_TARGET`が`~/...`だと、ファイル転送は成功しても
その後の移動では`~`をホームフォルダーとして扱えない不具合がありました。
画面では値が`***`に隠れるため、この原因か別のパス間違いかはログだけでは断定できません。

1. 修正版のワークフローをGitHubの`main`へ反映します。pushでCI/CDが始まった場合は、その実行を確認します。
2. 手動で実行する場合は、ActionsのCI/CDで`main`を選び、**Run workflow**を押します。
   古い失敗実行の**Re-run jobs**では、修正前のコードが使われるため直りません。
3. 修正後も`DEPLOY_TARGET directory is unavailable`で止まる場合は、
   GitHub Secretsの`DEPLOY_TARGET`が実際のVPSの配置先を指しているか確認します。
   分からない場合は、直前の`Deploy package via SCP`のログも開発担当に渡してください。

APIキーの作り直しは不要です。`INITIALIZE_CANONICAL_DATA`などの初回設定は、
初回デプロイが成功するまで元の手順どおりに保ちます。

仕組みを理解したい場合は[解説書](backend-migration-explained.md)、
開発担当向けの具体的な操作は[運用手順書](backend-migration-runbook.md)を参照してください。
