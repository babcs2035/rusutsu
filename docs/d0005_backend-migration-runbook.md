# 配備・バックアップ・復元の運用手順

GitHub Actions の設定を管理する開発・運用担当者向けの手順である．配備先の構成とデータの流れは [データ管理と内部 API](d0001_backend-data-architecture.md) を参照する．

## 1. 前提と保存先

既存のGitHub ActionsのSSH/Tailscale/GHCRアクセスを継続する。
VPSのホストに新たにPython・flock・age・rcloneを導入せず、既存のBashとDocker Composeを使う。
Nodeの補助処理はアプリイメージ内で実行する。
SSHユーザーのホームに書込みでき、Dockerを操作できることが前提。

| 保存先 | 内容 | 管理 |
| --- | --- | --- |
| 既存PostgreSQL volume | 基本情報、運用文書、短縮名、公開設定、認証情報、取得履歴 | 実際のvolume名を既存dbから取得し、external volumeとして再利用 |
| `crawler_artifacts` | 警告・失敗DOM | Docker volume、UID 1001の権限を配備時に準備 |
| `crawler_worker_artifacts` | 日次report、lock | 別Docker volume。古いlockを復元しない |
| `~/.local/state/rusutsu/<Compose project>/` | 自動生成した運用設定と配備成功記録 | SSHユーザー所有、0700。設定は0600 |
| `${DEPLOY_TARGET}/backups/` | VPS 内の DB コピー | ディレクトリは 0700，ファイルは 0600．Git・HTTP 配信・配備ファイルの転送から除外する |

バックアップは VPS 内に保存するため，そのディスクが失われると同じ VPS 内のコピーも失われる．

## 2. GitHubの設定

Settings → Secrets and variables → Actionsで設定する。

### 必須の新規Secrets

- `API_BEARER_TOKEN`

値は`openssl rand -hex 32`で生成した64桁の16進文字列。
短い値は、VPSへ接続する前の設定検証で拒否する。

### Variables

| 名前 | 初回 | 以後 |
| --- | --- | --- |
| `INITIALIZE_CANONICAL_DATA` | `true` | 初回成功後`false` |
| `ENABLE_CRAWL_LATEST_SCHEDULER` | 未設定または`true`で有効 | 停止時だけ`false`として再デプロイ |
| `API_BASE_URL` | 本番HTTPS URL、末尾`/rusutsu` | URL変更時だけ更新 |

`API_BASE_URL`は同名Secretでも渡せるがVariableを優先する。
省略した場合は既存appのAUTH_URLから組み立てる。AUTH_URLに/rusutsuが含まれていてもoriginへ正規化する。
無効なURL・未知のpath・HTTPは拒否する。

### 任意のログイン設定Secrets

