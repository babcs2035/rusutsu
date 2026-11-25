<!-- テストの実行方法，試験用 DB の安全条件，検証の担当を説明する． -->
# テストの実行

日常の検証は `mise run check` と `mise run test` で行う．`check` は整形・lint・型を読み取り専用で検査する．整形を適用するときは `mise run format`，lint の修正は `mise run lint -- --write` を使う．型検査は Next.js の route 型を生成してから実行し，dev や QA の生成物を検査へ混在させない．

| コマンド                                                   | 実行内容                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `mise run test`                                            | 単体試験と，単一の使い捨て PostgreSQL での DB 統合試験                     |
| `mise run test -- --unit`                                  | DB が不要な単体・通信契約・fixture による試験                              |
| `mise run test -- --db`                                    | migration 後の DB 統合試験だけを直列実行                                   |
| `mise run test -- --browser`                               | 隔離したローカルアプリでオフライン・保持状態と公開投稿の一連の操作を確認   |
| `mise run test -- --browser scripts/testPublicWorkflow.ts` | 隔離したローカルアプリで匿名の情報修正，投稿ログイン制御，管理者審査を確認 |

個別の試験を実行するときはモードの後ろにファイル名を指定する．例えば `mise run test -- --unit src/server/publicQueryHttp.test.ts` で HTTP の読込契約だけを検証できる．

手元で `TEST_DATABASE_URL` を指定しない場合，runner が Docker の試験専用コンテナを作成する．DB は tmpfs に保存し，試験の終了時に自分が作成したコンテナだけを削除する．既存の試験 DB を指定する場合は，loopback の `rusutsu_test_<数字>` を指すクエリパラメーターなしの URL を渡す．CI では `TEST_DATABASE_URL` が必須である．

DB suite は同じ DB を使い，suite の前と全件成功後に public schema の fixture を初期化する．同じ DB を使う runner は PostgreSQL のロックで排他する．remote の認証・権限を検査するケースでは，同じ DB の専用 schema で別サーバーの状態を表現し，試験後にその schema を削除する．

ブラウザ試験の接続先は `OFFLINE_TEST_URL` で指定する．通常の basePath は `/rusutsu` である．ブラウザが必要な fixture 試験には `mise run setup` で準備した Playwright を使い，必要なら `PLAYWRIGHT_BROWSERS_PATH` で保存先を指定する．結果・画像・一時 bundle は `RUSUTSU_TEST_ARTIFACT_DIR` が指す runner 専用ディレクトリへ保存し，runner が終了時に削除する．

オフライン試験だけを行うときは，`--browser` に続けて `scripts/testOfflineOverview.ts`，`scripts/testOfflineDetail.ts`，`scripts/testOfflineRetention.ts` を指定する．公開投稿試験も含める場合は，下記の使い捨て DB の設定が必要である．

`testPublicWorkflow.ts` は loopback 上の隔離アプリだけを受け付ける．匿名状態で `/admin/corrections` がログインへ転送されること，情報修正フォームで空欄を送信できないこと，入力した匿名修正が送信できること，現地レポートがログインを求めることを確認する．書き込み操作の前に `RUSUTSU_BROWSER_DISPOSABLE_DB=true` を確認するため，通常のローカル DB では送信も審査も行わない．管理者審査まで確認するときは，隔離アプリの `AUTH_SECRET` と同じ値を `RUSUTSU_BROWSER_AUTH_SECRET` に設定し，試験 DB に存在する管理者 ID を `RUSUTSU_BROWSER_ADMIN_ID` に設定する．試験スクリプトは Google の認証情報を使わず，合成 JWT の Cookie だけで審査画面へ入る．この検証で作成した修正申請は試験 DB だけに保存される．

同じ試験では，比較料金のオンライン計算とオフライン表示，比較詳細の取得に失敗したときの端末キャッシュ利用と公開対象から外れた施設のキャッシュ削除，本人の設定・投稿一覧を開いたときの取得 API の呼び出し回数，配備切替後に比較リストを保存しようとしたときの入力保持も確認する．

## ブラウザー用の使い捨て環境

新規の試験 DB に migration を適用し，[ブラウザー用 fixture](../scripts/testBrowserFixtures.sql) を `psql` で投入する．次の例は，試験専用 PostgreSQL が loopback の 55491 番で待ち受ける場合である．

```sh
export DATABASE_URL='postgresql://rusutsu_test:ephemeral_test_only@127.0.0.1:55491/rusutsu_test_3001'
export API_BASE_URL='' AUTH_URL='http://127.0.0.1:3001' AUTH_SECRET='ephemeral-browser-test-only'
export DISABLE_CRAWLER_SCHEDULER=true RUSUTSU_DIST_DIR=.next-qa
pnpm exec prisma migrate deploy
psql "$DATABASE_URL" -f scripts/testBrowserFixtures.sql
mise run build
HOSTNAME=127.0.0.1 PORT=3001 mise exec -- node .next-qa/standalone/server.js
```

