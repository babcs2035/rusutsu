# Rusutsu - スキー場情報統合プラットフォーム

**Rusutsu** は，日本全国のスキー場情報を多元的なソースから集約・統合し，一元的に可視化するアプリケーションである．
基本情報，コース詳細，リフト稼働状況，詳細な気象予測，そして積雪履歴などのデータを組み合わせ，スキー場の「今」と「これから」を正確に把握することを目指している．

## 技術スタック (Technical Stack)

*   **Framework**: [Next.js 16](https://nextjs.org/) (App Router & Turbopack)
*   **Language**: [TypeScript 6](https://www.typescriptlang.org/) (Strict Mode)
*   **Runtime**: [Node.js 24](https://nodejs.org/)
*   **Database**: [PostgreSQL 16](https://www.postgresql.org/) (via Docker Compose)
*   **ORM**: [Prisma 7](https://www.prisma.io/) (`prisma.config.ts` による接続設定一元管理)
*   **UI Framework**: [Chakra UI v3](https://chakra-ui.com/), [Framer Motion](https://www.framer.com/motion/), [Lucide React](https://lucide.dev/)
*   **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
*   **Data Visualization**: [Leaflet](https://leafletjs.com/) (地図表示), [Recharts](https://recharts.org/) (グラフ描画)
*   **Scraping / Automation**: [Playwright](https://playwright.dev/) & Fetch API
*   **Validation / Config**: [Zod](https://zod.dev/), [dotenv](https://github.com/motdotla/dotenv)
*   **Toolchain**: [mise](https://mise.jdx.dev/) (Task & Runtime Manager), [Biome](https://biomejs.dev/) (Linter/Formatter)
*   **CI/CD**: [GitHub Actions](https://github.com/features/actions) (CI + Docker build/deploy)
*   **Containerization**: Multi-stage Docker build (Node 24, arm64 対応)

---

## 開発環境構築 (Development Setup)

本プロジェクトでは，ツール管理とタスクランナーとして `mise` を採用している．

### 1. ツールのインストール

```bash
mise install
```

### 2. 自動セットアップ (`mise setup`)

```bash
mise run setup
```

以下のステップが自動で実行される:
1. `.env` 生成（`.env.example` からコピー）
2. `pnpm install` による依存解決
3. Playwright Chromium バイナリのダウンロード
4. PostgreSQL コンテナ起動（ヘルスチェック待機付き）
5. Prisma マイグレーション実行
6. Prisma Client 生成
7. データベースシード

### 3. 開発サーバー起動

```bash
mise run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) にアクセスする．

---

## デプロイ (Deployment)

### Docker ビルド

`Dockerfile` により multi-stage build で本番イメージを構築する．

```bash
docker compose up -d --build
```

### CI/CD (GitHub Actions)

`.github/workflows/ci-cd.yml` により，main ブランチへの push で以下のフローが自動的に実行される:

1. **CI Check**: lint, format, typecheck
2. **Docker Build**: arm64 向けビルド → GHCR に push
3. **Deploy**: Tailscale 経由でデプロイ先へ接続，イメージ pull & 再起動

---

## アプリケーション技術仕様 (Architecture Details)

### Frontend (Next.js App Router)

*   **Server Actions**: クライアントとサーバー間のセキュアなデータ通信には Server Actions を採用．型安全かつ直接的なロジック呼び出しを実現している．
*   **UI/UX**: Chakra UI v3 + Framer Motion によるモダンなコンポーネント指向 UI とアニメーション．
*   **Client State**: Zustand によるグローバルなフィルタリング状態やユーザー設定の管理．
*   **Visualization**: React Leaflet とクラスタリングによる動的地図コンポーネント，Recharts による気象トレンド・積雪データの可視化．

### Backend & Database (PostgreSQL + Prisma 7)

*   **Prisma 7 のアーキテクチャ**: 接続設定を `prisma.config.ts` で一元管理．`schema.prisma` 上の静的な `url` 定義は廃止．
*   **テーブルスキーマ**: `SkiResort` を中心的なエンティティに据え，`Course`, `Lift`, `Weather`, `Forecast`, `SnowDepthRecord` などの詳細情報をリレーションと JSON 型で保持する正規化構造．

---

## データ処理パイプライン (Crawling & Data Normalization)

### 1. データ収集ソース

| データソース        | 取得データ                                | 対応スクリプト                                                        | 役割                                              |
| :------------------ | :---------------------------------------- | :-------------------------------------------------------------------- | :------------------------------------------------ |
| **SnowJapan**       | スキー場基本情報 (ID, 名称, 所在地, 標高) | `crawlSkiAreas.ts`                                                    | **マスターデータ**．全てのデータの基点．          |
| **Snow-Forecast**   | 過去気象データ, 週間天気予報              | `crawlWeathers.ts`<br>`crawlForecasts.ts`                             | 高度別 (Top/Mid/Bot) の詳細な気象情報．          |
| **Surf&Snow**       | コース・リフト詳細, 画像, 概況            | `crawlGelendes.ts`                                                    | 視覚情報や詳細スペックを補完．                    |
| **気象庁 (AMeDAS)** | 気温, 積雪深 (観測値)                     | `crawlAmedas.ts`                                                      | 実際の観測データによる裏付け．                    |
| **独自/その他**     | 積雪履歴, 最新レポート, ゆきまじ          | `crawlSnowDepths.ts`<br>`crawlLatestReports.ts`<br>`crawlYukiMagi.ts` | その他の付加価値情報．                            |

### 2. 名寄せ (Normalization)

ウェブ上の情報にはスキー場名に強い「表記揺れ」や ID リテラルの差異が存在するため，`src/data/` 以下の辞書ファイルで正確な突合を実現している．

*   **`SkiAreaNameDict.json`**: ベースとなる和名を正規化し，アプリケーション内で一意となる Master Name を解決．
*   **`SnowJapanToSnowForecastDict.json`**: 外部サイト間の ID 同士の直接マッピング．
*   **`SnowForecastDict.json` / `SurfSnowDict.json`**: 各提供元での固有名称と内部 DB 上の正規化名を動的にリンク．

### 3. 冪等性

すべてのクローリングスクリプトは冪等性を持っており，複数回実行しても差分のみが Upsert される安全な設計となっている．

---

## ディレクトリ構造

```text
├── .github/workflows/   # CI/CD ワークフロー (CI + Deploy)
├── prisma/              # データベース定義ファイル
│   ├── schema.prisma    # Prisma スキーマ (データモデル)
│   └── seed.ts          # 初期化用データセットアップ
├── public/              # 静的アセット (フォント, ロゴ, 画像メタ等)
├── src/
│   ├── actions/         # Server Actions (DB クエリラップ, ミューテーション)
│   ├── app/             # App Router のページ・レイアウト定義
│   ├── components/      # クライアント・サーバーコンポーネント・共通 UI
│   ├── data/            # 名寄せ辞書ファイル・静的マスターデータ群 (JSON)
│   ├── lib/             # ユーティリティ関数群, Prisma クライアント初期化等
│   ├── providers/       # Context, Chakra テーマプロバイダ設定
│   ├── private/scripts/ # Playwright 等によるクローリングスクリプト群
│   └── types/           # アプリケーション全体の型定義 (Zod スキーマ含む)
├── docker-compose.yml         # 開発用コンテナ設定
├── docker-compose.production.yml  # 本番デプロイ用設定
├── Dockerfile                 # multi-stage Docker build (Node 24, arm64)
├── mise.toml                  # タスクランナー・ランタイムバージョン管理
├── package.json               # 依存ライブラリ構成
└── prisma.config.ts           # DB 接続設定の一元管理
```

---

## 主要コマンドリファレンス (`mise tasks`)

*   **開発とチェック**:
    *   `mise run dev` - Next.js 開発サーバー起動 ( http://localhost:3000 )
    *   `mise run check` - Biome & TypeScript によるコード品質チェック
    *   `mise run lint` - コードフォーマットおよび潜在的な問題の修正
    *   `mise run typecheck` - TypeScript 型チェック
    *   `mise run build` - 本番ビルド
    *   `mise run start` - 本番サーバー起動
*   **インフラ・データベース**:
    *   `mise run db:up` - PostgreSQL (Docker) 起動・ヘルスチェック待機
    *   `mise run db:down` - コンテナ・ネットワークの破棄
    *   `mise run db:migrate` - Prisma マイグレーション実行
    *   `mise run db:generate` - Prisma Client 生成
    *   `mise run db:seed` - データベースシード実行
    *   `mise run db:reset` - データベースリセット（全データ削除 & シード）
    *   `mise run db:studio` - Prisma Studio による DB GUI サーバ起動
    *   `mise run docker:build` - Docker イメージ再構築
*   **各種クローラー実行**:
    *   `mise run crawl:all` - パイプライン全体実行 (※長時間・高負荷)
    *   `mise run crawl:ski-areas` / `mise run crawl:forecasts` など - 個別タスク実行
