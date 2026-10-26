# Project Notes

## モデル選択・サブエージェントのコスト方針
- この方針は通常作業とすべてのスキル実行に適用する。範囲が明確な検索・抽出・ログ整理・記事生成・定型JSON編集・局所修正は、原則 `gpt-6-luna` / `low` のサブエージェントへ委任する。数行の変更など、委任の手間が上回る作業は親が直接処理する。
- サブエージェントのモデルは `gpt-6-luna` に統一する。複雑な資料読解や照合ではLunaの `medium` / `high` を選ぶ。設計判断、原因不明の不具合、認証・DB・複数機能にまたがる変更、Lunaで解消できない問題は親が引き取る。ユーザーが明示して変更する場合を除き、Sol・Astraなど別モデルのサブエージェントは起動しない。
- モデルを明示し、対応する環境では `fork_turns: "none"` を使う。子には担当、必要な入力パス・スキルの関連節、制約、完了条件だけを渡す。会話履歴全体や巨大なDOM・ログをコピーしない。
- 原則1体、独立した作業がある場合だけ最大2体を使う。子からの再委任、同じ調査の重複、役割ごとの無条件な起動を避ける。子は成果・根拠パス・確認結果・未解決事項を簡潔に返し、親は判断に必要な箇所と差分を確認する。
- スキル固有の独立監査、元資料との照合、検証・完了条件は省略しない。既存スクリプトで実行できる変換・検証はスクリプトを使う。新規・更新スキルにもこの方針を反映する。
- 指定モデルや委任ツールが使えなければ親が続行し、その制約を報告する。総トークン数と費用・プラン利用枠は別に扱い、実測していない削減率を述べない。

## 作業データの保存先
- 調査・検証用の一時ファイル、GeoJSON、JSON、スクリーンショット、ログ、補助スクリプトは `src/private`（rusutsu-library）配下に保存する。親リポジトリ直下の `tmp/`、`logs/` やルートには出力しない。
- 一時作業は `src/private/data/resorts-temporary/tmp/<task>/`、実行ログは `src/private/data/resorts-temporary/logs/` を使う。既存の用途別データディレクトリがある場合はそちらを使う。リダイレクト・`tee`・`--out`・`--report` の指定も同様。
- ローカル診断DOMは `src/private/data/resorts-temporary/crawl_latest_dom/` に保存し、Git管理対象外にする。本番APIの診断DOMは従来どおり非公開volumeに保存する。
- 一時作業用の `tmp/` と実行ログ用の `logs/` はlibrary側でもGit管理対象外にする。継続管理するデータや再利用するスクリプトは、用途別のデータディレクトリや `src/private/scripts/` に置く。

## ベースパスに関する注意 (既存)
- アプリは Next.js のベースパス `/rusutsu` 配下で配信される。
- ローカルアプリをブラウザや Playwright で開く際は `http://localhost:3000/rusutsu` を使用すること。

## プロジェクト概要
Rusutsu は、日本全国のスキー場情報（基本情報・コース/リフト稼働状況・気象予報・積雪履歴・リフト券料金・レビュー）を複数の外部サイトから収集・名寄せして一元的に可視化する Next.js アプリケーション。
主要スタック: Next.js 16 (App Router) + TypeScript (strict) + Prisma 7 / PostgreSQL、UI は shadcn/ui (Base UI) + Tailwind CSS v4 + Leaflet/Recharts、クローラーは Playwright + fetch、認証は Auth.js v5 (Google OAuth)。ツールチェーンは mise + Biome。

## 開発コマンド
`mise run <task>` で実行する（内部で `pnpm` を呼ぶタスクが多い）。

- セットアップ: `mise run setup`（.env作成 → pnpm install → playwright install → DB起動 → migrate → generate → seed）
- 開発サーバ: `mise run dev`（= `pnpm dev`, `next dev`）
- Lint: `mise run lint`（= `pnpm lint` = `biome check --write src`）
- Format: `mise run format`（= `pnpm format` = `biome format --write src`）
- 型チェック: `mise run typecheck`（= `pnpm typecheck` = `tsc --noEmit`）
- 一括チェック: `mise run check`（format → lint → typecheck の順に実行）
- ビルド: `mise run build`（= `pnpm build` = `next build`）
- DBコンテナ起動/停止: `mise run db:up` / `mise run db:down`
- マイグレーション実行: `mise run db:migrate`（= `pnpm prisma migrate dev`）
- Prisma Client生成: `mise run db:generate`（= `pnpm prisma generate`）
- シード: `mise run db:seed`（= `pnpm prisma db seed`）
- DBリセット: `mise run db:reset`（= `pnpm prisma migrate reset --force`、全データ削除）
- Prisma Studio: `mise run db:studio`
- 個別クローラー: `mise run crawl:ski-areas` / `crawl:gelendes` / `crawl:weathers` / `crawl:forecasts`
- 全クローラー一括: `mise run crawl:all`（上記4件 + snowDepths/snowFalls/latestReports/yukiMagi/amedas を順次実行）

