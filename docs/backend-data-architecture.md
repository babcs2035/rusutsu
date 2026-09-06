# バックエンドとクローラーのデータ管理

## まず結論

この資料は実装済みの移行仕様を説明する。本番への導入・本番DBへの適用は未実施であり、
本番稼働を確認した記録ではない。

現在の本番PostgreSQLをそのまま1つの「正本」にする。Dockerコンテナは今後も使い続けるが、永久に残すデータをアプリコンテナの中に直接置かない。

実際のローカル復旧、本番移行、API接続、クローラー運用の順序は
[`backend-migration-runbook.md`](backend-migration-runbook.md) を参照する。

- アプリのプログラム: 交換可能な `app` コンテナ
- スキー場情報、編集したJSON/GeoJSON、クロール結果: PostgreSQLの永続volume
- 警告・失敗時のDOM: 非公開の永続volume（将来はobject storageへ移行可能）
- クローラーとアプリのコード: GitHub

Dockerを使うことと、DBを永久に残すことは両立する。コンテナはプログラムを動かす箱、volumeは箱を交換しても残る保管場所である。

## 通信の流れ

```text
本番の管理画面
  ブラウザー -> 本番Next.js -> 本番PostgreSQL

ローカルの管理画面
  ブラウザー -> ローカルNext.js
                    -> HTTPS + admin-dataトークン -> 本番Next.js
                                               -> 本番PostgreSQL

本番のcrawl_latest専用scheduler（毎日07:00 JST）
  crawler -> HTTPS + crawler-ingestトークン -> 本番Next.js -> 本番PostgreSQL

診断DOMの取得
  CLI -> HTTPS + diagnostics-readトークン -> 本番Next.js
```

3種類のAPIトークンはサーバー専用の `.env.local` や `.env` に置き、Next.jsのサーバー側や対象CLIだけが読む。`NEXT_PUBLIC_` を付けない。ブラウザーから本番APIを直接呼ばないため、ChromeのNetworkに本番APIのAuthorization headerは出ない。3つには必ず別々の値を設定し、クローラーへ管理用トークンを渡さない。旧共通トークン
`INTERNAL_DATA_API_TOKEN` は廃止しており、新規環境でも受け付けない。

ここでServer Actionsを全部なくす必要はない。管理画面のボタンから同じNext.jsへ送る
入口にはServer Actionsを使い続け、その中から正本がある本番サーバーへ内部APIを呼ぶ。
つまり、秘密のAPIトークンを持つのはブラウザーではなくNext.jsサーバーである。

## Chromeからデータが見える範囲

画面に描画するためブラウザーへ送ったデータは、APIでもServer Actionsでも利用者が確認できる。Server Actionsは「JSONを絶対に見えなくする仕組み」ではない。

そのため次の境界にする。

- 診断DOM、管理用の元JSON、管理情報は一般利用者のブラウザーへ送らない。
  管理者が編集に使う情報は認証済みの管理画面へだけ渡す。
- 一般画面には必要な項目を列挙した公開データだけを返す。スキー場のDB問い合わせと
  remote API応答は同じ公開項目一覧を使い、DBや管理画面に新しい列を追加しても自動公開しない。
- 料金は内側の項目も含めて公開対象を列挙する。料金計算に必要な営業時間と出典URL・タイトルは
  維持し、資料のローカルパス、調査担当への申し送り、未知の管理フィールドは送らない。
- 詳細画面には旧Weatherの元JSON、旧LatestReport、内部の作成・更新時刻を含めない。
  旧weather取得のServer Actionは管理者専用である。
- 管理用APIはトークン、管理画面の変更はAuth.jsの管理者権限で毎回確認する。
- コース線の座標のように、ブラウザー上で地図を描画するため必要な値は完全に秘匿できない。生ファイルと不要な属性を送らないことで露出範囲を減らす。

## `crawl_latest` のDB保存

クロール1回を上書きせず履歴として保存し、コース・リフト・天気・コメントごとに「現在採用中の正常値」を指す。

