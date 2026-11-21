# バックエンドとクローラーのデータ管理

旧称・ふりがなは`SkiResortRubySegment` / `SkiResortFormerName`の専用テーブルに保存する。
スキー場IDと表示順を複合主キーとし、文字・読みを個別の文字列列に格納する。旧称とその読みには検索用indexを持つ。
読みの確認状態だけは`SkiResort.readingNeedsReview`に保存する。
`20260906120000_add_resort_readings`で506件の辞書スナップショットを既存IDへ一度だけ移行する。
公開・検索・管理画面はDB/APIの値を使用し、空欄にしても元のJSONへ戻らない。

レビュー公開は `PUT /api/admin/reviews` で受け付ける。
管理画面の取り込みとCLIは共通の構造検証を通し、detail/articleの両方をexpectedHash付きで一括保存する。
CLIは接続先・入力内容・確認時の本番hashをプランに保持し、変更を検出したら再確認を求める。
操作方法は[日常のデータ編集・レビュー公開手順](d0008_content-publishing-guide.md)を参照。


## まず結論

この資料は実装済みの移行仕様を説明する。本番への導入・本番DBへの適用は未実施であり、
本番稼働を確認した記録ではない。

現在の本番PostgreSQLをそのまま1つの「正本」にする。Dockerコンテナは今後も使い続けるが、永久に残すデータをアプリコンテナの中に直接置かない。

実際のローカル復旧、本番移行、API接続、クローラー運用の順序は
[`d0005_backend-migration-runbook.md`](d0005_backend-migration-runbook.md) を参照する。

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
                    -> HTTPS + API_BEARER_TOKEN -> 本番Next.js
                                               -> 本番PostgreSQL

本番のcrawl_latest専用scheduler（毎日14:00 JST）
  crawler -> HTTPS + API_BEARER_TOKEN -> 本番Next.js -> 本番PostgreSQL

診断DOMの取得
  CLI -> HTTPS + API_BEARER_TOKEN -> 本番Next.js
```

APIトークン `API_BEARER_TOKEN` はサーバー専用の `.env.local` や `.env` に置き、Next.jsのサーバー側や対象CLIだけが読む。`NEXT_PUBLIC_` を付けない。ブラウザーから本番APIを直接呼ばないため、ChromeのNetworkに本番APIのAuthorization headerは出ない。トークンは信頼できるサーバー側処理専用で、人向けの操作はセッションと権限で承認する。旧共通トークンと旧のscope別トークンは廃止しており、新規環境でも受け付けない。

| 利用経路 | データを読む場所とアクセス条件 |
| --- | --- |
| 一覧，施設の共有 URL，投稿詳細・一覧・写真一覧，プロフィール | Server Components が共有サービスを呼ぶ．公開ページに本人情報を含む場合はリクエストごとに現在の閲覧者を解決する |
| 地図で選んだ施設，料金，リンク，推薦，条件変更後の投稿一覧 | Route Handlers が同じサービスを呼ぶ．ブラウザーは操作に必要な結果を受け取る |
| お気に入り，比較リスト，通知，滑走記録 | セッションから本人を解決し，取得と更新を本人で絞る．お気に入りと比較リストでは，画面のアカウントと現在のセッションが異なる要求も拒否する．共通の地図を保存する HTML には本人のデータを含めない |
| 投稿・情報修正，編集と承認 | Server Actions と専用の HTTP 入口が，共有サービスに本人または匿名の証明を渡す．写真付き投稿は multipart の受信量を検査する．管理操作では現在の DB 権限を確認する |
| 管理画面の施設切替後の読込 | `/api/admin/editor/queries` が現在の DB 編集権限を確認する |
| worker・CLI，別環境の正本への接続 | `/api/admin` の機械用入口が Bearer token を検証する．人による操作を中継する場合は接続先でも actor を照合する |

JSON API のエラーは `application/problem+json` で返し，呼び出し元は HTTP status と `code` で失敗を識別する．写真の秘匿 404 と成功応答には `private, no-store` を付ける．

## Chromeからデータが見える範囲

画面に描画するためブラウザーへ送ったデータは、APIでもServer Actionsでも利用者が確認できる。Server Actionsは「JSONを絶対に見えなくする仕組み」ではない。

そのため次の境界にする。

- 診断DOM、管理用の元JSON、管理情報は一般利用者のブラウザーへ送らない。
  管理者が編集に使う情報は認証済みの管理画面へだけ渡す。
- 一般画面には必要な項目を列挙した公開データだけを返す。スキー場のDB問い合わせと
  remote API応答は同じ公開項目一覧を使い、DBや管理画面に新しい列を追加しても自動公開しない。
- 料金は内側の項目も含めて公開対象を列挙する。料金計算に必要な営業時間と出典URL・タイトルは
  維持し、資料のローカルパス、調査担当への申し送り、未知の管理フィールドは送らない。
- 詳細画面には公開用に選んだ天気・積雪と営業情報を含める．管理用の元データと内部の作成・更新時刻は返却対象から除外する．
- 管理用APIはトークン、管理画面の変更はAuth.jsの管理者権限で毎回確認する。
- コース線の座標のように、ブラウザー上で地図を描画するため必要な値は完全に秘匿できない。生ファイルと不要な属性を送らないことで露出範囲を減らす。

## `crawl_latest` のDB保存

クロール1回を上書きせず履歴として保存し、コース・リフト・天気・コメントごとに「現在採用中の正常値」を指す。

```text
CrawlLatestRun                 1回の実行（時刻・結果・クローラー・Wayback区分）
  ├─ CrawlLatestCategorySnapshot  カテゴリ別の中身と成功/空/失敗
  ├─ CrawlLatestIssue             警告・エラー
  └─ CrawlLatestArtifact          診断DOMの保存先・hash・size