別の端末から，起動したアプリを指定して試験する．保存の再現にはテスト用タイルを使う．

```sh
OFFLINE_TEST_URL=http://127.0.0.1:3001/rusutsu OFFLINE_TEST_FIXTURE_TILES=1 \
  RUSUTSU_BROWSER_DISPOSABLE_DB=true \
  RUSUTSU_BROWSER_AUTH_SECRET=ephemeral-browser-test-only \
  RUSUTSU_BROWSER_ADMIN_ID=browser-test-admin mise run test -- --browser
```

試験後は隔離アプリを停止し，試験 DB を破棄する．通常の型検査は `.next/types`，隔離ビルドは `.next-qa/types` を使う．CI でも DB 結合試験の完了後に同じ fixture を投入し，隔離した本番ビルドでブラウザー試験を実行する．
Linux のヘッドレス Chromium で地図を初期化できない場合は，`OFFLINE_TEST_HEADLESS=false xvfb-run -a mise run test -- --browser` で実行する．

Next.js の起動処理の依存一覧には route の除外設定が適用されないため，standalone のコピー直前に一時ファイル・診断 DOM・バックアップへの参照を除く．Docker のビルドコンテキストからも同じ作業データを除く．

## 検証の担当

| 境界             | 主に確認する内容                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------- |
| 純粋な業務処理   | 料金・購入条件・日付・検索・営業判定・推薦・距離／標高・名寄せの境界と独立した期待値        |
| Request/Response | 入力形式・容量・認証・公開項目・エラー・cache・HTTP 固有の条件                              |
| DB 統合          | 本人と他人の操作，投稿・写真・訂正・承認，正本と派生値，競合・冪等性・途中失敗での rollback |
| 収集 fixture     | 外部 HTML/API の抽出，空・欠測・古い情報，保存前の検証，施設別の例外                        |
| 運用             | 保存・保持・復元，配備の順序と失敗時の停止，秘密の非出力，別プロジェクトの保護              |
| ブラウザ         | 検索・詳細・比較・投稿の遷移，地図・入力・下書き・scroll の保持，通信断と復帰               |

| 機能 | 担当する主な試験 |
| --- | --- |
| 一覧・検索・比較・料金・推薦 | `filterResorts.test.ts`，`sortResorts.test.ts`，`uiContract.test.ts`，`course-recommendations/` の比較・cache 試験，`testOfflineOverview.ts` |
| 詳細・地図・天気・リンク・共有・オフライン | `resort-detail/`・`weather/`・`links/`・`share/` の試験，`course-lift/mapData.test.ts`，`testOfflineDetail.ts`，`testOfflineRetention.ts` |
| お気に入り・比較リスト・滑走記録 | `favorites/actions.integration.test.ts`，`compare-lists/updateResorts.test.ts`，`ski-tracks/repository.integration.test.ts` |
| 投稿・下書き・写真・通報・通知・訂正 | `composerDraft.test.ts`，`draftStorage.test.ts`，`community.integration.test.ts`，`corrections.integration.test.ts`，`testPublicWorkflow.ts` |
| 編集・承認・権限・正本の更新 | `edit-requests/policy.test.ts`，`workflow.integration.test.ts`，`canonical.integration.test.ts` |
| 収集・営業情報・共通パス・雪マジ・診断 | private の `crawlReplacement.integration.test.ts`，`crawl_latest/`・`pass-programs/`・`crawlYukiMagi.test.ts`，`crawl-monitor/`・`crawl-latest/` の試験 |
| HTTP・管理 API・データ公開・配備・復元 | `publicQueryHttp.test.ts`，`internalDataApiClient.test.ts`，`publishLiftTicket.test.ts`，`publishReview.test.ts`，`scripts/ops/` の試験 |

同じ仕様をすべての層で反復しない．試験を削除するときは，残る試験がその仕様を検出する根拠を確認する．料金の公式期待値は `LIFT_TICKET_DATA_ROOT=src/private/data/lift-ticket mise run test -- --unit src/features/lift-ticket/utils/uiContract.test.ts` でも確認できる．期待値を実装の出力から作り直さない．

ブラウザー試験では比較料金と一覧料金の通信失敗をそれぞれ発生させ，同じ入力で再接続後に取得できることを確認する．天気リンクはスマホ 375 px と詳細パネル 346 px・500 px で横一列と Tab 移動を検査する．比較保存ダイアログは 320 px を使う．比較詳細の単体試験では，地図の有無で営業情報が一致すること，同じ revision の地図を後から求めても正本本文の取得が一度で済むことを検査する．

料金を同じ券種・日付・区分・年齢で照会する公式資料が複数ある場合は，期待値の一致を確認して一度だけ計算する．営業期間と休業日の判定は料金区分より先に行うため，施設ごとの境界試験は代表の区分で行う．年齢や資格による料金分岐は，公式額の照合と `spec/audience.test.ts` の境界例が担う．