## ディレクトリ構成
- `src/app`: Next.js App Router のエントリ（`layout.tsx`, `page.tsx`, `admin/` 管理画面, `api/` API ルート。ページ本体は features 側に実装）
- `src/features/<domain>`: 機能単位のディレクトリ。`filters`, `home`, `lift`, `lift-ticket`, `map`, `resort-detail`, `review`, `reviews`, `slope`, `ticket`, `weather` の11ドメインがあり、各ドメイン配下に `components/`, `hooks/`, `utils/` を持つ（ドメインによっては `tabs/`, `server/` も持つなど、内訳はドメインごとに多少異なる）
- `src/shared`: ドメインをまたぐ共通コード置き場（`components/`, `types/`, `utils/`）
- `src/lib`: Prisma クライアント (`prisma.ts`)、クローラー実行管理 (`crawlerManager.ts`)、cron スケジューラ (`scheduler.ts`)、GeoJSON 生成ロジックなどインフラ寄りの処理
- `src/actions`: Server Actions（`skiResorts.ts`, `crawl.ts`, `auth.ts`）
- `src/components`: shadcn/ui コンポーネント (`ui/`) と管理画面共通部品
- `src/auth.ts`, `src/proxy.ts`, `src/instrumentation.ts`: Auth.js v5 ハンドラ、`/admin` ルートの保護 (JWT 検証)、本番起動時のクローラースケジューラ開始
- `src/private`: 一般には公開しないデータ・スクリプト置き場（git submodule で別リポジトリ管理）。`data/`（クロール結果・名寄せ辞書・GeoJSON等）と `scripts/`（クローラー本体）

## Prisma 関連
- `prisma/schema.prisma`: データモデル定義（`SkiResort`, `Course`, `Lift`, `Weather`, `SnowDepthRecord`, `SnowFallRecord`, `LatestReport`, `AmedasData`, `YukiMagi` 等）とマイグレーション・generator/datasource 設定。
- `prisma.config.ts`: Prisma CLI の接続設定を一元管理するファイル（`DATABASE_URL` を dotenv 経由で読み込む）。Prisma 7 では `schema.prisma` 内で datasource URL を直接指定しない構成になっており、実行時の接続先はこちらが担う。

## UI を作る・直すとき
- 必ず `docs/ui-guidelines.md` を読んでから着手する。特にスマホは縦の余白を無駄にしない（ボタンだけの行を作らない、タブ・ヘッダーは詰める）。
- 新規画面・主要なUI変更は、着手前に同じ用途の既存画面と実装を確認し、再利用するヘッダー・閉じる操作・ボタン・入力・読み込み表示・地図を特定する。見た目が似ている独自実装を増やさず、既存コンポーネントを直接使う。部品が不足するときは、既存部品への拡張を先に検討する。
- スキー場詳細内の機能追加では、既存の見た目・共通部品・パネル幅を使う。必要な画面構成は操作の意味に合わせ、ヘッダーまで機械的にコピーしない。現地レポート中はスキー場ヘッダーを非表示にし、既存デザインの×で投稿を閉じて詳細へ戻す。終了のための説明文や別名ボタンを勝手に足さない。投稿のために別の地図や異なる見た目の×を作らない。地図のインスタンス・表示範囲・難易度／斜度・タイル・選択状態を、意図のない画面遷移や再マウントで失わせない。
- 読み込み中・失敗時・空状態・完了時も同じ画面構成と共通部品を使う。通常時だけ整えて完了としない。読み込みでヘッダー、×、パネル幅、高さが入れ替わったり、表示が跳ねたりしないことを確認する。
- UI変更の完了条件に、既存画面との実画面比較を含める。PCと375pxのスマホでスクリーンショットを自分で確認し、詳細パネルは346px／500px、該当するポップアップは320pxでも確認する。重なり・横はみ出し・縦スクロール・文字サイズ・余白・ボタンの形と色・閉じる／戻る操作を検査し、問題を直してから提出する。型・lint・機能テストの成功だけではUIの確認完了としない。
- LunaへUI実装を委任しても、親が既存部品との一致と実画面を確認する。子の「実装済み」「テスト成功」という報告だけで完了としない。最終報告では実際に確認した画面・状態と未確認の範囲を区別し、ユーザーに初回の見た目確認や不具合探しを任せる形で提出しない。
- スキー場詳細（PC・スマホとも）にはログイン／アカウントのボタンを置かない。
- スキー場詳細の天気タブ「リンク一覧」は、4サイトのリンクがそれぞれ1件ずつの場合、スマホでも必ず横1列に全て収める（横スクロール不可）。同じサイトに複数地点などの項目がある場合は2行以上に折り返してよい。コンテナ幅に応じて文字・余白を調整し、詳しくは `docs/ui-guidelines.md` を守る。

## コーディングスタイル・設計パターンについて
- **一貫している点**: Biome によるフォーマット（ダブルクォート、セミコロン必須、インデント2スペース、行幅80）と lint ルールはプロジェクト全体で強制されている（`mise run check` で担保）。Prisma へのアクセスは `src/lib/prisma.ts` のシングルトンクライアント経由に統一されている。
- **現状は統一されていない点**: クローラースクリプト間で「削除→再作成」「upsert」「create + try/catch」のいずれを使うかはサイト・モデルごとに異なり、明文化された規約はない。また `src/features/<domain>` 配下のサブディレクトリ構成（`layout/` vs `layouts/`、`tabs/` の有無など）もドメインごとにばらつきがあり、共通テンプレートに従っているわけではない。名寄せ辞書のキー→値の向き（正式名→別名か別名→正式名か）もファイルごとに異なるため、利用時は個別に確認が必要。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
