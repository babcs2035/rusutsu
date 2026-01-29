# Rusutsu - スキー場情報統合プラットフォーム

**Rusutsu** は，日本全国のスキー場情報を多元的なソースから集約・統合し，一元的に可視化するアプリケーションである．
基本情報，コース詳細，リフト稼働状況，詳細な気象予測，そして積雪履歴などのデータを組み合わせ，スキー場の「今」と「これから」を正確に把握することを目指している．

## 技術スタック

本プロジェクトでは，モダンな Web 技術と堅牢なデータ処理パイプラインを採用している．

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict Mode)
- **Database**: [PostgreSQL](https://www.postgresql.org/) (via Docker)
- **ORM**: [Prisma](https://www.prisma.io/)
- **Scraping**: [Playwright](https://playwright.dev/) (Browser Automation) & Fetch API
- **Task Runner**: [mise](https://mise.jdx.dev/)
- **UI**: [Chakra UI](https://chakra-ui.com/) & Tailwind CSS

## 開発環境構築

本プロジェクトでは，ツール管理とタスクランナーとして [mise](https://mise.jdx.dev/) を全面的に採用している．
開発を始めるには，以下のステップのみで環境が整う．

### 1. 依存ツールのインストール
`mise` がインストールされている前提で，プロジェクトルートにて以下を実行する．これにより Node.js や pnpm のバージョンが自動的に固定される．

```bash
mise install
```

### 2. セットアップタスクの実行
依存パッケージのインストール，ブラウザバイナリの取得，データベースの起動，マイグレーション，シードデータの投入を一括で行う．

```bash
mise run setup
```

### 3. 開発サーバーの起動

```bash
mise run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開く．

## データ処理アーキテクチャ

本システムの特徴は，複数の異なるデータソースを「辞書」を用いて高精度に名寄せし，統合している点にある．

### 1. データソースと役割

| データソース        | 取得データ                                | 対応スクリプト                                                        | 役割                                              |
| :------------------ | :---------------------------------------- | :-------------------------------------------------------------------- | :------------------------------------------------ |
| **SnowJapan**       | スキー場基本情報 (ID, 名称, 所在地, 標高) | `crawlSkiAreas.ts`                                                    | **マスターデータ**．全てのデータの基点となる．    |
| **Snow-Forecast**   | 過去気象データ, 週間天気予報              | `crawlWeathers.ts`<br>`crawlForecasts.ts`                             | 高度別 (Top/Mid/Bot) の詳細な気象情報を提供する． |
| **Surf&Snow**       | コース・リフト詳細, 画像, 概況            | `crawlGelendes.ts`                                                    | ユーザー向けの視覚情報や詳細スペックを補完する．  |
| **気象庁 (AMeDAS)** | 気温, 積雪深 (観測値)                     | `crawlAmedas.ts`                                                      | 実際の観測データによる裏付けを行う．              |
| **独自/その他**     | 積雪履歴, 最新レポート, ゆきまじ          | `crawlSnowDepths.ts`<br>`crawlLatestReports.ts`<br>`crawlYukiMagi.ts` | その他の付加価値情報．                            |

### 2. 名寄せ (Normalization) 戦略

各サイトで異なるスキー場名の表記揺れを吸収するため，`src/data/` ディレクトリ配下の辞書ファイルを活用している．

*   **`SkiAreaNameDict.json`**:
    *   SnowJapan の表記揺れを補正し，システム内で統一された「和名 (`nameJa`)」を定義する．
*   **`SnowJapanToSnowForecastDict.json`**:
    *   システム ID と Snow-Forecast の ID を直接マッピングする．最も信頼性が高い．
*   **`SnowForecastDict.json`**:
    *   Snow-Forecast 上の英名を，データベース上の英名 (`nameEn`) に変換する．
*   **`SurfSnowDict.json`**:
    *   Surf&Snow 上の名称を，データベース上の和名 (`nameJa`) に変換する．

### 3. データ更新フロー

クローリングは冪等性 (Idempotency) を意識して設計されており，`upsert` (更新または作成) 操作を基本としている．

1.  **`crawlSkiAreas.ts`** が実行され，`SkiResort` テーブルのマスターデータが更新される．
2.  **`crawlGelendes.ts`** などがそのマスターデータを参照し，詳細情報を付与 (Update) する．
3.  **`crawlForecasts.ts`** などが外部 ID を解決し，関連テーブル (`Weather`, `Forecast`) にデータを追加・更新する．

Cron により，毎日日本時間 06:00 にこれらの処理が自動実行される．

## コマンドリファレンス (mise tasks)

開発中の主要な操作は `mise` タスクとして定義されている．

### 開発・品質管理

*   `mise run dev`: 開発サーバーを起動する．
*   `mise run check`: Lint (Biome) と型チェック (tsc) を一括実行する．CI で実行されるコマンドと同等．
*   `mise run lint`: コードのフォーマット修正と Lint を実行する (`biome check --write`)．
*   `mise run typecheck`: TypeScript の型チェックを行う．

### データベース操作 (Prisma)

*   `mise run db:up`: PostgreSQL コンテナを起動する．
*   `mise run db:down`: PostgreSQL コンテナを停止する．
*   `mise run db:studio`: データベースの中身を GUI で確認・編集する (Prisma Studio)．
*   `mise run db:reset`: データベースを初期化 (全削除) し，シードデータを再投入する．

### クローリング実行

特定のデータを手動で更新したい場合に使用する．

*   `mise run crawl:all`: 定義されている全てのクローリングタスクを順次実行する．(**時間がかかるため注意**)

**個別実行 (推奨)**:
個別のスクリプトを実行する場合は，以下のように mise タスクを利用する．

```bash
# 基本情報の更新
mise run crawl:ski-areas

# 天気予報の更新
mise run crawl:forecasts
```

## ディレクトリ構造

*   `src/app`: Next.js App Router ページ．
*   `src/actions`: Server Actions (データフェッチのトリガーなど)．
*   `src/components`: UI コンポーネント．
*   `src/data`: **名寄せ用辞書ファイル (JSON)**．
*   `src/lib`: Prisma クライアント，ユーティリティ関数．
*   `src/scripts`: **クローリングスクリプト群**．
    *   `crawl_latest/`: 特定リゾートのリアルタイム独自解析スクリプト．