```text
CrawlLatestRun                 1回の実行と元payload
  ├─ CrawlLatestCategorySnapshot  カテゴリ別の成功/空/失敗
  ├─ CrawlLatestIssue             警告・エラー
  └─ CrawlLatestArtifact          失敗DOMの保存先・hash・size

CrawlLatestCurrent             カテゴリ別の最新正常snapshot
```

例えば新しい実行でリフトだけ取得に失敗した場合、コースの現在値だけを更新し、リフトは前回の正常値を維持する。Wayback検証の値は履歴に残すが、本番表示の現在値にはしない。

クローラー側の判定だけには依存せず、API側でも保存直前に再検証する。未知または欠落した
営業状態、重複名、実値のない天気、空コメントは警告履歴へ記録し、そのカテゴリを現在値へ
昇格させない。ほかの正常カテゴリは更新できる。

同じクローラーコードは、保存先を明示してローカルでも実行できる。

```bash
# API設定を意図的に無効化し、ローカルファイルへ保存する
mise run crawl:latest -- --local-files --resort rusutsu-resort

# DATA_API_BASE_URLの本番APIへ送る（専用環境だけで使う）
mise run crawl:latest -- --remote-api --resort rusutsu-resort
```

ローカルファイルモードの正常結果は
`src/private/data/resorts-temporary/latest_data/<resort-id>/<日時>.json` に残る。警告があれば
正常結果と混ぜず、通常は
`var/crawler-artifacts/crawl_latest_dom/<resort-id>/` 以下に生結果、警告理由、
レンダリング済みDOMを隔離する。このため、コード変更時はVS Code上で結果と公式DOMを並べて
確認できる。このJSONは
ローカル検証用であり、GitHub経由で本番値にするものではない。本番への反映はremote API経由に
限定する。

## 管理画面で編集するJSON/GeoJSON

リフト券、レビュー、コース、リフト、対応表、参考リンクなどの運用データは、
PostgreSQLの `DataDocument` に保存する。従来ファイルの相対パスをキーにし、JSON本体、
hash、versionを持つ。Git側のファイルは初回投入元または開発用fixtureとして残す。

- 本番Next.jsは本番DBを直接使う。`DATA_API_BASE_URL` を設定したローカルNext.jsは、
  同じ本番データを内部APIから読み書きし、本番DBへ直接接続しない。
- DBに文書がなければ欠損として扱う。通常運用ではGitファイルへの実行時fallbackはない。
  公開用の最新状況も `CrawlLatestCurrent` を使い、ローカルの検証JSONへ戻らない。
- 2人が同じ文書を編集した場合はhashで競合を検出し、後から保存した人へ再読込を案内する。
  スキー場マスターは `updatedAt` を比較し、どちらも無言で上書きしない。
- 関連する文書はtransactionでまとめて保存する。コース・リフトでは公開画面用の派生情報も
  更新し、元の `slope_10m` 文書をそのままブラウザーへ送らない。
- 保存・初回投入時に、安全なキー、UTF-8のサイズ、JSON/GeoJSONの形式、hashを検証する。

### 初回投入と通常起動の分離

初回投入は `--initialize` を指定した明示処理である。全ファイルを検証した後、未登録文書の
追加と `CanonicalDataMigration` の完了記録を同じtransactionで確定する。既存のadmin編集は
保持し、失敗すれば追加と完了記録をともに取り消す。

完了記録は `canonical-documents-v1` と `ski-resort-short-names-v1` の2種類である。
同じ処理を再実行しても完了済みなら書き込まない。文書を削除しても完了記録は残るため、
次回deployや再実行でGit版が復活しない。通常のコンテナ起動と `mise run setup` は
初回投入を実行しない。

```bash
# ファイルの形式・件数・hashを検証する。DBへの接続も書込みもない。
mise run db:import-documents -- --dry-run
mise run db:import-short-names -- --dry-run

# バックアップ後、正本サーバーの初回移行で明示する処理
node --import tsx scripts/importCanonicalDataDocuments.ts --initialize
node --import tsx scripts/importSkiResortShortNames.ts --initialize
```

本番コンテナ内だけに存在するJSON/GeoJSONはない。旧コンテナからJSONをコピーしたり、
ローカル版と突き合わせたりする移行作業は不要である。