CrawlLatestCurrent             カテゴリ別に表示へ使うsnapshot
```

送信内容の全体コピー（rawPayload）は保存しない。受信時の検証だけに使う。

カテゴリごとの扱い:

| 結果 | 条件 | 表示 | 現在値 |
|---|---|---|---|
| 成功 | ページを開けて値を読めた | 値と出典 | 置き換える |
| 不明 | ページは開けたが状態を読めない（`status: null`） | 「不明」と出典 | 置き換える（警告とDOMを残す） |
| 掲載なし | ページは開けたが表・欄がない（`EMPTY`） | コース・リフトは「不明」と出典、天気・コメントは欄ごと出さない | 置き換える（DOMを残す） |
| 失敗 | ページを開けない、エラー、件数の想定違い、名前の重複・空・想定外の記号 | 出さない | `CRAWL_LATEST_STALE_AFTER_HOURS`（既定0）を過ぎたら外す |

クローラーの警告は表示を止めない。止めるのはエラーと `blocksPromotion: true` の警告だけ。
コースかリフトが1件以上あり全部×の実行では、天気・コメントの警告とそのためだけのDOMを
残さない。コメントを取れなかった回はコメントの出典を付けない。Wayback検証の値は履歴に
残すが、本番表示の現在値にはしない。公開画面ではGit管理の過去の取得結果（`latest_data/`）
で補わない（管理画面の名称対応だけが候補として読む）。

TODO（クロールを1日30回程度に増やすとき）:
- 中身の `contentHash` が直前の採用snapshotと同じなら、snapshotの `data` を重複保存しない。
  その場合も「失敗が続いたら表示しない」判定が使えるよう、`CrawlLatestCurrent` に
  同じ内容を最後に確認した時刻を持たせる。
- 履歴（run・snapshot・issue・artifact）は現状削除しない。容量が問題になったら、
  現在値が参照するsnapshotとWayback検証のrunを除いて古いものを消す。

同じクローラーコードは、保存先を明示してローカルでも実行できる。

```bash
# API設定を意図的に無効化し、ローカルファイルへ保存する
mise run crawl:latest -- --local-files --resort rusutsu-resort

