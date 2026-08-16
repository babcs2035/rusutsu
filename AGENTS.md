# Project Notes

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

## コーディングスタイル・設計パターンについて
- **一貫している点**: Biome によるフォーマット（ダブルクォート、セミコロン必須、インデント2スペース、行幅80）と lint ルールはプロジェクト全体で強制されている（`mise run check` で担保）。Prisma へのアクセスは `src/lib/prisma.ts` のシングルトンクライアント経由に統一されている。
- **現状は統一されていない点**: クローラースクリプト間で「削除→再作成」「upsert」「create + try/catch」のいずれを使うかはサイト・モデルごとに異なり、明文化された規約はない。また `src/features/<domain>` 配下のサブディレクトリ構成（`layout/` vs `layouts/`、`tabs/` の有無など）もドメインごとにばらつきがあり、共通テンプレートに従っているわけではない。名寄せ辞書のキー→値の向き（正式名→別名か別名→正式名か）もファイルごとに異なるため、利用時は個別に確認が必要。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
