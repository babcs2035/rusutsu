# Rusutsu - スキー場情報統合プラットフォーム

**Rusutsu** は，日本全国のスキー場情報を複数の外部サイトから収集・名寄せし，一元的に可視化する Next.js アプリケーションである．基本情報，コース／リフトの稼働状況，気象予報，積雪履歴，リフト券料金，レビューを組み合わせ，スキー場の「今」と「これから」を把握する．一般利用向けの公開サイト（地図・検索・詳細・比較）と，データの入力・修正を行う管理画面（`/admin`）から構成される．

バックエンド移行の資料は、[初心者向けの操作手順書](docs/backend-migration-beginner-guide.md)と[サーバー・DB・Docker・APIの解説書](docs/backend-migration-explained.md)に分けています。外部バックアップを使わず、GitHubの設定から配備する構成です。

## 機能

### 公開サイト

#### スキー場地図

*   Leaflet による日本全体地図に各スキー場のマーカーを表示する．ラベルの衝突回避とクラスタリングを実装している．
*   コース・リフトを GeoJSON の線として描画する．コースは難易度・斜度で色分けし，非圧雪は破線，リフトは流速を表現する．
*   地理院地図／写真タイルの切り替え，凡例表示に対応する．

#### 検索とフィルタ

*   キーワード検索（ひらがな・カタカナ，旧名称でもヒットする）と，都道府県，地域，標高，コース数，リフト数などの条件で絞り込む．
*   検索結果は一覧表示され，詳細表示への導線と比較対象への追加を提供する．

#### スキー場詳細

タブ形式で表示する．

*   **概要**: 基本情報，主要指標（標高差，コース・リフト数など），画像，概要テキスト，レビュー．
*   **コース**: コース一覧（難易度，距離，斜度），地図上で選択したコースの詳細，標高プロファイル．
*   **リフト**: リフト一覧（種別，距離，稼働状況）．
*   **チケット**: チケット料金表とリフト券計算機．
*   **気候**: Snow-Forecast 埋め込み，積雪深グラフ，各気象サービス（Snow-Forecast / tenki.jp / ウェザーニュース / Windy）へのリンク．

スキー場名はふりがな付き（`<ruby>`）で表示し，旧名称を併記する．

#### スキー場比較

複数のスキー場を比較対象に追加し，概要・気候・リフト券・レビューのタブで比較表示する．

#### リフト券計算機

*   同行者構成（幼児から大人，障がい者など）と滑る長さ（1 日 / N 時間）を入力する．
*   スキー場ごとの料金データから，条件を満たす券のうち割引プランやナイター込みの組み合わせも含めて最安プランを算出する．

#### レビュー

コースタイプ（初心者 / 中級者 / 上級者 / コブ / パウダー / ツリーラン / パーク）ごとのスコア（◎ / ○ / △）を表示する．

### 管理画面 (`/admin`)

*   Google OAuth（Auth.js v5）でログインする．ロールは `viewer` / `admin` があり，`ADMIN_EMAILS` 環境変数に列挙されたメールアドレスが `admin` として扱われる．
*   `/admin` ルートは `src/proxy.ts` が保護する．クッキーの JWT を直接検証するため DB アクセスを必要とせず，未認証はログインページへ，非 admin は権限なしページへリダイレクトする．
*   **ダッシュボード**: ユーザー管理と編集ツールへのリンク．
*   **スキー場マスター編集** (`/admin/resort`): 基本情報と地図・比較用の短縮名を編集し，閉業等の施設をデータ削除せず公開停止・再有効化できる．
*   **リフト入力** (`/admin/lift`): スキー場選択 → 所属確認・変更 → 位置補正 → 詳細情報 → 全体情報リンク → 確認・保存 の 6 ステップで編集する．
*   **コース入力** (`/admin/slope`): マップエディタでのライン描画・補正と詳細情報の編集，確認・保存を行う．
*   **リフトチケット入力** (`/admin/ticket`): JSON Schema からフォームを生成して編集する（スキーマは Skill 側が正本）．保存前に Skill 自身の検証スクリプトを実行する．
*   **レビュー入力** (`/admin/review`): スキー場ごとのレビュー記事の管理・保存を行う．

## 技術スタック (Technical Stack)