`AUTH_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`ADMIN_EMAILS`は、空・未登録なら既存app値を維持する。
非空で登録した値だけ次回配備で上書きする。DB接続情報をGitHubから上書きする機構は設けない。
Google側のOAuth登録やHTTPSの経路を新規構築する処理は含まない。既存サイトの経路を使う。

### 既存Secrets

`DEPLOY_HOST`、`DEPLOY_PORT`、`DEPLOY_USER`、`DEPLOY_KEY`、`DEPLOY_TARGET`、
`TS_OAUTH_CLIENT_ID`、`TS_OAUTH_SECRET`、`GHCR_DEPLOY_TOKEN`、`SUBMODULES_TOKEN`を維持する。
Secrets/Variablesの保存だけではVPSは変わらず、次のCI/CD実行で適用する。

## 3. 配備処理の順序

1. CIでテスト・型・Biome・使い捨てDBへのmigrationとschema差分を検証する。
2. ARM64の最終Dockerイメージを組み立て、commit SHA付きのGHCRタグへ保存する。
3. GitHub設定を検証し、許可した項目だけJSON→Base64へ変換する。Base64値もログのマスク対象へ登録する。
4. 既存のSCP経路でComposeと運用スクリプトを送る。設定値はSSHの環境変数経由で渡し、シェル本文へ直接埋め込まない。
5. VPSで確定SHAのイメージを取得する。既存app/dbをinspectし、Compose project名と運用領域を確認する。
6. Dockerコンテナ名を原子的に確保して操作を排他する。45分の期限で終了する補助コンテナを使い、正常時は自身のIDを指定して解放する。
7. 既存`rusutsu-db`と`rusutsu-app`から、DB volume・認証情報・ポート・ログイン設定を取得する。
8. DB/appが同じprojectのdb/appであり、PostgreSQL 16のnamed volumeであること、DBとappの接続情報が一致することを確認する。
9. GitHub設定を合成した`pending.env.sh`を0600で生成する。値を安全にシェル引用し、改行・不正キーを拒否する。
10. `.env`を上書きせず、生成した環境変数でComposeを展開する。DB volumeはexternalとし、存在確認する。空volumeの自動作成を防ぐ。
11. 新しいアプリ環境から既存DBへ接続し、スキー場マスターがあることを確認する。
12. DB変更対象なら、VPS内にDBをコピーして検証する。失敗時はapp停止・migrationへ進まない。
13. app/scheduler専用のDOM volumeの権限を自動準備する。DB volumeはこの補助処理にマウントしない。
14. appとschedulerを停止し、DBを健康確認して`prisma migrate deploy`を実行する。volumeは削除しない。
15. 初回指定時だけ、文書→短縮名の順で取り込む。
16. appと、有効化指定されたschedulerを起動する。
17. 内部healthcheckと、本番HTTPSの`/rusutsu/api/ready`・`/rusutsu`の本文受信を確認する。
18. 成功時だけ設定を`runtime.env.sh`へ確定し、DB変更manifestと成功SHAを保存する。

GitHubのdeploy/backupは同じconcurrency groupを使う。
スクリプトも同じDockerロックを使い、失敗時は自分が作成したロックコンテナだけを片付ける。
SSH切断等で解放できない場合でも45分後に終了する。自動処理のタイムアウトは30分。

最終成功ログ：

```text
Deployment completed; database and /rusutsu readiness checks passed.
```

## 4. 初回の投入と再実行

本番DBを消して作り直さず、既存スキー場を維持する。
同梱JSON/GeoJSONは初回投入元として使う。本番コンテナ内だけのJSONはないため、旧コンテナからコピー・突合せする手順は不要。

DB接続なしの入力検証：

```bash
mise run db:import-documents -- --dry-run
mise run db:import-short-names -- --dry-run
```

初回はVariable`INITIALIZE_CANONICAL_DATA=true`を設定してからmainへpushする。
以後の手動実行では`initialize_data`チェックでも指定できる。
配備スクリプトが文書・短縮名の`--initialize`を実行し、成功後にVariableをfalseへ戻す。

文書は未登録キーだけ、短縮名はNULLだけを投入する。既存admin編集を上書きしない。
DB内の`canonical_data_migrations`に、`canonical-documents-v1`と`ski-resort-short-names-v1`の完了記録を残す。
再実行は`already_completed`となり、移行後に削除した文書や空に戻した短縮名を復活させない。
通常起動はimportを実行せず、DB欠損をGit版JSONで埋めない。

初回成功後に、公開画面、Googleログイン、admin保存、複数管理者の競合表示を受入確認する。
文書のversion/hashは競合確認用で、過去本文と編集者の完全な履歴は未実装。

## 5. クローラーの実行と診断

対象を指定して取得・保存する．ローカルのファイル出力と正本 API への保存はコマンドで指定する．

```bash
# 実サイト取得なしの列挙
mise run crawl:latest -- --list

# まず1件のファイル出力。子プロセスからAPI設定を取り除く
mise run crawl:latest -- --local-files --resort rusutsu-resort