空のDBにスキー場マスターを再構築する古いクローラーは実行しない。必要な環境では
DBバックアップを復元して基本情報を確保する。文書投入は基本情報が空なら停止し、
短縮名投入は対応するスキー場IDがなければ全件停止する。復旧も完了記録を消してGit版を
一括再投入せず、DBバックアップの復元または必要な文書を選んだadminでの復元を使う。

開発専用の例外として `DATA_DOCUMENT_ALLOW_BUNDLED_FIXTURES=true` を指定すると、
初回投入前の開発DBに限って同梱fixtureを読む。本番環境と完了記録のあるDBでは無効である。
ローカルDBは使い捨ての検証・認証用に置くことができるが、別の運用正本にはしない。

### 地図・比較の短縮名

短縮表示名は `SkiResort.shortName` に保存する。`SkiResortNameAliases.json` の113件は
初回投入元であり、実行時やクライアントからはimportしない。初回は未設定の値だけを設定し、
以後は `/admin/resort` から編集する。未設定なら既存の正式名を使い、地図ラベルでは
従来どおり「スキー場」の文字を省く。

短縮名は公開情報であり秘匿対象ではない。旧称や外部サイトの複数の別名が将来必要なら、
`shortName` に詰め込まず別の `SkiResortAlias` テーブル等で扱う。閉鎖・廃止した施設も削除せず、
`isActive=false` で公開一覧・詳細から除外する。adminでは確認・再有効化できる。

## DOMの保存

正常かつ無警告のDOMは保存しない。次のどれかが起きた実行だけ保存する。

- ページ取得や必須selectorが失敗した
- 必須の名前や状態がない
- 辞書にない状態文字列が来た
- 件数、重複、URL、値の範囲などの検証で警告が出た
- クローラー自身が `console.warn` または `console.error` を出した

DOM本体は大きなバイナリデータと同じ扱いとし、PostgreSQLには本体ではなく「どのスキー場で、いつ、なぜ、どこに保存したか」とhash・sizeを記録する。これによりDBのバックアップをDOMで肥大化させない。

CodexやClaude Codeで調査するときは、本番volumeへ直接入る必要はない。内部API経由で
必要なDOMだけ、Git管理外のローカルフォルダーへ取得できる。

```bash
mise run crawl:diagnostics:pull -- --resort <ski-resort-id>
# または
mise run crawl:diagnostics:pull -- --run-id <crawl-run-id>
```

保存先は
`src/private/data/resorts-temporary/crawl_latest_dom/remote/` である。取得後はVS Code上で
DOMとクローラーコードを並べて確認・修正できる。

### 診断DOMの保存期間と自動整理

DOMの保持期間は既定30日で、`CRAWLER_ARTIFACT_RETENTION_DAYS` で変更する。
アップロード後などの整理時に期限を過ぎたDOM参照を外し、run・issue・hash等の履歴は保持する。
整理は取込みに伴って動くため、30日を過ぎた瞬間に全ファイルが消える意味ではない。

DBから参照されなくなったgzipは、最終更新から24時間以上経過したものだけを削除する。
削除直前にも参照を確認し、新規アップロードや参照中のファイルを保護する。
整理は1時間に最大1回で、PostgreSQLのロックにより重複実行を避ける。
Cookie、Authorization、API key、フォーム値等はDOM保存前に除去し、正常・無警告時には保存しない。

`crawler_artifacts` はDBとは別のvolumeである。重要な調査中DOMは期限前に診断APIで取得し、
必要に応じて別途暗号化して保管する。DBバックアップだけではDOM本体を復元できない。

## 定期実行するクローラー

「コードを残すこと」と「自動で動かすこと」は別である。

- 従来のクローラー本体と `mise run crawl:*`、`crawl:all` は削除せず、必要時に手動実行
  できる状態で残す。
- アプリ内の従来スケジューラーが自動実行するのは、毎日03:00（JST）の
  `crawlYukiMagi.ts` だけにする。コンテナ起動直後には実行しない。
- 複数コンテナが同時に03:00を迎えても、PostgreSQLのロックで同じクローラーの重複実行を
  防ぐ。アプリが03:00に停止していた場合の再実行はしないため、将来複数台運用にするなら
  外部の単一schedulerへ移す。
