<!-- テストの実行方法，試験用 DB の安全条件，検証の担当を説明する． -->
# テストの実行

日常の検証は `mise run check` と `mise run test` で行う．`check` は整形・lint・型を読み取り専用で検査する．整形を適用するときは `mise run format`，lint の修正は `mise run lint -- --write` を使う．型検査は Next.js の route 型を生成してから実行し，dev や QA の生成物を検査へ混在させない．

| コマンド | 実行内容 |
| --- | --- |
| `mise run test` | 単体試験と，単一の使い捨て PostgreSQL での DB 統合試験 |
| `mise run test -- --unit` | DB が不要な単体・通信契約・fixture による試験 |
| `mise run test -- --db` | migration 後の DB 統合試験だけを直列実行 |
| `mise run test -- --browser` | 起動済みの production サーバーでオフライン・保持状態を確認 |

手元で `TEST_DATABASE_URL` を指定しない場合，runner が Docker の試験専用コンテナを作成する．DB は tmpfs に保存し，試験の終了時に自分が作成したコンテナだけを削除する．開発中の DB コンテナと volume は使わない．既存の試験 DB を指定する場合は localhost の `rusutsu_test_<数字>` に限定し，`DATABASE_URL` の設定を自動流用しない．CI では `TEST_DATABASE_URL` が必須であり，未設定を skip として扱わない．

DB suite は同じ DB を使い，suite ごとに migration 履歴以外の fixture を初期化する．remote の認証・権限を検査するケースだけは，同じ DB の専用 schema で別サーバーの状態を表現する．これらの schema は試験が削除する．試験以外のデータを置かない．

ブラウザ試験の接続先は `OFFLINE_TEST_URL` で指定する．通常の basePath は `/rusutsu` である．ブラウザが必要な fixture 試験には `mise run setup` で準備した Playwright を使い，必要なら `PLAYWRIGHT_BROWSERS_PATH` で保存先を指定する．結果・画像・一時 bundle は `src/private/data/resorts-temporary/` 以下へ保存する．

## 検証の担当

| 境界 | 主に確認する内容 |
| --- | --- |
| 純粋な業務処理 | 料金・購入条件・日付・検索・営業判定・推薦・距離／標高・名寄せの境界と独立した期待値 |
| Request/Response | 入力形式・容量・認証・公開項目・エラー・cache・HTTP 固有の条件 |
| DB 統合 | 本人と他人の操作，投稿・写真・訂正・承認，正本と派生値，競合・冪等性・途中失敗での rollback |
| 収集 fixture | 外部 HTML/API の抽出，空・欠測・古い情報，保存前の検証，施設別の例外 |
| 運用 | 保存・保持・復元，配備の順序と失敗時の停止，秘密の非出力，別プロジェクトの保護 |
| ブラウザ | 検索・詳細・比較・投稿の遷移，地図・入力・下書き・scroll の保持，通信断と復帰 |

同じ仕様をすべての層で反復しない．試験を削除するときは，残る試験がその仕様を検出する根拠を確認する．料金の公式期待値は `LIFT_TICKET_DATA_ROOT=src/private/data/lift-ticket pnpm exec tsx --test src/features/lift-ticket/utils/uiContract.test.ts` でも確認できる．期待値を実装の出力から作り直さない．