# 接続先と内部 API トークンを設定した環境で正本へ保存する
mise run crawl:latest -- --remote-api --resort rusutsu-resort
```

scheduler は標準で有効である．運転を再開する場合は `ENABLE_CRAWL_LATEST_SCHEDULER` を `true` にするか削除し，通常の配備を行う．

ktakサーバーの専用コンテナで、最新情報は毎日14:00 JSTに1回実行する。
デプロイ時には古いcron設定を14時へ更新する。雪マジは本番app内で毎日03:00 JST。
起動状態と次回実行時刻は、専用コンテナの起動ログで確認する。
起動直後には実行せず、多重実行を抑止する。最新情報のスイッチは雪マジを止めない。
旧来の基本情報・天気等のコードと手動コマンドは残すが定期実行しない。
未知状態などは推測変換せず、問題のあるカテゴリを保留する。雪マジは全取得・検証成功時だけ更新する。

診断取得には`API_BEARER_TOKEN`を使う。

```bash
mise run crawl:diagnostics:pull -- --resort rusutsu-resort
mise run crawl:diagnostics:pull -- --resort yuki-magi
mise run crawl:diagnostics:pull -- --run-id <run-id>
```

取得先はGit管理外の`src/private/data/resorts-temporary/crawl_latest_dom/remote/`。
ページ生成前の失敗でもrun記録を取得できる。
DOMは機密値を除去してgzip保存し、通常30日で整理する。run/issue/hashは残る。
整理はrun/DOM投入時に動く。メール通知は未実装。
DBコピーにDOM volumeは含まれない。必要な記録を期限内に診断取得し、適切な権限で保管する。

## 6. VPS内コピーと復元試験

DB変更対象は`build-db-manifest.py`に列挙したschema/migrations/import/backfill等。
前回成功manifestとの差分、初回指定、`force_database_backup=true`、成功記録のない初回配備でコピーを取る。
通常UI変更やcrawler追加だけなら配備前コピーは不要。

`backup-database.sh`は既存db内の`pg_dump --format=custom`で取得し、空でないことと`pg_restore --list`を確認する。
配備先の `${DEPLOY_TARGET}/backups/` へ `database.dump`，`archive.list`，`metadata.json`，`SHA256SUMS` を保存する．
`local-backup.ts`がチェックサム・メタデータ・ファイル構成を照合する。
日次・手動・配備前を合わせ，検証済みの最新 7 世代を完了日時に従って保持する．取得前に空き容量を検査し，新しい世代の検証と確定後に保持整理する．破損・symlink・無関係なファイルは手動で状況を確認する．
外部アップロード・GitHub artifactへの保存・暗号鍵の利用はしない。

`Daily database backup` は毎日 03:00 JST に実行を予定する．初回の CI/CD で配備したスクリプトと設定を使う．

旧保存先 `~/.local/state/rusutsu/<project>/backups/` から移行する世代は，配備先で `DEPLOY_TARGET="$PWD" bash scripts/ops/backup-database.sh --dry-run` を実行して確認する．次のバックアップでは一世代ずつ配備先へコピーし，チェックサムと一時 PostgreSQL への復元を確認してから，その世代の旧コピーを除く．復元時は必須テーブルの存在，スキー場データが空でないこと，外部キー制約の検証済み状態を確認する．失敗時は対象の旧コピーを残し，後続世代の移行と新しい DB コピーを行わない．中断後に残った一時ディレクトリは，配備・バックアップが動作していないことと対象パスを確認してから整理する．
手動で`test_restore=true`を付けると、コピー後に同VPSで復元試験する。

復元試験はチェックサムを確認し、ネットワークなし・PGDATAがtmpfsの一時PostgreSQLへ復元する。
一時 DB でスキー場，認証，写真，申請，クロール現在値のテーブルが存在し，スキー場データが空でなく，外部キー制約が検証済みであることを確認し，試験コンテナを片付ける．
日次処理・復元試験とも新しいGitHub設定は不要。

誤削除の復旧時は、完了記録を消して全投入し直さない。
VPS内コピーを別DBへ復元して必要なデータを取り出し、最新hashを確認してadminから戻す。
本番全体の復元は、それ以降の書込みが失われる可能性があるため別の作業として判断する。

## 7. ローカルで開発するとき

既存ローカルDBをresetしない。通常URLは`http://localhost:3000/rusutsu`。
新規セットアップのseedは接続確認だけで、空DBのスキー場マスターは生成しない。
本番と同じ運用データが必要なら本番導入後にAPIモードを使う。

`.env.local`には本番API URLと`API_BEARER_TOKEN`を設定し、既存のローカルDATABASE_URLは保持する。

```dotenv
API_BASE_URL="https://実際の本番ホスト/rusutsu"
API_BEARER_TOKEN="GitHubと同じキー"
```

これは説明用の値なので実値に置き換え、Gitへ保存しない。
本番DBの接続文字列をMacへ配布しない。APIモードではローカル定期クローラーを停止する。
ブラウザーへ内部キーは返さず、表示に必要なデータだけを返す。公開される座標や料金はDevToolsでも確認できる。

## 8. 公開する変更と、失敗時の対応

アプリ，内部 API，worker の通信契約を変える配備では，対応するアプリと private submodule のリビジョンを組にする．切り戻しでも同じ組を使う．

配備先への移動で止まった場合は `DEPLOY_TARGET` と SCP 工程を確認する．workflow を修正した後は，修正済みのリビジョンを指定して新しく実行する．

失敗した場合は、Actionsの工程名と秘密を含まないエラーを確認する。
コピー前・コピー中の失敗は既存アプリを停止しない。migration以後の失敗は自動DBロールバックしない。
失敗した配備では成功SHA/manifestと正式設定を更新せず、原因修正後の再実行へ引き継ぐ。
新しい設定で起動後に応答確認だけ失敗した場合、稼働コンテナの設定が旧版とは限らない点も確認する。
DB volumeを検出できないときや接続情報が一致しないときは、明示的に止まる。
`db:reset`、`docker compose down -v`等を回避策として実行しない。
