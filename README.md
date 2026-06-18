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

ブラウザで [http://localhost:3000/rusutsu](http://localhost:3000/rusutsu) にアクセスする．このアプリは Next.js の base path `/rusutsu` 配下で配信されるため，`/` は検証対象にしない．

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

本プロジェクトのフロントエンドは，Next.js App Router の入口を src/app に薄く残し，画面・機能ごとの実装を src/features に集約する構成としている．画面をまたいで利用する UI だけを src/shared に置き，従来のように src/components に何でも集める構成は採用しない．

~~~text
├── .github/workflows/             # CI/CD ワークフロー (CI + Deploy)
├── prisma/                        # Prisma スキーマ，マイグレーション，seed
│   ├── schema.prisma              # DB のデータモデル定義
│   └── seed.ts                    # 初期データ投入処理
├── public/                        # 静的アセット
├── src/
│   ├── actions/                   # Server Actions。DB 取得・更新処理の入口
│   │   ├── crawl.ts               # クロール処理を呼び出す Server Action
│   │   └── skiResorts.ts          # スキー場一覧・詳細データ取得の Server Action
│   ├── app/                       # Next.js App Router。ルーティングと初期データ取得の入口
│   │   ├── globals.css            # グローバル CSS，地図・UI の共通スタイル
│   │   ├── layout.tsx             # アプリ全体の HTML / Provider 境界
│   │   └── page.tsx               # トップページの Server Component。HomeClient に初期データを渡す
│   ├── features/                  # 画面・機能単位のフロントエンド実装
│   │   ├── filters/               # スキー場検索フィルタ機能
│   │   ├── home/                  # トップページ全体の状態管理と画面構成
│   │   ├── map/                   # 日本全体地図，マーカー，Leaflet 関連処理
│   │   ├── resort-detail/         # スキー場詳細パネル，タブ，詳細表示部品
│   │   └── weather/               # 天気・積雪グラフ表示
│   ├── lib/                       # Prisma，クローラー管理，GeoJSON 変換などのドメイン共通処理
│   ├── private/                   # 名寄せ辞書・外部データ・クローリングスクリプト
│   │   ├── data/                  # JSON 辞書，外部サイト ID 対応表，地点データ
│   │   └── scripts/               # SnowJapan / Surf&Snow / 気象系クローラー
│   ├── providers/                 # Chakra UI などアプリ全体の Provider
│   ├── shared/                    # 複数 feature から使う最小限の共有 UI / hook / util
│   │   └── components/
│   │       └── LoadingSpinner.tsx  # 地図・詳細・比較など複数画面で使うローディング表示
│   ├── types/                     # アプリ全体で共有する型定義
│   └── instrumentation.ts         # Next.js instrumentation hook
├── docker-compose.yml             # 開発用コンテナ設定
├── docker-compose.production.yml  # 本番デプロイ用設定
├── Dockerfile                     # multi-stage Docker build (Node 24, arm64)
├── mise.toml                      # タスクランナー・ランタイムバージョン管理
├── package.json                   # 依存ライブラリ構成
└── prisma.config.ts               # Prisma 7 の DB 接続設定
~~~

## features のディレクトリ構造

src/features は画面・機能ごとに閉じた責務を持つ．各 feature の中では，親コンポーネント，表示部品，hooks，utils，types を分け，feature 内でしか使わない実装を外へ漏らさない方針としている．

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
│   ├── SkiResortCompareView.tsx
│   ├── SkiResortList.tsx
│   └── compare/
│       ├── CompactSnowForecastEmbed.tsx
│       ├── CompareOverviewTab.tsx
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

| ファイル | 役割 |
| :-- | :-- |
| HomeClient.tsx | トップページの Client Component。検索条件，選択中スキー場，詳細パネル，比較対象，地図 viewport 復元など，トップページ全体の状態と handler を管理する。地図は SSR しないため JapanResortMap を dynamic import し，描画は HomeLayout に委譲する。 |
| layout/HomeLayout.tsx | トップページの画面配置を組み立てる layout component。地図，PC サイドパネル，モバイル検索 overlay / bottom sheet，詳細パネル，比較パネルを配置する。 |
| constants.ts | home 画面で共有する bottom sheet snap point，モバイル比較ボタン位置，gesture 判定 selector などの固定値。 |
| types.ts | home 画面内で共有する地図 viewport 復元，検索復帰状態，visual viewport 状態などの型。 |
| utils/dom.ts | pointer events 復元，検索結果スクロール位置復元，入力要素判定，地図 zoom surface 判定など DOM 操作系の補助関数。 |
| hooks/useSidePanelLayout.ts | PC サイドパネル layout に切り替わる media query 状態を管理する hook。 |
| hooks/useHomeGestureGuards.ts | モバイル bottom sheet / overlay と地図操作が干渉しないよう，pinch / gesture 系イベントを制御する hook。 |
| hooks/useMobileSearchOverlayEffects.ts | モバイル検索 overlay の自動 focus，body scroll lock，visualViewport によるキーボード inset 監視を扱う hook。 |
| hooks/useMapZoomIntentListener.ts | 地図 zoom surface 上の wheel / double click / multi-touch を検知し，bottom sheet の畳み込みなどにつなげる hook。 |
| components/MobileSearchButton.tsx | モバイル画面上部の検索起動ボタン。検索 overlay を開く入口を担当する。 |
| components/MobileSearchOverlay.tsx | モバイル検索 overlay。キーワード入力と FilterPanel を全画面で表示し，キーボード表示時の余白を受け取って描画する。 |
| components/DesktopSearchPanel.tsx | PC 用の右サイドパネル。FilterPanel と検索結果一覧を配置する。 |
| components/MobileResultsSheet.tsx | モバイル用 bottom sheet。検索結果一覧と比較 view を snap point 付き drawer として表示する。 |
| components/CompareActionButton.tsx | 比較対象が選択されているときに表示する floating action button。 |
| components/SkiResortList.tsx | 検索結果のスキー場一覧表示。選択状態，ホバー状態，比較対象への追加，詳細表示への導線を担当する。 |
| components/SkiResortCompareView.tsx | 比較パネルの親コンポーネント。比較タブ，デスクトップ side panel / モバイル sheet の表示，スクロール制御，閉じる操作を扱う。 |
| components/compare/CompareOverviewTab.tsx | 比較対象スキー場の基本情報・規模・コース・リフトなどの概要比較を表示する。 |
| components/compare/CompareWeatherTab.tsx | 比較対象スキー場の天気・積雪関連情報を比較表示する。Snow-Forecast へのリンク表示も含む。 |
| components/compare/CompactSnowForecastEmbed.tsx | 比較画面向けのコンパクトな Snow-Forecast 埋め込み表示。 |
| components/compare/constants.ts | 比較 UI 内で使うタブ・表示ラベルなどの固定値。 |
| components/compare/types.ts | 比較機能内で使うスキー場データ型。外部 feature に広げない比較専用型を置く。 |
| components/compare/useCompareWeatherLinks.ts | 比較対象の天気リンク生成・取得をまとめる hook。表示 component から副作用とリンク解決を分離する。 |

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

| ファイル | 役割 |
| :-- | :-- |
| FilterPanel.tsx | フィルタ UI 全体の親コンポーネント。キーワード検索，件数表示，折りたたみ表示，検索実行ボタン，各フィルタ UI の配置を担当する。 |
| components/FilterControls.tsx | 個別フィルタ UI 群。都道府県選択，地域一括選択，トグル，標高・コース数・リフト数などの数値入力，詳細条件の開閉 UI を持つ。 |
| constants.ts | デフォルトフィルタ値，地域・都道府県グループ，営業状況などフィルタの固定値。 |
| hooks/useFilterPanelState.ts | FilterPanel 内の入力 handler，id 生成，地域選択，リセット，折りたたみ時のラベル生成に必要な状態をまとめる hook。 |
| types.ts | Filters，数値フィルタ名，フィルタ値など検索条件の型定義。 |
| utils/filterLabels.ts | 折りたたみ表示などで使う「現在の条件を人が読める文言にする」処理。 |
| utils/filterResorts.ts | スキー場一覧に対して検索条件を適用する純粋関数。フィルタが有効かどうかの判定もここに置く。 |

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

| ファイル | 役割 |
| :-- | :-- |
| JapanResortMap.tsx | 日本全体地図の親コンポーネント。地図タイル，pane，スキー場 marker layer，完成済みコース・リフト layer，各 controller，地図 UI を組み立てる。詳細なラベル計算や Leaflet 副作用は hook / component / utils に委譲する。 |
| components/DetailMapLayers.tsx | GeoJSON 化されたコース・リフト線を Leaflet layer として描画する。線の太さ，色，選択状態，リフト流速表現，クリック hit layer などを担当する。 |
| components/DetailMapNameLabels.tsx | 詳細地図データに含まれるコース名・リフト名のラベル描画を担当する。ズームレベル，衝突回避，選択中 feature の優先表示を扱う。 |
| components/MapControllers.tsx | React Leaflet の useMap / useMapEvents を使う副作用 component 群。bounds 通知，viewport 復元，検索結果への fit，選択中詳細への fit，zoom 設定，ラベル再計算トリガーを担当する。 |
| components/MapControls.tsx | 地図右上/右下の UI 操作群。ズームイン・アウト，初期位置リセット，地理院地図/写真タイル切り替え，コース色分け切り替え，凡例表示を担当する。 |
| components/ResortActionPopup.tsx | 比較モードで marker クリック時に出る popup。詳細を見る，比較に追加/比較から外す操作を提供する。 |
| components/ResortMarkersLayer.tsx | スキー場 marker，名称ラベル，leader line の描画を担当する。選択中・フィルタ一致・通常 marker の pane / z-index / dim 表現を切り替える。 |
| constants.ts | 初期中心座標，ズーム値，地理院タイル設定，pane 名，ラベルしきい値，衝突判定用の固定値など地図 feature の定数。 |
| hooks/useFinalizedMapFeatures.ts | FinalizedResortMapData から描画用 collection，bounds，選択中コース/リフト，focus mode 判定などを派生させる hook。 |
| hooks/useJapanMapLabelLayout.ts | 日本地図上のスキー場名ラベル配置を計算する hook。ズームレベル，選択状態，フィルタ状態，衝突回避，leader line の要否を見て LabelLayout を生成する。 |
| hooks/useMapZoomInteractionSurface.ts | wrapper 要素上の wheel / double click / touch によるズーム操作を検知し，親へユーザー操作として通知する hook。 |
| hooks/useResortAliases.ts | SkiResortNameAliases.json を読み込み，地図ラベル用の短縮表示名を生成する hook。 |
| types.ts | 地図 feature の型定義。ラベル矩形，線分，候補配置，地図表示復元 request，選択中コース/リフト，JapanResortMapProps などを持つ。 |
| utils/finalizedMapData.ts | DB/GeoJSON 由来の完成済みコース・リフトデータを Leaflet / GeoJSON 描画用に変換する。bounds 計算，コース色，リフト flow，非圧雪 dash などを扱う。 |
| utils/labelCollision.ts | ラベル衝突判定の純粋関数群。矩形 overlap，点と矩形/線分の距離，leader line 交差，候補矩形生成，viewport 拡張を担当する。 |
| utils/leafletIcons.ts | Leaflet の DivIcon 生成と文字幅・ラベル高さ計測。スキー場 marker icon，名称 label icon，地図線幅スケーリングを扱う。 |
| utils/resortLabels.ts | 地図ラベルの表示名，ラベル幅，marker との gap，密集地点検出などスキー場 label 固有の計算。 |
| utils/resortMarkerPriority.ts | marker の優先度判定。選択中，フィルタ一致，通常の priority と z-index offset を決める。 |
| utils/viewport.ts | パネルとの重なりを考慮した地図中心・fitBounds padding 計算。検索結果や比較対象に地図を合わせる処理を補助する。 |

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

| ファイル | 役割 |
| :-- | :-- |
| SkiResortDetailView.tsx | 詳細画面の親コンポーネント。ローディング，タブ状態，選択中 map feature とタブの同期，desktop side panel / mobile sheet の外枠，閉じる操作を担当する。 |
| components/DetailTabs.tsx | 詳細画面のタブ切り替え UI。概要，コース，リフト，チケット，気候の切り替えを担当する。 |
| components/ElevationProfile.tsx | 標高差・山頂/山麓標高などのプロフィール表示。 |
| components/ImageCarousel.tsx | スキー場画像のカルーセル表示。画像がない場合の fallback も含む。 |
| components/InfoSection.tsx | 見出し付き情報ブロックの共通表示部品。詳細タブ内で情報を整理するために使う。 |
| components/SelectedCourseDetail.tsx | 地図上で選択されたコースの詳細表示。コースタブと map feature 選択をつなぐ。 |
| components/StatCard.tsx | コース数，リフト数，標高差などの数値指標をカード表示する小部品。 |
| hooks/useBodyScrollLock.ts | 詳細 panel / sheet 表示中の body scroll lock を管理する副作用 hook。 |
| tabs/OverviewTab.tsx | 詳細画面の概要タブ。基本情報，主要指標，画像，概要テキストなどを表示する。 |
| tabs/CoursesTab.tsx | コース一覧・難易度・距離・選択中コース詳細などを表示する。 |
| tabs/LiftsTab.tsx | リフト一覧，リフト種別，運行状況などを表示する。 |
| tabs/TicketsTab.tsx | リフト券・料金情報を表示する。 |
| tabs/WeatherTab.tsx | 天気・積雪情報，Snow-Forecast 埋め込み，積雪グラフへの導線を表示する。 |
| tabs/DetailTabContent.tsx | 詳細タブで使う component の再 export 境界。親側 import を整理するための集約ファイル。 |
| types.ts | 詳細画面内で使う tab 名，表示用データ型などの型定義。 |
| utils/detailMetrics.ts | コース数，リフト数，標高，最大斜度など，詳細表示に必要な指標の整形・算出処理。 |

### features/weather

天気・積雪表示を担当する．現在は詳細画面や比較画面から利用される Snow-Forecast 埋め込みと積雪推移グラフを中心に持つ．

~~~text
features/weather/
├── WeatherChart.tsx
├── types.ts
└── utils/
    └── weatherChartData.ts
~~~

| ファイル | 役割 |
| :-- | :-- |
| WeatherChart.tsx | Snow-Forecast の iframe 埋め込み，標高切り替え UI，積雪深グラフ，Recharts の tooltip / legend 表示を担当する。 |
| types.ts | weather feature 内で使うグラフデータ・表示型の定義。 |
| utils/weatherChartData.ts | 積雪履歴データを Recharts 用の系列データへ変換する純粋関数。表示 component からデータ整形を分離する。 |

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