# API_BASE_URLの本番APIへ送る（専用環境だけで使う）
mise run crawl:latest -- --remote-api --resort rusutsu-resort
```

ローカルファイルモードの正常結果は
`src/private/data/resorts-temporary/latest_data/<resort-id>/<日時>.json` に残る。警告があれば
正常結果と混ぜず、通常は
`src/private/data/resorts-temporary/crawl_latest_dom/<resort-id>/` 以下に生結果、警告理由、
レンダリング済みDOMを隔離する。このため、コード変更時はVS Code上で結果と公式DOMを並べて
確認できる。このJSONは
ローカル検証用であり、GitHub経由で本番値にするものではない。本番への反映はremote API経由に
限定する。

## 管理画面で編集するJSON/GeoJSON

リフト券、レビュー、コース、リフト、対応表、参考リンクなどの運用データは、
PostgreSQLの `DataDocument` に保存する。従来ファイルの相対パスをキーにし、JSON本体、
hash、versionを持つ。Git側のファイルは初回投入元または開発用fixtureとして残す。

- 本番Next.jsは本番DBを直接使う。`API_BASE_URL` を設定したローカルNext.jsは、
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

## 営業状況の検証

固定件数の一致ではなく、使用中の対応表から営業状況を一意に埋められるかを検証する。
欠損・曖昧さは項目ごとに不明とし、取得できた正常項目の採用は止めない。
保存時に反映・集計し、表示時はsnapshot IDの一致だけを確認する。
処理と掲載形式の例外一覧は [営業状況の対応表検証](d0012_crawler-operation-coverage.md) を参照。

## DOMの保存

正常かつ無警告のDOMは保存しない。次のどれかが起きた実行だけ保存する。

- ページ取得や必須selectorが失敗した
- 必須の名前や状態がない
- 辞書にない状態文字列が来た
- 対応表で参照する営業項目の欠損・状態不明、重複、URL、値の範囲などの検証で警告が出た
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
- 各スキー場の `crawl_latest` は別系統である。現在の93本は、本番デプロイで標準で `crawlers` profileを有効化した
  `crawl-latest-scheduler` コンテナが毎日14:00（JST）に実行し、結果を内部APIへ送る。
  schedulerは起動直後には実行せず、同日二重実行と前回バッチへの重複を避ける。
- 実行対象は `resorts/*.ts` から自動列挙し、`template.ts`、`*_before.ts`、テストファイルは
  除外する。現在93本だが、条件を満たすクローラーを追加すれば対象数も増える。

専用schedulerにも `API_BASE_URL` と
`API_BEARER_TOKEN` を設定する。これにより正常結果はDBへ、警告・失敗DOMは本番の
非公開volumeへ送られる。schedulerへ本番DBの接続文字列は渡さない。日次lockとバッチレポートは `crawler_worker_artifacts` volumeへ保存する。

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
- `SkiResortReadings.json` の旧称・ふりがなは専用テーブルへ移行済み。実行時の参照はDBへ統一し、管理画面で編集する。
- `SkiResortWeatherIds.json` は外部の天気サービスへのリンク生成に使う静的補助設定として残す。
- `src/private` はprivate crawler code、対応辞書、初回fixtureを保管するsubmoduleとして残す。
  commitする際はsubmodule側の必要な変更を先にcommit・pushし、親のgitlinkを更新する。

検証ルールは、名前・状態の欠落、`○`・`△`・`×`以外の未知状態、重複、想定件数との差、
空カテゴリ、不正URL、天気値の欠落や異常範囲などを検知するコードである。警告があるカテゴリを
正常な現在値へ昇格させず、前回の正常値を守るためにGitでレビュー・変更履歴を管理する。

運用開始後の最新値やadmin編集をGit側へ戻す必要はない。DB dumpは認証情報も含む機密資料として扱い、GitやGitHubへcommitしない。

つまりGitHubが不要になるわけではない。GitHubはコード、DBの構造変更、初回投入用データ、
履歴の保管場所であり、PostgreSQLは運用中の最新データの保管場所になる。通常deployは初回投入を実行しない。初回の成功確認後は
`INITIALIZE_CANONICAL_DATA` を削除またはfalseに戻す。

## 配備とバックアップ

GitHub の設定・配備・保持と復元の操作は [運用手順](d0005_backend-migration-runbook.md) を参照する．
本番アプリは DB に直接接続する．独立 scheduler は内部 API の URL とトークンで通信する．
ローカルのアプリを正本 API へ接続する場合も同じ設定名を使い，非 loopback の接続には HTTPS を使う．
