# Rusutsu - スキー場情報統合プラットフォーム

**Rusutsu** は，日本全国のスキー場情報を多元的なソースから集約・統合し，一元的に可視化するアプリケーションである．
基本情報，コース詳細，リフト稼働状況，詳細な気象予測，そして積雪履歴などのデータを組み合わせ，スキー場の「今」と「これから」を正確に把握することを目指している．

## 技術スタック (Technical Stack)

プロジェクトはモダンな Web 技術と堅牢なデータ処理パイプラインを採用し，継続的に最新バージョンへのアップデートを行っている．

*   **Framework**: [Next.js 16](https://nextjs.org/) (App Router & Turbopack 活用)
*   **Language**: [TypeScript 6](https://www.typescriptlang.org/) (Strict Mode)
*   **Database**: [PostgreSQL 16](https://www.postgresql.org/) (via Docker Compose)
*   **ORM**: [Prisma 7](https://www.prisma.io/) ( `prisma.config.ts` による一元管理 )
*   **UI Framework**: [Chakra UI v3](https://chakra-ui.com/), [Framer Motion](https://www.framer.com/motion/), [Lucide React](https://lucide.dev/)
*   **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
*   **Data Visualization**: [Leaflet](https://leafletjs.com/) (地図表示), [Recharts](https://recharts.org/) (グラフ描画)
*   **Scraping / Automation**: [Playwright](https://playwright.dev/) & Fetch API
*   **Validation / Config**: [Zod](https://zod.dev/), [dotenv](https://github.com/motdotla/dotenv)
*   **Toolchain**: [mise](https://mise.jdx.dev/) (Task Runner), [Biome](https://biomejs.dev/) (Linter/Formatter)

---

## 開発環境構築 (Development Setup)

本プロジェクトでは，ツール管理とタスクランナーとして `mise` を全面的に採用しており，再現性の高い環境構築が可能である．

### 1. ツールのインストールと依存パッケージ解決
依存する Node.js 等のバージョンは `mise` により自動管理される．
```bash
mise install
```

### 2. 自動セットアップ (`mise setup`)
セットアップタスクにより，以下のステップが自動でフォールト・トレラントに実行される．
1. **`.env` 生成**: `.env.example` から初期環境変数のコピー．
2. **パッケージのインストール**: `pnpm install` による依存解決．
3. **ブラウザバイナリの取得**: クローリング用の `Playwright` バイナリ (Chromium 等) をダウンロード．
4. **DB コンテナの単独起動**: `docker compose up -d --wait db` により，ネットワークの問題を回避しつつDBコンテナのみを確実に立ち上げ，ヘルスチェックを待機．
5. **マイグレーションとシード**: `pnpm prisma migrate dev` によりスキーマを同期し，初期セットアップシードを投入．

```bash
mise run setup
```

### 3. 開発サーバー起動
```bash
mise run dev
```
ブラウザで [http://localhost:3000/rusutsu](http://localhost:3000/rusutsu) にアクセスする．

---

## アプリケーション技術仕様 (Architecture Details)

### Frontend (Next.js App Router)
*   **Server Actions**: クライアントとサーバー間のセキュアなデータ通信には Next.js の Server Actions を採用．API Route の複雑性を排除し，型安全かつ直接的なロジック呼び出しを実現している．
*   **UI/UX**: モダンなコンポーネント指向 UI フレームワークである Chakra UI v3 に移行済み．Framer Motion を用いてリッチなアニメーションやトランジションを提供している．
*   **Client State**: Zustand を活用して，グローバルなフィルタリング状態やユーザーの設定情報などをオーバーヘッド少なく管理している．
*   **Visualization**: スキー場の位置情報のプロットには React Leaflet とクラスタリングプロバイダを用いた動的地図コンポーネントを構築．また，気象トレンドや積雪データの可視化には Recharts を採用している．

### Backend & Database (PostgreSQL + Prisma 7)
*   **Prisma 7 のアーキテクチャ**: 最新の Prisma 7 の仕様に準拠し，接続設定やシードコマンドなどはすべてプロジェクト直下の `prisma.config.ts` で管理している．スキーマファイル上の静的な `url` 定義を廃止し，よりセキュアでモジュラーな設定を実現した．
*   **テーブルスキーマ**: `SkiResort` を中心的なエンティティに据え，周辺の `Course`, `Lift`, `Weather`, `Forecast`, `SnowDepthRecord` といった詳細情報をリレーションと JSON 型を組み合わせて保持する正規化構造を維持している．

---

## データ処理パイプライン (Crawling & Data Normalization)

多数のスキー場情報は分散・断片化しているため，複数ソースからの情報を統合（名寄せ）してデータベースに対する Upsert 操作（更新・作成）を一元的に行うパイプラインを構築している．

### 1. データ収集ソースの概要
| データソース        | 取得データ                                | 対応スクリプト                                                        | 役割                                              |
| :------------------ | :---------------------------------------- | :-------------------------------------------------------------------- | :------------------------------------------------ |
| **SnowJapan**       | スキー場基本情報 (ID, 名称, 所在地, 標高) | `crawlSkiAreas.ts`                                                    | **マスターデータ**．全てのデータの基点となる．    |
| **Snow-Forecast**   | 過去気象データ, 週間天気予報              | `crawlWeathers.ts`<br>`crawlForecasts.ts`                             | 高度別 (Top/Mid/Bot) の詳細な気象情報を提供する． |
| **Surf&Snow**       | コース・リフト詳細, 画像, 概況            | `crawlGelendes.ts`                                                    | ユーザー向けの視覚情報や詳細スペックを補完する．  |
| **気象庁 (AMeDAS)** | 気温, 積雪深 (観測値)                     | `crawlAmedas.ts`                                                      | 実際の観測データによる裏付けを行う．              |
| **独自/その他**     | 積雪履歴, 最新レポート, ゆきまじ          | `crawlSnowDepths.ts`<br>`crawlLatestReports.ts`<br>`crawlYukiMagi.ts` | その他の付加価値情報．                            |

### 2. 名寄せ (Normalization) 特性
ウェブ上の情報にはスキー場名に強い「表記揺れ」や ID リテラルの差異が存在するため，`src/data/` 以下の手動整備された辞書ファイル・マップを利用して正確な突合を実現している．
*   **`SkiAreaNameDict.json`**: ベースとなる和名を正規化し，アプリケーション内で一意となる Master Name を解決する．
*   **`SnowJapanToSnowForecastDict.json`**: 外部サイト間の ID 同士の直接マッピングで不確実性を排除．
*   **`SnowForecastDict.json` / `SurfSnowDict.json`**: 各提供元での固有名称（英名・和名）と，内部 DB 上の正規化名とを動的にリンクさせる．

### 3. バウンダリと実行フロー (Idempotency)
すべてのクローリングスクリプトは冪等性を持っており，複数回実行しても差分のみが Upsert される安全な設計となっている．これらは Playwright 等を用いた複雑なスクレイピングロジックにより構築され，手動実行（開発環境）および毎日自動処理としての実行を見据えた堅牢な仕組みに基づく．

---

## ディレクトリとモジュール構造

```text
├── .husky/              # Git hooks (Lint/Format の実行等)
├── prisma/              # データベース定義ファイル
│   └── schema.prisma    # Prisma スキーマ (データモデル)
│   └── seed.ts          # 初期化用データセットアップ
├── public/              # 静的アセット (フォント, ロゴ, 画像メタ等)
├── src/
│   ├── actions/         # Server Actions (DB クエリラップ, ミューテーション)
│   ├── app/             # App Router における各ページやレイアウト定義
│   ├── components/      # クライアント・サーバーコンポーネント・共通 UI
│   ├── data/            # 名寄せ辞書ファイル・静的マスターデータ群 (JSON)
│   ├── lib/             # ユーティリティ関数群, Prisma クライアント初期化ロジック等
│   ├── providers/       # 各種 Context, Chakra テーマプロバイダ設定
│   ├── scripts/         # Playwright 等を用いた各種クローリングスクリプト群
│   └── types/           # アプリケーション全体の型定義 (Zod によるスキーマ定義も含む)
├── docker-compose.yml   # 開発用コンテナ・ネットワーク構成
├── mise.toml            # タスクランナーおよび依存ツールバージョン管理マニフェスト
├── package.json         # システム全体の依存ライブラリ構成
└── prisma.config.ts     # DB 接続設定およびシード処理など一元設定
```

---

## 主要コマンドリファレンス (`mise tasks`)

*   **開発とチェック**:
    *   `mise run dev` - Next.js ランタイム起動 ( http://localhost:3000 )
    *   `mise run check` - Biome & TypeScript による厳格なコード品質チェック
    *   `mise run lint` - コードフォーマットおよび潜在的な問題の修正
    *   `mise run typecheck` - TypeScript の手動型チェック
*   **インフラ・データベース**:
    *   `mise run db:up` - PostgreSQL (Docker) 起動・ヘルスチェック待機
    *   `mise run db:down` - コンテナ・ネットワークの破棄
    *   `mise run db:migrate` - Prisma マイグレーション実行
    *   `mise run db:studio` - Prisma Studio による DB GUI サーバ起動
*   **各種クローラー実行**:
    *   `mise run crawl:all` - パイプラインを全体実行 (※長時間・高負荷)
    *   `mise run crawl:ski-areas` / `mise run crawl:forecasts` など - 任意のサブタスクを実行