*   **Framework**: [Next.js 16](https://nextjs.org/) (App Router & Turbopack, base path `/rusutsu`, standalone 出力)
*   **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict Mode)
*   **Runtime**: [Node.js 24](https://nodejs.org/)
*   **Database**: [PostgreSQL 16](https://www.postgresql.org/) (via Docker Compose)
*   **ORM**: [Prisma 7](https://www.prisma.io/) (driver adapter `@prisma/adapter-pg`，`prisma.config.ts` による接続設定一元管理)
*   **UI Framework**: [shadcn/ui](https://ui.shadcn.com/) (Base UI) + [Tailwind CSS v4](https://tailwindcss.com/)，[Lucide React](https://lucide.dev/)，[sonner](https://sonner.emilkowal.ski/) (toast)，embla-carousel，vaul (sheet)，cmdk，react-day-picker
*   **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
*   **Data Visualization**: [Leaflet](https://leafletjs.com/) + react-leaflet + leaflet.markercluster (地図表示), [Recharts](https://recharts.org/) (グラフ描画)
*   **Authentication**: [Auth.js v5](https://authjs.dev/) (Google OAuth, JWT セッション)
*   **Scheduling**: [node-cron](https://github.com/node-cron/node-cron)
*   **Scraping / Automation**: [Playwright](https://playwright.dev/) & Fetch API
*   **Validation / Config**: [Zod](https://zod.dev/), [dotenv](https://github.com/motdotla/dotenv)
*   **Testing**: `node:test`
*   **Toolchain**: [mise](https://mise.jdx.dev/) (Task & Runtime Manager), [Biome](https://biomejs.dev/) (Linter/Formatter), [husky](https://typicode.github.io/husky/) + lint-staged
*   **CI/CD**: [GitHub Actions](https://github.com/features/actions) (CI + Docker build/deploy)
*   **Containerization**: Multi-stage Docker build (node:24-slim, arm64 対応)

---

## 開発環境構築 (Development Setup)

本プロジェクトでは，ツール管理とタスクランナーとして `mise` を採用している．

### 1. リポジトリのクローン

`src/private`（名寄せ辞書・外部データ・クローラースクリプト）は git submodule（別リポジトリ）として管理されているため，`--recurse-submodules` 付きでクローンする．

```bash
git clone --recurse-submodules git@github.com:babcs2035/rusutsu.git
```

### 2. ツールのインストール

```bash
mise install
```

### 3. 自動セットアップ (`mise run setup`)

```bash
mise run setup
```

以下のステップが自動で実行される:

1.  `.env` 生成（`.env.example` からコピー）
2.  `pnpm install` による依存解決
3.  Playwright Chromium バイナリのダウンロード
4.  PostgreSQL コンテナ起動（ヘルスチェック待機付き）
5.  Prisma マイグレーション実行
6.  Prisma Client 生成
7.  データベースシード（DB 接続確認）

setupは運用データを自動投入しない．完全に空のDBではスキー場マスターも作らず，
古いクローラーで再構築しない．本番APIの利用またはDBバックアップの復元を選ぶ．
既存環境の安全な再起動，本番APIへの切り替え，fresh DBの扱いは
[`docs/backend-migration-runbook.md`](docs/backend-migration-runbook.md) を参照する．

### 4. 開発サーバー起動

```bash
mise run dev
```

ブラウザで [http://localhost:3000/rusutsu](http://localhost:3000/rusutsu) にアクセスする．このアプリは Next.js の base path `/rusutsu` 配下で配信されるため，`/` は検証対象にしない．

### 環境変数

| 変数                                        | 内容                                                         |
| :------------------------------------------ | :----------------------------------------------------------- |
| `DATABASE_URL`                              | PostgreSQL 接続文字列                                        |
| `AUTH_SECRET`                               | Auth.js のシークレット                                       |
| `AUTH_URL`                                  | アプリのorigin（`/rusutsu`なし。Cookieのsecure設定を左右する） |
| `AUTH_TRUST_HOST`                           | Auth.js の host 信頼設定                                     |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth の認証情報                                      |
| `ADMIN_EMAILS`                              | 管理者のメールアドレス（カンマ区切り）．`admin` ロールを付与 |
| `INTERNAL_DATA_API_ADMIN_TOKEN`             | ローカルNext.jsから正本データを読み書きする管理用トークン（クローラーには渡さない） |
| `INTERNAL_DATA_API_CRAWLER_TOKEN`           | `crawl_latest` の結果と警告・失敗DOMを投入する専用トークン |
| `INTERNAL_DATA_API_DIAGNOSTICS_TOKEN`       | 警告・失敗runとDOMを取得する専用トークン                 |
| `DATA_API_BASE_URL`                         | ローカルNext.jsと本番のcrawl_latest専用schedulerが接続する正本API URL（本番appコンテナには渡さない） |
| `CRAWLER_ARTIFACT_ROOT`                     | 警告・失敗時だけ保存する診断DOMの永続化ディレクトリ       |
| `CRAWLER_ARTIFACT_RETENTION_DAYS`           | 診断DOMの保持期間（既定30日） |
| `DATA_DOCUMENT_ALLOW_BUNDLED_FIXTURES`      | 開発DBへの初回移行前だけ，同梱fixtureを読む明示設定．通常は未設定 |
| `CRAWL_LATEST_CRON`                         | `crawl_latest`専用schedulerのcron（既定`0 7 * * *`、Asia/Tokyo） |
| `CRAWL_LATEST_CONCURRENCY`                  | `crawl_latest`の同時実行数（既定1、最大4）                |
| `CRAWL_LATEST_TIMEOUT_MS`                   | 1スキー場あたりの制限時間（既定1,200,000ms＝20分）        |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`           | 編集画面の Google Maps 用 API キー                           |
| `APP_PORT` / `DB_PORT`                      | Dockerで公開するアプリ / DBのポート番号                      |

Next.jsをホストで直接起動する際の `PORT` は `.env` から読み込まれない。通常は3000番を使い、
変更時は `PORT=4000 mise run dev` のようにコマンドへ渡す。`DATA_API_BASE_URL` は本番では
`https://host/rusutsu` のようにbase pathまで含める．本番appには接続先として渡さず，
schedulerとローカルNext.jsで使う．3種類の内部APIトークンには異なる値を設定し，
`NEXT_PUBLIC_*` に置かない．旧共通トークン `INTERNAL_DATA_API_TOKEN` は廃止しており使えない．

---

## デプロイ (Deployment)

### Docker ビルド

`Dockerfile` により multi-stage build で本番イメージを構築する．通常のコンテナ起動は
サーバーを起動するだけで，migrationやJSONの投入は行わない．DB migrationはバックアップ後に
`scripts/ops/deploy.sh` が `prisma migrate deploy` で実行する．既存migrationを保持し，
各DBで未適用のmigrationだけを一度適用する．

本番appの交換で消さないデータは別のDocker volumeに保存する．

- PostgreSQL: `postgres_data`
- 警告・失敗DOM: `crawler_artifacts`
- schedulerのレポート・日次lock: `crawler_worker_artifacts`

`crawl-latest-scheduler` は段階試験後に `crawlers` profileを有効にすると常駐し，現在の93本を
毎日07:00 JSTに実行する．appのreadinessを待ち，起動直後にはクロールしない．
本番コンテナ内だけに存在するJSON/GeoJSONはなく，旧コンテナからJSONを退避・比較する作業は不要である．

### CI/CD (GitHub Actions)

以下は実装済みの移行後フローであり，今回の変更はまだ本番へ導入していない．
`.github/workflows/ci-cd.yml` はmainへのpushまたは手動実行で次を行う．

1. Biome，TypeScript，単体・契約テストと，使い捨てDBでmigrationを検証する．schemaだけ変更してmigrationを忘れた場合も検出する．
2. Docker imageをbuildし，検証したcommit SHAのtagでGHCRへpushする．
3. GitHub SecretsのAPIキーと既存コンテナのDB・ログイン設定を合成する．既存projectとDB volumeを確認し，同じDBへ接続できるか検証する．
4. DB変更用pathの変更や明示フラグがある場合は，同じVPS内にDB全体をコピーする．dump形式とchecksumの確認を終えてからmigrationへ進み，コピー失敗時は停止する．
5. `initialize_data=true` の初回移行時だけ文書と短縮名を投入し，appを起動する．初回pushではRepository variable `INITIALIZE_CANONICAL_DATA=true` でも指定でき，成功確認後に外す．
6. DB接続と公開HTTPSの `/rusutsu` のreadinessが成功した場合だけdeploy完了とする．

DB変更の対象はmigration・schema・初回import・明示backfill等のpathで判定する．UI変更や
クローラーファイル追加だけではdeploy前バックアップを要求しない．一括更新等では
`force_database_backup=true` を指定できる．
`.github/workflows/database-backup.yml` はpushと無関係に毎日01:15 JSTのバックアップを要求する．
既定で30世代と7日以内のデータを残す．保存先はSSHユーザーの `~/.local/state/rusutsu/<project>/backups/` に自動作成し，Gitの外へ置く．
外部転送と暗号鍵の準備は不要で，VPS自体のディスク故障は対象外である．手動実行の `test_restore` で別の一時DBへの復元を確認できる．
APIキー3つはGitHub Secretsへ登録し，既存のDB・OAuth・ポート設定はコンテナから引き継ぐ．元の `.env` は上書きしない．
DOMはDBコピーに含まれず，古い日次lockは復元しない．

初回deployと復元試験の手順は
[`docs/backend-migration-runbook.md`](docs/backend-migration-runbook.md) を参照する．

---

## アプリケーション技術仕様 (Architecture Details)

### Frontend (Next.js App Router)

*   **Server Actions**: 管理UIの呼び出し口として使い、Action内でも毎回管理者権限を再確認する．ローカルから正本データへの接続は、ブラウザーではなくNext.jsサーバーからトークン付き内部APIへ送る．
*   **UI/UX**: shadcn/ui (Base UI) + Tailwind CSS v4 によるコンポーネント指向 UI．
*   **Client State**: Zustand によるフィルタリング状態や比較対象などのクライアント状態管理．
*   **Visualization**: React Leaflet による動的地図コンポーネント（ブラウザ専用のため dynamic import で SSR を無効化），Recharts による気象トレンド・積雪データの可視化．
*   **ルート保護**: `src/proxy.ts` が `/admin` ルートをガードする．
*   **Instrumentation**: `src/instrumentation.ts` が本番環境の起動時に雪マジ用スケジューラを開始する（開発環境では無効）．`crawl_latest` は別コンテナの専用schedulerで動かす．

### Backend & Database (PostgreSQL + Prisma 7)

*   **Prisma 7 のアーキテクチャ**: driver adapter（`@prisma/adapter-pg`）方式を採用し，接続設定を `prisma.config.ts` で一元管理する．`schema.prisma` 上の静的な `url` 定義は持たない．
*   **正本データ**: 本番PostgreSQLに運用データを集約する．本番Next.jsはDBを直接使い，`DATA_API_BASE_URL` があるローカルNext.jsはサーバーから内部APIを使う．admin編集をGit版JSONで上書きしない．
*   **初回投入**: `CanonicalDataMigration` に完了を記録し，文書追加と完了記録を同じtransactionで確定する．完了後は再実行しても書き込まず，DBから削除した文書もGit版で復活させない．通常運用は実行時のGit fallbackなし．開発用fixtureの例外は明示設定がある初回移行前だけである．
*   **公開データ**: スキー場と料金は公開項目を明示し，元JSONの未知の管理フィールドや不要な旧weather JSONを送らない．地図の座標・短縮名など，表示に必要な公開データはDevToolsから確認できる．旧weather取得のServer Actionは管理者専用である．
*   **スケジューラ**: `src/lib/scheduler.ts` が毎日 03:00 (JST) に雪マジのみを実行する．別の `scripts/scheduleCrawlLatest.ts` は毎日07:00 (JST) に現在の `crawl_latest` 93本を実行する．どちらも起動直後には実行しない．他の従来クローラー本体と手動実行コマンドは保守用に残す．

### データモデル

| モデル                         | 内容                                                                       |
| :----------------------------- | :------------------------------------------------------------------------- |
| `SkiResort`                    | スキー場マスター（名称，短縮名`shortName`，所在地，標高，コース・リフト概要，営業時間，概況，公開状態） |
| `Course`                       | コース（名称，難易度，距離，斜度，備考）                                   |
| `Lift`                         | リフト（名称，種別，距離，フード）                                         |
| `Ticket`                       | チケット（名称，年齢別の料金）                                             |
| `Weather`                      | 日別天気（Top/Mid/Bot データを JSON で保持，スキー場 + 日付で一意）        |
| `Forecast`                     | 予報（Top/Middle/Bottom データを JSON で保持，スキー場ごとに 1 件）        |
| `SnowDepthRecord`              | 積雪深履歴（スキー場 + 日付で一意）                                        |
| `SnowFallRecord`               | 降雪量履歴（スキー場 + 日付で一意）                                        |
| `LatestReport`                 | 最新ゲレンデレポート（スキー場ごとに 1 件）                                |
| `AmedasData`                   | アメダス観測値（スキー場に紐付かない）                                     |
| `YukiMagi`                     | 雪マジ情報（スキー場と関連）                                               |
| `DataDocument`                 | 管理画面で編集するJSON/GeoJSONの正本（hashとversionを保持）                  |
| `CanonicalDataMigration`       | 一度限りの文書・短縮名投入の完了記録と元データhash                         |
| `CrawlLatestRun` ほか          | `crawl_latest` の実行履歴、カテゴリ別正常値、警告、診断DOMのメタデータ       |
| `User` / `Account` / `Session` | Auth.js v5 用（ロール: `viewer` / `admin`）                                |
| `CrawlLog`                     | クローラー実行ログ（名称，最終実行時刻，状態，メッセージ）                 |

---

## データ処理パイプライン (Crawling & Data Normalization)

### 1. データ収集ソース

以下は既存クローラーの役割の一覧であり，自動実行対象の一覧ではない．定期実行は雪マジと
`crawl_latest/resorts`だけとし，構築済みの基本情報を古いクローラーで再構築しない．

| データソース                                    | 取得データ                                                      | 対応スクリプト                                                                               | 役割                                                                       |
| :---------------------------------------------- | :-------------------------------------------------------------- | :------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| **SnowJapan**                                   | 基本情報 (マスターデータ), 積雪深履歴, 降雪量履歴, 最新レポート | `crawlSkiAreas.ts`<br>`crawlSnowDepths.ts`<br>`crawlSnowFalls.ts`<br>`crawlLatestReports.ts` | 全てのデータの基点．                                                       |
| **Surf&Snow**                                   | コース・リフト詳細, 画像, 概況                                  | `crawlGelendes.ts`                                                                           | 視覚情報や詳細スペックを補完．                                             |
| **Snow-Forecast**                               | 天気 (Top/Mid/Bot), 予報                                        | `crawlWeathers.ts`<br>`crawlForecasts.ts`                                                    | 高度別 (Top/Mid/Bot) の詳細な気象情報．                                    |
| **気象庁 (AMeDAS)**                             | 積雪深・降雪量の観測値                                          | `crawlAmedas.ts`                                                                             | 実際の観測データによる裏付け．                                             |
| **雪マジ (majibu.jp)**                          | 雪マジ情報                                                      | `crawlYukiMagi.ts`                                                                           | 雪マジ対象施設の情報．                                                     |
| **tenki.jp / ウェザーニュース / Snow-Forecast** | 各気象サービスのスポット ID リスト                              | `crawlTenkijp.ts`<br>`crawlWeatherNews.ts`<br>`crawlSnowForecast.ts`                         | スポット ID を `SkiResortWeatherIds.json` に同期し，気象リンク生成に利用． |

上記に加え，クローリングで取得しないデータがある．

*   **リフト券料金**: `.shared/skills/collect-ski-lift-ticket-pricing` の Skill を用いて各スキー場の公式サイトから収集する．構造の正本は Skill 側の JSON Schema である．Git同梱の `src/private/data/lift-ticket/{resort-id}/` は初回投入元で，運用開始後の正本はPostgreSQLである．
*   **レビュー**: Git同梱の `src/private/data/reviews/{resort-id}/` を初回投入し，以後は管理画面からPostgreSQL上の文書を編集する．
*   **コース・リフトのジオメトリ**: Git同梱GeoJSONを初回投入し，以後は管理画面からPostgreSQL上の元線と公開用派生線を同時に編集する．

### 2. 名寄せ (Normalization)

`SkiResortReadings.json` と `SkiResortWeatherIds.json` は静的な表示・外部リンク補助設定として
Gitに残す．`src/private` はprivate crawler code，対応辞書，初回fixtureの保管場所として継続する．

ウェブ上では、同じ物でも提供元ごとに名前が違う。この違いを吸収する「名前の対応表」が
名寄せ辞書である。用途の異なる対応表を区別している．

*   **`SkiAreaNameDict.json`**: DB上のスキー場名と雪マジ側の施設名を対応させる．例えば「ピリカスキー場」と「今金町ピリカスキー場」を同じ施設として扱う．
*   **`SnowJapanToSnowForecastDict.json`**: 外部サイト間の ID 同士の直接マッピング．
*   **`SnowForecastDict.json` / `SurfSnowDict.json`**: 各提供元での固有名称と内部 DB 上の正規化名を動的にリンク．
*   **各`crawl_latest/resorts/*.ts`の`courseNameMap` / `liftNameMap`**: 公式ページ上のコース・リフト名をアプリ内の統一名へ変換する．例えば「バンビ - 上部」を「バンビ上部」にする．
*   **`latest_status_mapping`**: クロールした名前とGeoJSON上のコース・リフト線を対応させる．adminで調整する運用データで、移行後の正本はPostgreSQLである．
*   **`SkiResortNameAliases.json`**: `SkiResort.shortName` への一度限りの投入元（113件）．実行時はDB値を参照し，adminで編集する．短縮名は公開情報であり，外部データの名寄せ辞書ではない．将来の複数別名は別の `SkiResortAlias` 等で管理する．
*   **`SkiResortReadings.json`**: ふりがな（ルビ）と旧名称．検索（ひらがな・カタカナ・旧名称でのヒット）と表示（`<ruby>` によるふりがな，旧称の併記）に利用．
*   **`SkiResortLinks.json`**: スキー場ごとの参考 URL（スキースクール，スノーボードスクール，公式 LINE）の初回投入元．admin編集後の正本はDBのDataDocumentである．
*   **`SkiResortWeatherIds.json`**: 各気象サービスのスポット ID．詳細・比較画面の気象リンク生成に利用．
*   **`SnowForecastSlugBySkiResortId.json` / `SnowForecastSpots.json` / `TenkijpSpots.json` / `WeathernewsSpots.json`**: スポット ID 同期の中間データ．

※ 辞書のキー→値の向き（正式名→別名か別名→正式名か）はファイルごとに異なるため，利用時は個別に確認する．

クローラーの検証ルールは、取得結果を最新値に採用してよいか判断する警報条件である。名前・
状態の欠落、`○`・`△`・`×`以外の未知状態、重複、想定件数との差、取得元URLがあるのに
空になったカテゴリ、不正URL、天気値の欠落や異常範囲などを検査する。警告時には原因DOMと
生結果を保存し、そのカテゴリは最新値へ昇格させない．

### 3. 実行と冪等性

*   従来のクローラー本体は削除していない．個別実行は `mise run crawl:ski-areas` などのタスク，一括実行は `mise run crawl:all` で引き続き行える．
*   従来系で自動実行するのは雪マジだけで，本番スケジューラが毎日03:00 (JST) に実行する．それ以外の従来クローラーは自動実行しない．
*   スキー場別 `crawl_latest` は本番の専用schedulerが毎日07:00 (JST) に現在の93本を実行し，正常値を内部APIへ送る．実行対象は`resorts/*.ts`から自動列挙し，`template.ts`、`*_before.ts`、テストファイルを除外する．
*   ローカル確認は `mise run crawl:latest -- --local-files --resort <id>` を使う．正常結果は`src/private/data/resorts-temporary/latest_data/<id>/<日時>.json`、警告時の生結果とDOMは通常`var/crawler-artifacts/crawl_latest_dom/<id>/`以下に残るため、VS Codeで確認できる．このモードは本番API設定を明示的に無効化し、生成JSONをGitHub経由で本番値にする運用には使わない．
*   本番の警告・失敗DOMは `mise run crawl:diagnostics:pull -- --resort <id>` でVS Code用に取得できる．本番schedulerの導入は、ローカル1件、本番APIへ1件、少数件、全93件の順で確認する．
*   書き込み戦略はモデルごとに upsert や削除→再作成など異なる．履歴系テーブルはスキー場 + 日付の一意制約で重複行を防ぐ．

---

## ディレクトリ構造

本プロジェクトのフロントエンドは，Next.js App Router の入口を `src/app` に薄く残し，画面・機能ごとの実装を `src/features` に集約する構成としている．画面をまたいで利用する UI だけを `src/shared` に置き，`src/components` には shadcn/ui コンポーネントと管理画面共通部品のみを置く．

~~~text
├── .github/workflows/             # CI/CD ワークフロー (CI + Build + Deploy)
├── .shared/skills/                # リフト券料金収集 Skill (JSON Schema, 検証スクリプト, fixtures)
├── docs/                          # 調査レポートと指針
├── plans/                         # 変更計画 (p0000_TITLE.md)
├── prisma/                        # Prisma スキーマ，マイグレーション，seed
│   ├── schema.prisma              # DB のデータモデル定義
│   └── seed.ts                    # シード（DB 接続確認のみ）
├── public/                        # 静的アセット
├── src/
│   ├── actions/                   # Server Actions．管理画面からの取得・更新の入口
│   │   ├── auth.ts                # 認証関連の Server Action
│   │   ├── crawl.ts               # 既存コード向けのserver-only互換export
│   │   └── skiResorts.ts          # スキー場一覧・詳細データ取得 (料金・レビュー・GeoJSON 含む)
│   ├── app/                       # Next.js App Router．ルーティングと初期データ取得の入口
│   │   ├── globals.css            # グローバル CSS (Tailwind)
│   │   ├── layout.tsx             # アプリ全体の HTML / Provider 境界
│   │   ├── page.tsx               # トップページの Server Component．HomeClient に初期データを渡す
│   │   ├── admin/                 # 管理画面 (ログイン, ダッシュボード, リフト/コース/チケット/レビュー入力)
│   │   └── api/auth/              # Auth.js ルートハンドラ
│   ├── auth.ts                    # Auth.js v5 ハンドラ (auth / signIn / signOut)
│   ├── components/                # shadcn/ui コンポーネント (ui/) と管理画面共通部品
│   ├── features/                  # 画面・機能単位のフロントエンド実装 (後述)
│   ├── hooks/                     # メディアクエリなどの共有 hook
│   ├── instrumentation.ts         # 本番起動時のクローラースケジューラ開始
│   ├── lib/                       # Prisma，クローラー管理，スケジューラ，GeoJSON 変換などの共通処理
│   ├── private/                   # [git submodule] 名寄せ辞書・外部データ・クローリングスクリプト
│   │   ├── data/                  # JSON 辞書，スポット ID 対応表，リフト券/レビュー/ジオメトリデータ
│   │   └── scripts/               # クローラーとデータ加工スクリプト
│   ├── proxy.ts                   # /admin ルートの保護 (JWT 検証)
│   ├── shared/                    # 複数 feature から使う最小限の共有 UI / hook / util
│   └── types/                     # アプリ全体で共有する型定義
├── docker-compose.yml             # 開発用コンテナ設定
├── docker-compose.production.yml  # 本番デプロイ用設定
├── Dockerfile                     # multi-stage Docker build (Node 24, arm64)
├── mise.toml                      # タスクランナー・ランタイムバージョン管理
├── package.json                   # 依存ライブラリ構成
└── prisma.config.ts               # Prisma 7 の DB 接続設定
~~~

正本DB、内部API、Docker volume、GitHubの役割と本番設定は
[`docs/backend-data-architecture.md`](docs/backend-data-architecture.md) を参照する．
ローカル復旧から本番移行までの具体的な順序は
[`docs/backend-migration-runbook.md`](docs/backend-migration-runbook.md) を参照する．

## features のディレクトリ構造

`src/features` は画面・機能ごとに閉じた責務を持つ．各 feature の中では，親コンポーネント，表示部品，hooks，utils，types を分け，feature 内でしか使わない実装を外へ漏らさない方針としている．

### features/filters

スキー場検索条件の入力 UI と，フィルタ条件による絞り込み処理を担当する．トップページから渡された Filters を更新するが，検索結果一覧や地図表示は担当しない．

~~~text
features/filters/
├── FilterPanel.tsx
├── components/
│   └── FilterControls.tsx
├── constants.ts
├── hooks/
│   └── useFilterPanelState.ts
├── types.ts
└── utils/
    ├── filterLabels.ts
    └── filterResorts.ts
~~~

| ファイル                      | 役割                                                                                                                           |
| :---------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| FilterPanel.tsx               | フィルタ UI 全体の親コンポーネント．キーワード検索，件数表示，折りたたみ表示，検索実行ボタン，各フィルタ UI の配置を担当する． |
| components/FilterControls.tsx | 個別フィルタ UI 群．都道府県選択，地域一括選択，トグル，標高・コース数・リフト数などの数値入力，詳細条件の開閉 UI を持つ．     |
| constants.ts                  | デフォルトフィルタ値，地域・都道府県グループ，営業状況などフィルタの固定値．                                                   |
| hooks/useFilterPanelState.ts  | FilterPanel 内の入力 handler，id 生成，地域選択，リセット，折りたたみ時のラベル生成に必要な状態をまとめる hook．               |
| types.ts                      | Filters，数値フィルタ名，フィルタ値など検索条件の型定義．                                                                      |
| utils/filterLabels.ts         | 折りたたみ表示などで使う「現在の条件を人が読める文言にする」処理．                                                             |
| utils/filterResorts.ts        | スキー場一覧に対して検索条件を適用する純粋関数．フィルタが有効かどうかの判定もここに置く．                                     |

### features/home

トップページ全体の状態管理と，各 feature の接続を担当する．地図，検索フィルタ，検索結果一覧，詳細パネル，比較パネルをまとめるが，個々の UI やデータ整形の詳細は別 feature / component に委譲する．

~~~text
features/home/
├── HomeClient.tsx
├── components/
│   ├── CompareActionButton.tsx
│   ├── DesktopSearchPanel.tsx
│   ├── MobileResultsSheet.tsx
│   ├── MobileSearchButton.tsx
│   ├── MobileSearchOverlay.tsx
│   ├── MobileSearchTopBarShell.tsx
│   ├── SkiResortCompareView.tsx
│   ├── SkiResortList.tsx
│   └── compare/
│       ├── CompactSnowForecastEmbed.tsx
│       ├── CompareLiftTicketTab.tsx
│       ├── CompareOverviewTab.tsx
│       ├── CompareReviewsTab.tsx
│       ├── CompareWeatherTab.css
│       ├── CompareWeatherTab.tsx
│       ├── constants.ts
│       ├── types.ts
│       └── useCompareWeatherLinks.ts
├── constants.ts
├── hooks/
│   ├── useHomeGestureGuards.ts
│   ├── useMapZoomIntentListener.ts
│   ├── useMobileSearchOverlayEffects.ts
│   └── useSidePanelLayout.ts
├── layout/
│   └── HomeLayout.tsx
├── types.ts
└── utils/
    └── dom.ts
~~~

| ファイル                                        | 役割                                                                                                                                                                                                                                            |
| :---------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HomeClient.tsx                                  | トップページの Client Component．検索条件，選択中スキー場，詳細パネル，比較対象，地図 viewport 復元など，トップページ全体の状態と handler を管理する．地図は SSR しないため JapanResortMap を dynamic import し，描画は HomeLayout に委譲する． |
| layout/HomeLayout.tsx                           | トップページの画面配置を組み立てる layout component．地図，PC サイドパネル，モバイル検索 overlay / bottom sheet，詳細パネル，比較パネルを配置する．                                                                                             |
| constants.ts                                    | home 画面で共有する bottom sheet snap point，モバイル比較ボタン位置，gesture 判定 selector などの固定値．                                                                                                                                       |
| types.ts                                        | home 画面内で共有する地図 viewport 復元，検索復帰状態，visual viewport 状態などの型．                                                                                                                                                           |
| utils/dom.ts                                    | pointer events 復元，検索結果スクロール位置復元，入力要素判定，地図 zoom surface 判定など DOM 操作系の補助関数．                                                                                                                                |
| hooks/useSidePanelLayout.ts                     | PC サイドパネル layout に切り替わる media query 状態を管理する hook．                                                                                                                                                                           |
| hooks/useHomeGestureGuards.ts                   | モバイル bottom sheet / overlay と地図操作が干渉しないよう，pinch / gesture 系イベントを制御する hook．                                                                                                                                         |
| hooks/useMobileSearchOverlayEffects.ts          | モバイル検索 overlay の自動 focus，body scroll lock，visualViewport によるキーボード inset 監視を扱う hook．                                                                                                                                    |
| hooks/useMapZoomIntentListener.ts               | 地図 zoom surface 上の wheel / double click / multi-touch を検知し，bottom sheet の畳み込みなどにつなげる hook．                                                                                                                                |
| components/MobileSearchButton.tsx               | モバイル画面上部の検索起動ボタン．検索 overlay を開く入口を担当する．                                                                                                                                                                           |
| components/MobileSearchOverlay.tsx              | モバイル検索 overlay．キーワード入力と FilterPanel を全画面で表示し，キーボード表示時の余白を受け取って描画する．                                                                                                                               |
| components/MobileSearchTopBarShell.tsx          | モバイル検索 overlay の上部バーのシェル．safe area を含む固定高さの枠組みと送信 handler を提供する．                                                                                                                                            |
| components/DesktopSearchPanel.tsx               | PC 用の右サイドパネル．FilterPanel と検索結果一覧を配置する．                                                                                                                                                                                   |
| components/MobileResultsSheet.tsx               | モバイル用 bottom sheet．検索結果一覧と比較 view を snap point 付き drawer として表示する．                                                                                                                                                     |
| components/CompareActionButton.tsx              | 比較対象が選択されているときに表示する floating action button．                                                                                                                                                                                 |
| components/SkiResortList.tsx                    | 検索結果のスキー場一覧表示．選択状態，ホバー状態，比較対象への追加，詳細表示への導線を担当する．                                                                                                                                                |
| components/SkiResortCompareView.tsx             | 比較パネルの親コンポーネント．比較タブ，デスクトップ side panel / モバイル sheet の表示，スクロール制御，閉じる操作を扱う．                                                                                                                     |
| components/compare/CompareOverviewTab.tsx       | 比較対象スキー場の基本情報・規模・コース・リフトなどの概要比較を表示する．                                                                                                                                                                      |
| components/compare/CompareWeatherTab.tsx        | 比較対象スキー場の天気・積雪関連情報を比較表示する．Snow-Forecast へのリンク表示も含む．                                                                                                                                                        |
| components/compare/CompareLiftTicketTab.tsx     | 比較対象スキー場のリフト券料金を比較表示する．リフト券計算機の結果を横並びにする．                                                                                                                                                              |
| components/compare/CompareReviewsTab.tsx        | 比較対象スキー場のレビュースコアを表形式で比較表示する．                                                                                                                                                                                        |
| components/compare/CompactSnowForecastEmbed.tsx | 比較画面向けのコンパクトな Snow-Forecast 埋め込み表示．                                                                                                                                                                                         |
| components/compare/CompareWeatherTab.css        | 気候タブの Snow-Forecast 埋め込み用のスタイル．                                                                                                                                                                                                 |
| components/compare/constants.ts                 | 比較 UI 内で使うタブ・表示ラベルなどの固定値．                                                                                                                                                                                                  |
| components/compare/types.ts                     | 比較機能内で使うスキー場データ型．外部 feature に広げない比較専用型を置く．                                                                                                                                                                     |
| components/compare/useCompareWeatherLinks.ts    | 比較対象の天気リンク生成・取得をまとめる hook．表示 component から副作用とリンク解決を分離する．                                                                                                                                                |

### features/lift

管理画面のリフト入力（`/admin/lift`）を担当する．スキー場のリフトデータ（所属，ジオメトリ，詳細，リンク）を 6 ステップのフローで編集し，ファイルとして保存する．

~~~text
features/lift/
├── LiftEditClient.tsx
├── LiftEditWorkspace.tsx
├── actions.ts
├── components/
│   ├── AssignStep.tsx
│   ├── ConfirmStep.tsx
│   ├── DetailStep.tsx
│   ├── GeometryStep.tsx
│   ├── LinksStep.tsx
│   └── ResortSelectStep.tsx
├── constants.ts
├── hooks/
│   └── useDraftStorage.ts
├── server/
│   └── liftFiles.ts
├── types.ts
└── utils/
    ├── detailMerge.ts
    ├── diff.ts
    ├── liftOps.ts
    ├── linkValidation.ts
    ├── loadSource.ts
    ├── savePayload.ts
    └── validation.ts
~~~

| ファイル                        | 役割                                                                                                                                                                                                      |
| :------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LiftEditClient.tsx              | クライアント入口．Leaflet を使う workspace を dynamic import (SSR 無効) で読み込む．                                                                                                                      |
| LiftEditWorkspace.tsx           | 6 ステップの編集フロー（1. スキー場選択 → 2. 所属確認・変更 → 3. 位置補正 → 4. 詳細情報 → 5. 全体情報リンク → 6. 確認・保存）の親コンポーネント．ステップ状態，タイルレイヤー選択，ダイアログを管理する． |
| components/ResortSelectStep.tsx | ステップ 1．編集対象のスキー場を選択する．                                                                                                                                                                |
| components/AssignStep.tsx       | ステップ 2．リフトごとのスキー場所属を確認・変更する．                                                                                                                                                    |
| components/GeometryStep.tsx     | ステップ 3．地図上でリフトのライン（ジオメトリ）を補正する．                                                                                                                                              |
| components/DetailStep.tsx       | ステップ 4．リフトの詳細情報（種別，距離など）を編集する．                                                                                                                                                |
| components/LinksStep.tsx        | ステップ 5．スキー場の全体情報リンクを編集する．                                                                                                                                                          |
| components/ConfirmStep.tsx      | ステップ 6．変更内容の要約を表示し，保存を実行する．                                                                                                                                                      |
| hooks/useDraftStorage.ts        | 編集内容を localStorage に永続化し，再訪問時に復元する hook．                                                                                                                                             |
| server/liftFiles.ts             | DataDocument上のリフト元線・確認済み情報・resort linksをDB/API経由で読み書きする．                                                                                                                        |
| actions.ts                      | 権限を確認し，DB/API経由で文書の読み書きと競合検証を行う Server Actions．                                                                                                                                             |
| utils/detailMerge.ts            | 既存の詳細情報と編集内容をマージする処理．                                                                                                                                                                |
| utils/diff.ts                   | ソースデータと編集内容の変更点検出．                                                                                                                                                                      |
| utils/liftOps.ts                | リフト表示名，ライン変更判定，検索語補完などの補助関数．                                                                                                                                                  |
| utils/linkValidation.ts         | リンク URL の検証．                                                                                                                                                                                       |
| utils/loadSource.ts             | ソースデータを読み込み，編集モデルに変換する．                                                                                                                                                            |
| utils/savePayload.ts            | 保存時のペイロードを組み立てる．                                                                                                                                                                          |
| utils/validation.ts             | 編集内容の検証．                                                                                                                                                                                          |
| constants.ts / types.ts         | lift feature の固定値と型定義．                                                                                                                                                                           |

### features/lift-ticket

リフト券計算機を担当する．スキー場ごとの料金データと同行者構成・滑る長さから最安プランを算出するロジックと，その表示 UI を持つ．詳細画面のチケットタブと比較画面から利用される．

~~~text
features/lift-ticket/
├── components/
│   ├── LiftTicketCalculator.tsx
│   ├── LiftTicketPriceTable.tsx
│   ├── SourceMarks.tsx
│   ├── TicketCalculationCard.tsx
│   ├── TicketPartyEditor.tsx
│   └── TicketPlanCard.tsx
├── types.ts
└── utils/
    ├── calculateLiftTicket.ts
    ├── duration.test.ts
    ├── naebaDiscounts.test.ts
    ├── nightPass.test.ts
    ├── plan.test.ts
    ├── priceTable.test.ts
    └── priceTable.ts
~~~

| ファイル                             | 役割                                                                                                     |
| :----------------------------------- | :------------------------------------------------------------------------------------------------------- |
| components/LiftTicketCalculator.tsx  | リフト券計算機の UI．同行者入力とプラン検索結果を組み立てる．                                            |
| components/TicketPartyEditor.tsx     | 同行者構成（カテゴリ，年齢，人数）の入力 UI．                                                            |
| components/TicketPlanCard.tsx        | 算出された最安プランと内訳を表示するカード．                                                             |
| components/TicketCalculationCard.tsx | 比較画面で使う計算結果カード．                                                                           |
| components/LiftTicketPriceTable.tsx  | チケット料金表の表示．                                                                                   |
| components/SourceMarks.tsx           | 料金情報の出典表示．                                                                                     |
| types.ts                             | リフト券料金データ（商品，料金，オファー，カレンダー）と計算入力の型定義．                               |
| utils/calculateLiftTicket.ts         | 計算のコア．同行者構成と滑る長さから，割引プラン・ナイター込みの組み合わせも含めて最安プランを探索する． |
| utils/priceTable.ts                  | 表示用の料金表を構築する．                                                                               |
| utils/*.test.ts                      | 計算ロジックの単体テスト（node:test）．                                                                  |

### features/map

日本全体地図の表示と Leaflet 関連処理を担当する．日本全体地図とスキー場詳細地図を無理に 1 つの巨大 component にまとめず，日本地図固有の marker，label，pane，layer，viewport 制御をこの feature に閉じ込める．

~~~text
features/map/
├── JapanResortMap.tsx
├── components/
│   ├── DetailMapLayers.tsx
│   ├── DetailMapNameLabels.tsx
│   ├── MapControllers.tsx
│   ├── MapControls.tsx
│   ├── ResortActionPopup.tsx
│   └── ResortMarkersLayer.tsx
├── constants.ts
├── hooks/
│   ├── useFinalizedMapFeatures.ts
│   ├── useJapanMapLabelLayout.ts
│   ├── useMapZoomInteractionSurface.ts
│   └── useResortAliases.ts
├── types.ts
└── utils/
    ├── finalizedMapData.ts
    ├── labelCollision.ts
    ├── leafletIcons.ts
    ├── resortLabels.ts
    ├── resortMarkerPriority.ts
    └── viewport.ts
~~~

| ファイル                              | 役割                                                                                                                                                                                                                  |
| :------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JapanResortMap.tsx                    | 日本全体地図の親コンポーネント．地図タイル，pane，スキー場 marker layer，完成済みコース・リフト layer，各 controller，地図 UI を組み立てる．詳細なラベル計算や Leaflet 副作用は hook / component / utils に委譲する． |
| components/DetailMapLayers.tsx        | GeoJSON 化されたコース・リフト線を Leaflet layer として描画する．線の太さ，色，選択状態，リフト流速表現，クリック hit layer などを担当する．                                                                          |
| components/DetailMapNameLabels.tsx    | 詳細地図データに含まれるコース名・リフト名のラベル描画を担当する．ズームレベル，衝突回避，選択中 feature の優先表示を扱う．                                                                                           |
| components/MapControllers.tsx         | React Leaflet の useMap / useMapEvents を使う副作用 component 群．bounds 通知，viewport 復元，検索結果への fit，選択中詳細への fit，zoom 設定，ラベル再計算トリガーを担当する．                                       |
| components/MapControls.tsx            | 地図右上/右下の UI 操作群．ズームイン・アウト，初期位置リセット，地理院地図/写真タイル切り替え，コース色分け切り替え，凡例表示を担当する．                                                                            |
| components/ResortActionPopup.tsx      | 比較モードで marker クリック時に出る popup．詳細を見る，比較に追加/比較から外す操作を提供する．                                                                                                                       |
| components/ResortMarkersLayer.tsx     | スキー場 marker，名称ラベル，leader line の描画を担当する．選択中・フィルタ一致・通常 marker の pane / z-index / dim 表現を切り替える．                                                                               |
| constants.ts                          | 初期中心座標，ズーム値，地理院タイル設定，pane 名，ラベルしきい値，衝突判定用の固定値など地図 feature の定数．                                                                                                        |
| hooks/useFinalizedMapFeatures.ts      | FinalizedResortMapData から描画用 collection，bounds，選択中コース/リフト，focus mode 判定などを派生させる hook．                                                                                                     |
| hooks/useJapanMapLabelLayout.ts       | 日本地図上のスキー場名ラベル配置を計算する hook．ズームレベル，選択状態，フィルタ状態，衝突回避，leader line の要否を見て LabelLayout を生成する．                                                                    |
| hooks/useMapZoomInteractionSurface.ts | wrapper 要素上の wheel / double click / touch によるズーム操作を検知し，親へユーザー操作として通知する hook．                                                                                                         |
| hooks/useResortAliases.ts             | DB/APIから渡されたshortNameを使い，未設定時は正式名から地図ラベルを生成する hook．                                                                                                                                       |
| types.ts                              | 地図 feature の型定義．ラベル矩形，線分，候補配置，地図表示復元 request，選択中コース/リフト，JapanResortMapProps などを持つ．                                                                                        |
| utils/finalizedMapData.ts             | DB/GeoJSON 由来の完成済みコース・リフトデータを Leaflet / GeoJSON 描画用に変換する．bounds 計算，コース色，リフト flow，非圧雪 dash などを扱う．                                                                      |
| utils/labelCollision.ts               | ラベル衝突判定の純粋関数群．矩形 overlap，点と矩形/線分の距離，leader line 交差，候補矩形生成，viewport 拡張を担当する．                                                                                              |
| utils/leafletIcons.ts                 | Leaflet の DivIcon 生成と文字幅・ラベル高さ計測．スキー場 marker icon，名称 label icon，地図線幅スケーリングを扱う．                                                                                                  |
| utils/resortLabels.ts                 | 地図ラベルの表示名，ラベル幅，marker との gap，密集地点検出などスキー場 label 固有の計算．                                                                                                                            |
| utils/resortMarkerPriority.ts         | marker の優先度判定．選択中，フィルタ一致，通常の priority と z-index offset を決める．                                                                                                                               |
| utils/viewport.ts                     | パネルとの重なりを考慮した地図中心・fitBounds padding 計算．検索結果や比較対象に地図を合わせる処理を補助する．                                                                                                        |

### features/resort-detail

選択中スキー場の詳細パネルを担当する．親コンポーネントはタブ状態，ローディング，desktop side panel / mobile sheet の外枠を管理し，タブごとの表示は tabs に分ける．

~~~text
features/resort-detail/
├── SkiResortDetailView.tsx
├── components/
│   ├── DetailTabs.tsx
│   ├── ElevationProfile.tsx
│   ├── ImageCarousel.tsx
│   ├── InfoSection.tsx
│   ├── SelectedCourseDetail.tsx
│   └── StatCard.tsx
├── hooks/
│   └── useBodyScrollLock.ts
├── tabs/
│   ├── CoursesTab.tsx
│   ├── DetailTabContent.tsx
│   ├── LiftsTab.tsx
│   ├── OverviewTab.tsx
│   ├── TicketsTab.tsx
│   └── WeatherTab.tsx
├── types.ts
└── utils/
    └── detailMetrics.ts
~~~

| ファイル                            | 役割                                                                                                                                                  |
| :---------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| SkiResortDetailView.tsx             | 詳細画面の親コンポーネント．ローディング，タブ状態，選択中 map feature とタブの同期，desktop side panel / mobile sheet の外枠，閉じる操作を担当する． |
| components/DetailTabs.tsx           | 詳細画面のタブ切り替え UI．概要，コース，リフト，チケット，気候の切り替えを担当する．                                                                 |
| components/ElevationProfile.tsx     | 標高差・山頂/山麓標高などのプロフィール表示．                                                                                                         |
| components/ImageCarousel.tsx        | スキー場画像のカルーセル表示．画像がない場合の fallback も含む．                                                                                      |
| components/InfoSection.tsx          | 見出し付き情報ブロックの共通表示部品．詳細タブ内で情報を整理するために使う．                                                                          |
| components/SelectedCourseDetail.tsx | 地図上で選択されたコースの詳細表示．コースタブと map feature 選択をつなぐ．                                                                           |
| components/StatCard.tsx             | コース数，リフト数，標高差などの数値指標をカード表示する小部品．                                                                                      |
| hooks/useBodyScrollLock.ts          | 詳細 panel / sheet 表示中の body scroll lock を管理する副作用 hook．                                                                                  |
| tabs/OverviewTab.tsx                | 詳細画面の概要タブ．基本情報，主要指標，画像，概要テキスト，レビューセクションを表示する．                                                            |
| tabs/CoursesTab.tsx                 | コース一覧・難易度・距離・選択中コース詳細などを表示する．                                                                                            |
| tabs/LiftsTab.tsx                   | リフト一覧，リフト種別，運行状況などを表示する．                                                                                                      |
| tabs/TicketsTab.tsx                 | チケット料金情報とリフト券計算機を表示する．                                                                                                          |
| tabs/WeatherTab.tsx                 | 天気・積雪情報，Snow-Forecast 埋め込み，各気象サービスへのリンク，積雪グラフへの導線を表示する．                                                      |
| tabs/DetailTabContent.tsx           | 詳細タブで使う component の再 export 境界．親側 import を整理するための集約ファイル．                                                                 |
| types.ts                            | 詳細画面内で使う tab 名，表示用データ型などの型定義．                                                                                                 |
| utils/detailMetrics.ts              | コース数，リフト数，標高，最大斜度など，詳細表示に必要な指標の整形・算出処理．                                                                        |

### features/review

管理画面のレビュー入力（`/admin/review`）を担当する．スキー場ごとのレビュー記事（カテゴリ別スコア，本文）を編集・保存する．

~~~text
features/review/
├── ReviewEditWorkspace.tsx
├── actions.ts
├── server/
│   └── reviewFiles.ts
└── types.ts
~~~

| ファイル                | 役割                                                                                                         |
| :---------------------- | :----------------------------------------------------------------------------------------------------------- |
| ReviewEditWorkspace.tsx | レビュー編集画面の親コンポーネント．スキー場ごとのレビュー記事（カテゴリ，スコア，本文）の管理と保存を扱う． |
| server/reviewFiles.ts   | `reviews/`キーのDataDocumentをDB/API経由で読み書きする．                                         |
| actions.ts              | レビューデータの読み書きを行う Server Actions．                                                              |
| types.ts                | レビュー編集用の型定義．                                                                                     |

### features/reviews

公開サイトでのレビュー表示を担当する．詳細画面の概要タブと検索結果一覧から利用される．

~~~text
features/reviews/
├── components/
│   └── ResortReviewSection.tsx
├── resortName.ts
└── types.ts
~~~

| ファイル                           | 役割                                                                                                           |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| components/ResortReviewSection.tsx | レビューセクションの表示．折りたたみ表示と，スコア（◎ / ○ / △）のバッジ表示を扱う．                            |
| resortName.ts                      | レビュー表示用のスキー場名解決（志賀高原中央エリアなどの特殊な表示名を含む）．                                 |
| types.ts                           | レビューデータ型．カテゴリ（初心者 / 中級者 / 上級者 / コブ / パウダー / ツリーラン / パーク）とスコアの定義． |

### features/slope

管理画面のコース入力（`/admin/slope`）を担当する．地図エディタでコースのラインを描画・補正し，詳細情報を編集してDBのDataDocumentへ保存する．

~~~text
features/slope/
├── SlopeEditClient.tsx
├── SlopeEditWorkspace.tsx
├── actions.ts
├── components/
│   ├── ConfirmStep.tsx
│   ├── DetailEditStep.tsx
│   ├── EditorMap.tsx
│   ├── LineEditStep.tsx
│   ├── ResortSelectStep.tsx
│   └── TutorialOverlay.tsx
├── constants.ts
├── hooks/
│   └── useDraftStorage.ts
├── server/
│   └── slopeFiles.ts
├── types.ts
└── utils/
    ├── courseOps.ts
    ├── exportFiles.ts
    ├── importFiles.ts
    ├── loadSource.test.ts
    ├── loadSource.ts
    └── validation.ts
~~~

| ファイル                              | 役割                                                                                 |
| :------------------------------------ | :----------------------------------------------------------------------------------- |
| SlopeEditClient.tsx                   | クライアント入口．Leaflet を使う workspace を dynamic import (SSR 無効) で読み込む． |
| SlopeEditWorkspace.tsx                | 編集フロー（スキー場選択，ライン編集，詳細編集，確認・保存）の親コンポーネント．     |
| components/ResortSelectStep.tsx       | 編集対象のスキー場を選択する．                                                       |
| components/LineEditStep.tsx           | 地図エディタ上でコースのラインを描画・補正する．                                     |
| components/DetailEditStep.tsx         | コースの詳細情報（難易度，距離，斜度など）を編集する．                               |
| components/ConfirmStep.tsx            | 変更内容の要約を表示し，保存を実行する．                                             |
| components/EditorMap.tsx              | Leaflet による地図エディタ．ライン描画，マーカー操作，タイルレイヤーを扱う．         |
| components/TutorialOverlay.tsx        | 初回利用時のチュートリアルオーバーレイ．                                             |
| hooks/useDraftStorage.ts              | 編集内容を localStorage に永続化し，再訪問時に復元する hook．                        |
| server/slopeFiles.ts                  | コースのGeoJSON等をDataDocumentとしてDB/API経由で読み書きする．                                     |
| actions.ts                            | コースデータの読み書きを行う Server Actions．                                        |
| utils/courseOps.ts                    | コースデータ操作の補助関数．                                                         |
| utils/exportFiles.ts / importFiles.ts | コースデータファイルのエクスポート・インポート．                                     |
| utils/loadSource.ts                   | ソースデータを読み込み，編集モデルに変換する．                                       |
| utils/loadSource.test.ts              | ソース読み込みの単体テスト（node:test）．                                            |
| utils/validation.ts                   | 編集内容の検証．                                                                     |
| constants.ts / types.ts               | slope feature の固定値と型定義．                                                     |

### features/ticket

管理画面のリフトチケット入力（`/admin/ticket`）を担当する．リフト券料金 JSON を編集するが，フォームは Skill 側の JSON Schema から生成し，構造・必須・enum の正本は画面側に置かない設計である．

~~~text
features/ticket/
├── TicketEditWorkspace.tsx
├── actions.ts
├── components/
│   ├── CollectionSection.tsx
│   ├── FieldRenderer.tsx
│   └── ValidationPanel.tsx
├── hooks/
│   └── useDraftStorage.ts
├── presentation.ts
├── server/
│   ├── schemaSpec.ts
│   ├── ticketFiles.ts
│   └── validateTicket.ts
├── types.ts
└── utils/
    ├── nodeOps.ts
    └── references.ts
~~~

| ファイル                         | 役割                                                                                                                                         |
| :------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- |
| TicketEditWorkspace.tsx          | リフトチケット編集画面の親コンポーネント．schema spec からフォームを組み立て，検証と保存を管理する．                                         |
| components/CollectionSection.tsx | コレクション（商品リストなど）を表示するセクション．                                                                                         |
| components/FieldRenderer.tsx     | フィールド spec（型，必須，enum，format）に従って 1 フィールドをレンダリングする．                                                           |
| components/ValidationPanel.tsx   | 検証レポートを表示するパネル．                                                                                                               |
| hooks/useDraftStorage.ts         | 編集内容を localStorage に永続化し，再訪問時に復元する hook．                                                                                |
| presentation.ts                  | 日本語の見出しやタブ配置など，表示上の都合のみを保持する．構造・必須・enum の中身は schema と taxonomy.json が正本であるためここに書かない． |
| server/schemaSpec.ts             | Skill の JSON Schema と taxonomy.json を読み込み，フォーム spec を生成する．schema が更新されるとフォームも自動的に追従する．                |
| server/ticketFiles.ts            | `lift-ticket/`キーの料金DataDocumentをDB/API経由で読み書きする．                                                                         |
| server/validateTicket.ts         | 保存前に Skill 自身の検証スクリプトを実行し，検証レポートを返す．画面側に検証ロジックを再実装しないためである．                              |
| utils/nodeOps.ts                 | JSON ノードツリー操作の補助関数．                                                                                                            |
| utils/references.ts              | コレクション間の ID 参照を解決する．                                                                                                         |
| actions.ts                       | チケットデータの読み書きと検証を行う Server Actions．                                                                                        |
| types.ts                         | ticket feature の型定義．                                                                                                                    |

### features/weather

天気・積雪表示を担当する．現在は詳細画面や比較画面から利用される Snow-Forecast 埋め込みと積雪推移グラフを中心に持つ．

~~~text
features/weather/
├── WeatherChart.tsx
├── types.ts
└── utils/
    └── weatherChartData.ts
~~~

| ファイル                  | 役割                                                                                                           |
| :------------------------ | :------------------------------------------------------------------------------------------------------------- |
| WeatherChart.tsx          | Snow-Forecast の iframe 埋め込み，標高切り替え UI，積雪深グラフ，Recharts の tooltip / legend 表示を担当する． |
| types.ts                  | weather feature 内で使うグラフデータ・表示型の定義．                                                           |
| utils/weatherChartData.ts | 積雪履歴データを Recharts 用の系列データへ変換する純粋関数．表示 component からデータ整形を分離する．          |

---

## 主要コマンドリファレンス (`mise tasks`)

*   **開発とチェック**:
    *   `mise run dev` - Next.js 開発サーバー起動 ( http://localhost:3000/rusutsu )
    *   `mise run dev:lan` - 明示的にLANへ公開して開発サーバー起動（通常は使用しない）
    *   `mise run check` - 一括チェック ( format → lint → typecheck )
    *   `mise run format` / `mise run lint` - Biome によるフォーマット / リント
    *   `mise run typecheck` - TypeScript 型チェック
    *   `mise run build` - 本番ビルド
    *   `mise run start` - 本番サーバー起動
    *   `mise run clean` - 一時ファイル削除 ( node_modules, .next )
*   **インフラ・データベース**:
    *   `mise run db:up` - PostgreSQL (Docker) 起動・ヘルスチェック待機
    *   `mise run db:down` - app/DBコンテナとnetworkを停止（volumeは保持）
    *   `mise run db:migrate` - Prisma マイグレーション実行
    *   `mise run db:generate` - Prisma Client 生成
    *   `mise run db:import-documents -- --dry-run` - 初回文書投入元の検証（DB接続なし）
    *   `mise run db:import-short-names -- --dry-run` - 短縮名投入元の検証（DB接続なし）
    *   上記importの `--initialize` はバックアップ後の初回移行だけで明示する．通常起動では実行しない
    *   `mise run db:seed` - DB シード実行（DB 接続確認のみ）
    *   `mise run db:reset` - データベースリセット（全データ削除 & シード）
    *   `mise run db:studio` - Prisma Studio による DB GUI サーバ起動
    *   `mise run docker:build` - Docker イメージ再構築
    *   `mise run docker:logs` - コンテナログ表示
*   **各種クローラー実行**:
    *   `mise run crawl:all` - パイプライン全体実行（ski-areas → gelendes → weathers → forecasts → snowDepths → snowFalls → latestReports → yukiMagi → amedas の順）
    *   `mise run crawl:ski-areas` / `crawl:gelendes` / `crawl:weathers` / `crawl:forecasts` - 個別タスク実行
*   **テスト**:
    *   `pnpm test` - 全単体・契約テストを実行する．
    *   単体テストは `node:test` を使用し，`pnpm tsx --test <テストファイル>` で実行する（例: `pnpm tsx --test src/features/lift-ticket/utils/priceTable.test.ts`）