- 雪マジは取得・検証がすべて成功したときだけDBを更新する。0件、取得失敗、形式異常なら
  既存DBを変更しない。
- 各スキー場の `crawl_latest` は別系統である。現在の93本は、段階試験後に `crawlers` profileを有効化した
  `crawl-latest-scheduler` コンテナが毎日07:00（JST）に実行し、結果を内部APIへ送る。
  schedulerは起動直後には実行せず、同日二重実行と前回バッチへの重複を避ける。
- 実行対象は `resorts/*.ts` から自動列挙し、`template.ts`、`*_before.ts`、テストファイルは
  除外する。現在93本だが、条件を満たすクローラーを追加すれば対象数も増える。

専用schedulerにも `DATA_API_BASE_URL` と
`INTERNAL_DATA_API_CRAWLER_TOKEN` を設定する。これにより正常結果はDBへ、警告・失敗DOMは本番の
非公開volumeへ送られる。schedulerへ本番DBの接続文字列、admin用トークン、diagnostics用
トークンは渡さない。日次lockとバッチレポートは `crawler_worker_artifacts` volumeへ保存する。

## GitHubに残すもの

- Next.js、DB schema、migration、クローラーのコード
- 名寄せ辞書、検証ルール、少数のテストfixture
- 移行前のJSONの凍結アーカイブ

ここでいう名寄せ辞書は、同じ施設・コース・リフトが外部サイトとアプリで違う名前になって
いる場合の「名前の対応表」である。用途を混同しない。

- `SkiAreaNameDict.json` は、DB上のスキー場名と雪マジ側の施設名を結ぶ。
- 各 `crawl_latest/resorts/*.ts` の `courseNameMap` / `liftNameMap` は、公式ページの名前を
  クローラーが出す統一名へ変換する。
- `latest_status_mapping` はクロール名とGeoJSON上の線を結ぶ運用データであり、移行後は
  PostgreSQLの `DataDocument` が正本になる。
- `SkiResortNameAliases.json` は `SkiResort.shortName` への一度限りの投入元である。
- `SkiResortReadings.json` と `SkiResortWeatherIds.json` は、ふりがな・旧称表示や外部の
  天気サービスへのリンク生成に使う静的補助設定として残す。admin編集する運用文書とは別扱いにする。
- `src/private` はprivate crawler code、対応辞書、初回fixtureを保管するsubmoduleとして残す。
  commitする際はsubmodule側の必要な変更を先にcommit・pushし、親のgitlinkを更新する。

検証ルールは、名前・状態の欠落、`○`・`△`・`×`以外の未知状態、重複、想定件数との差、
空カテゴリ、不正URL、天気値の欠落や異常範囲などを検知するコードである。警告があるカテゴリを
正常な現在値へ昇格させず、前回の正常値を守るためにGitでレビュー・変更履歴を管理する。

運用開始後の最新値やadmin編集をGit側へ戻す必要はない。DB dumpは認証情報も含む機密資料として扱い、GitやGitHubへcommitしない。

つまりGitHubが不要になるわけではない。GitHubはコード、DBの構造変更、初回投入用データ、
履歴の保管場所であり、PostgreSQLは運用中の最新データの保管場所になる。通常deployは初回投入を実行しない。初回の成功確認後は
`INITIALIZE_CANONICAL_DATA` を削除またはfalseに戻す。

## GitHubからの本番設定

APIキー3つはGitHub Actionsの同名Secretsへ登録する。各64桁の異なる16進文字列を要求する。
本番URLはVariable `DATA_API_BASE_URL`へ指定でき、省略時は既存appのAUTH_URLから組み立てる。
初回の `INITIALIZE_CANONICAL_DATA=true` と、段階試験後の `ENABLE_CRAWL_LATEST_SCHEDULER=true` はVariablesで制御する。
任意のログイン設定Secrets（AUTH_SECRET、GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET、ADMIN_EMAILS）は、非空で指定したものだけ更新する。

GitHub設定を検証し、許可した値だけをマスク対象のBase64 JSONとしてSSH環境変数で渡す。
VPSでは既存app/dbをinspectし、DB接続情報・実volume名・Compose project・ポート・ログイン設定を取得する。
app/dbのprojectと接続情報が一致し、PostgreSQL 16のnamed volumeであることを確認する。
未知の環境を空DBで代用せず、明示的に停止する。Composeのpostgres_dataは検出した実名のexternal volumeとする。

