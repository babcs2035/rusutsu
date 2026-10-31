# GALA湯沢: 既知の診断証拠

この記録は特定事例であり、一般的な期待値ではない。別runへ適用する前にsource hashと現行公式DOMを再確認する。

## selectorの変更と季節性

- `src/private/data/resorts-temporary/crawl_latest_dom/gala-yuzawa/20261029T083909335Z-0ffd0ae7-0acb-4daf-bf18-43e01da51a8a/manifest.json` と `20261030T012623139Z-51c878d8-b5ef-4d2c-a20c-663c00536da6/manifest.json` は、旧selectorによる15秒の`waitForSelector` timeoutを記録している。トップは`.infowidget.infowidget_home`、ゲレンデは`.table-bordered:has-text('OPEN予定') tbody tr #open_1`を待っていた。観測したオフシーズンDOMから要素が消えており、待ち時間を延ばしても解決しない。
- 2026-10-31の現行DOM証拠は`src/private/data/resorts-temporary/crawl_latest_dom/gala-yuzawa/live-audit-20261031/{top,gelande}.{html,json}`。HTTP 200で、トップは1907ms、ゲレンデは872msで描画した。ゲレンデの新DOMでは営業表を特定して待つselectorへの変更が必要だった。genericなtable待ちへ戻さない。現行未コミットソースの期待在庫はコース21、リフト10。DOM抽出ではコース21行・リフト10行がすべて`×`で、オフシーズン時点の天気・コメントは掲載されていない。
- 冬季の過去資料`src/private/data/resorts-temporary/tmp/wayback/20260210/gala-yuzawa/2026_0918_231058.json`はコース21・リフト11を記録している。新シーズンの公式根拠なしに旧リフト11基を流用しない。現行ソースには冬季営業中にトップの天気・コメントDOMを確認するTODOが残る。オフシーズンにないことから2026-27冬季の掲載内容は判断できない。
- サーバー側run `cmvuifezq005a0fo4m65wo3z4`（2026-10-30T05:06:03.637Z）はsource hash `ef6b…`で、旧selector双方の15秒timeoutを記録している。現行ローカル作業ソースとは異なるため、旧版の証拠として扱う。

## WaybackとLIVE保存の切り分け

親の調査では、`CRAWL_LATEST_ARCHIVE_TIMESTAMP=20260210`でremote Wayback実行と保存が成功した。使用したトップの実日時は`20260210204927`、ゲレンデは`20260214135053`。最初のrun `cmvv5vkkk00vm0fo4qznf7o9e`は非掲載の降雪量への不要警告で`PARTIAL`だったが、`snowfall.disabled=true`へ修正後のrun `cmvv5xtbq00vy0fo4jvn08o66`は`SUCCESS`、警告・診断DOMとも0。21コース（○18・×3）、11リフト（○11）、中腹の天気・気温・積雪・雪質・公式更新日、専用コメントを保存した。全カテゴリの`eligibleForCurrent=false`をAPIから読み戻した。capability台帳も最終ソースハッシュで再生成し、データAPIへの保存・読み戻しが成功している。

同じ現行未コミット修正を使ったLIVE抽出は約5秒で終わるが、`POST /crawl-latest-runs`はHTTP 500を返し、raw responseは`INTERNAL_ERROR: Unable to persist crawl run`。新runはなく、現在のコース/リフト値もnull。追跡すると、アプリの採用条件は「LIVEかつFAILED/INVALID以外」なのに、旧migrationの`crawl_latest_category_eligibility_check`は「採用可能ならSUCCESSかつVALID」だけを許可していた。実送信payloadから検証結果を作り、旧制約を持つローカルDBの一時テーブルへ渡すとCOMMENT/NEWS/WEATHERのEMPTYがSQLSTATE 23514で拒否された。WAYBACKは全カテゴリが採用対象外なので同じ拒否は起きない。

修正migration `prisma/migrations/20261031000000_align_crawl_latest_eligibility/migration.sql`を一時テーブルに適用すると同じ5カテゴリがすべて通る。24通りの状態・検証結果・採用可否の組み合わせも検証し、FAILED/INVALIDの採用は引き続き拒否する。本番DBの制約や例外ログを直接取得したわけではなく、本番へのmigration適用・LIVE再保存・現在値復旧は未実施。HTTP応答やメモリ上の`Saved`表示だけで永続化を断定しない。