生成設定はSSHユーザーの `~/.local/state/rusutsu/<project>/pending.env.sh` に0600で置く。
シェルの値として引用し、改行や不正なキーを拒否する。旧 `.env` は上書きしない。
Composeは `--env-file /dev/null` と生成済み環境変数を使い、値のdotenvでの再解釈を避ける。
成功後だけ `runtime.env.sh` へ確定する。設定とコピーのフォルダーは0700で、Git作業ツリー外に置く。
ホストへのPython・flock・age・rcloneの導入や `/etc` の手作業は不要。Nodeの補助処理はアプリイメージ内で実行する。

本番appはDBへ直接接続し、DATA_API_BASE_URLは接続用に渡さない。schedulerにはAPI URLとcrawlerキーだけを渡す。
MacのNext.jsには管理用、診断取得ツールにはdiagnostics用を設定する。非loopback接続はHTTPS必須。
既存のHTTPS経路・SSH/Docker権限・本番コンテナが利用できることを前提とし、VPSやOAuthサービスを新規構築する処理は含まない。

詳しい操作は[やること手順書](backend-migration-beginner-guide.md)、基本用語と図は[解説書](backend-migration-explained.md)を参照する。

## VPS内のコピーとデプロイの自動化

外部バックアップは行わない。DB変更前および日次のコピーは同じVPS内に残す。
VPSのディスク全体の故障への復旧は対象外で、外部保存先や暗号鍵の設定は不要である。

DB変更の判定は最後に正常配備した内容と、次の明示pathのhash一覧を比較する。

- `prisma/schema.prisma`、`prisma/migrations/**`
- `scripts/backfills/**`、`scripts/import*.ts`、`scripts/canonicalImport*.ts`（テストを除く）
- `src/server/data-documents/initialization.ts`

初回投入指定 `initialize_data=true` / `INITIALIZE_CANONICAL_DATA=true`、
一括変更用の `force_database_backup=true`、成功履歴がない初回配備でもコピーする。
UI変更やcrawlerファイル追加だけなら、配備前コピーは省く。

`backup-database.sh`は既存db内でPostgreSQL custom-format dumpを取り、空でないことと `pg_restore --list` を検証する。
保存先は運用領域の `backups/`。database.dump、archive.list、metadata.json、SHA256SUMSを0600で置く。
`local-backup.mjs`で構成・チェックサムを確認し、完了した世代だけを確定する。
30世代と最低7日を保持し、破損・symlink・無関係なファイルは保持整理で消さない。
コピーが失敗すればapp停止・migrationへ進まない。外部転送やGitHub artifact保存は行わない。

`Daily database backup`はpushのない日も毎日01:15 JSTに実行する。GitHub側で遅れる場合がある。
手動の `test_restore=true` で、同VPS内の別の使い捨てPostgreSQLへ実復元する。
この試験DBはネットワークなし・PGDATAがtmpfsで、本番volumeを使わない。自身の試験コンテナだけ片付ける。
DOM本体はこのDBコピーに含まれず、通常30日保持と必要な診断取得で扱う。

配備とコピーはGitHubのconcurrency groupを共有する。
VPSでもprojectごとに固有名のDockerロックコンテナを確保し、終了時に自身のIDで削除する。
SSH切断時にも45分で終了する期限を設ける。自動処理は30分でタイムアウトする。

配備順は、CI → image取得 → 既存設定の確認・合成 → 既存DBへの接続検証 → 必要時VPS内コピー →
DOM volume権限準備 → app/scheduler停止 → migration → 明示時のみ初回取り込み → 起動 → 公開HTTPSでの応答確認。
正常終了時のみ正式設定・成功SHA・DB変更manifestを更新する。失敗時に自動でDB全体を巻き戻さない。
本番appの通常起動はサーバー起動だけで、毎起動のimportは行わない。

メール通知は未実装。日次実行と診断記録を確認する。
具体的な操作と復旧判断は[運用手順書](backend-migration-runbook.md)を参照する。
