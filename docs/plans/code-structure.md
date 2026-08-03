# 観点B: コード構成・重複・責務分担の調査結果

調査日: 2026-07-10 / 対象: `src/app`, `src/features`, `src/shared`, `src/actions`, `src/providers`, `src/lib`, `src/types` (クローラー本体 `src/private/scripts` は対象外)。

---

## [優先度: 高] `lib/finalizedResortGeojson.ts` と `lib/finalizedResortGeojsonShared.ts` の大規模重複、しかも中身が乖離している
- 対象ファイル: src/lib/finalizedResortGeojson.ts, src/lib/finalizedResortGeojsonShared.ts
- 症状: 型 (`FinalizedCourseFeature` / `FinalizedLiftFeature` / `FinalizedResortMapData` / `GeoCoordinate`)、`COURSE_DIFFICULTY_META`、`getCourseDifficulty`、`getStatusOpacity`、`getSlopeColor`、`hexToRgb`/`rgbToHex`、`parseFinalizedCourseName`、`createCourseSlopeSegments` がほぼ丸ごと 2 ファイルに存在する。さらに **内容が既に食い違っている**:
  - `SLOPE_COLOR_STOPS`: 非Shared 版は 7 ストップ (10°=lime, 15°=yellow…)、Shared 版は 9 ストップ (8°, 12°, 16°, 18°, 23°, 27°, 35°…紫系追加)
  - `getPisteStyle`: 非Shared 版は `△ → "dash"` を返すが Shared 版は `△ → "solid"`
  - `createCourseSlopeSegments`: Shared 版のみ `pointStride` 引数あり
- 原因: 「Node 専用 (fs/path を使う読み込み処理)」と「クライアント共有 (表示ヘルパー)」を分離した際に、コピーした残骸が非Shared 側に放置された。アプリからの import 実態は `getFinalizedResortMapData` (actions/skiResorts.ts) とテストのみで、非Shared 側の表示系ヘルパー・型は全てデッドコード。
- 修正内容: 非Shared 側から表示系ヘルパーと重複型を削除し、型は Shared から re-export する。ファイル読み込み (`getFinalizedResortMapData` と normalize 系) だけを非Shared に残す。テスト (finalizedResortGeojson.test.ts) の import を確認して追随。
- 検証方法: `mise run typecheck` + 既存テスト (finalizedResortGeojson.test.ts) が通ること。地図のコース色分け (難易度/斜度) の見た目が変わらないこと。
- 区分: 実装レディ

## [優先度: 高] 天気リンク生成ロジックが resort-detail と home/compare に二重実装
- 対象ファイル: src/features/resort-detail/tabs/WeatherTab.tsx (56–104行), src/features/home/components/compare/useCompareWeatherLinks.ts
- 症状: 「`weatherIds` から snow-forecast / tenki.jp / ウェザーニュース / Windy の URL を組み立てる」ロジックが 2 箇所にコピー実装されている。`addSnowForecastLink` (id 重複排除 + displayName 上書き) は 20 行超が逐語コピー。URL テンプレート (`https://ja.snow-forecast.com/resorts/${id}/6day/${elevation}` 等) も分散しており、片側だけ直す事故が起きやすい。`WeatherChart.tsx` の `SnowForecastEmbed` にも同じ feed URL テンプレートが 3 箇所目として存在する。
- 原因: 比較機能追加時に WeatherTab のロジックをコピーして育てたため。
- 修正内容: `src/shared/utils/weatherLinks.ts` を新設し、`getSnowForecastLinks` / `getTenkiJpLinks` / `getWeathernewsUrl` / `getWindyUrl` / feed URL ビルダを集約。両者はそれを import。
- 検証方法: 詳細の気候タブと比較の天候タブで、各リンクの URL が移行前後で一致すること (Playwright で href を比較)。
- 区分: 実装レディ

## [優先度: 中] features 間の相互依存: map ⇔ resort-detail が循環している
- 対象ファイル: src/features/map/JapanResortMap.tsx:15 (`@/features/resort-detail/utils/detailMetrics` を import), src/features/resort-detail/* (map/types, map/JapanResortMap を import)
- 症状: `map` ドメインが `resort-detail` の `createConnectedCourseElevationProfile` に依存し、逆に `resort-detail` は `map` の型・コンポーネントに依存する相互依存。また `CoursesTab`/`LiftsTab` は `SelectedMapFeature` を `@/features/map/JapanResortMap` (実装ファイル) から import しており、型は `@/features/map/types` にあるのに経路が不統一。
- 原因: 標高プロファイル計算 (`detailMetrics.ts` の `haversineMeters` / `createElevationProfile` / `createConnectedCourseElevationProfile`) が「詳細画面用ユーティリティ」に置かれたまま地図からも使われるようになった。
- 修正内容: 標高プロファイル計算と `FinalizedCourseGroup` 型を `src/shared/utils/elevationProfile.ts` (+ shared/types) に移動。型 import は `@/features/map/types` に統一。
- 検証方法: `mise run typecheck`、コース選択時の地図上プロファイルマーカーと詳細のプロファイル表示が従来どおり動くこと。
- 区分: 実装レディ

## [優先度: 中] ボトムシート定数と `isBottomSheetExpanded` の二重定義 (値も不一致)
- 対象ファイル: src/features/home/constants.ts (1–26行), src/features/home/components/SkiResortCompareView.tsx (35–45行)
- 症状: スナップポイント定数が home/constants (0.095 / 0.46 / 0.86) と SkiResortCompareView 内 (0.12 / 0.52 / 0.94) で別々に定義され、`isBottomSheetExpanded` も同名関数が 2 実装ある。`BOTTOM_SHEET_MAP_PEEK_HEIGHT` も "14dvh" と "6vh" の 2 種。どちらが正か判断できない。
- 原因: 比較シートを vaul で作った際にローカルコピーしたまま。
- 修正内容: bugs-and-refactoring.md「SkiResortCompareView の vaul 分岐は到達不能」の判断とセット。分岐を消すならローカル定数ごと消える。残すなら home/constants に一本化。
- 検証方法: 型チェック + モバイル/デスクトップの比較表示確認。
- 区分: 要判断

## [優先度: 中] `MapViewSnapshot` / `MapViewRestoreRequest` 型が home と map に完全重複
- 対象ファイル: src/features/home/types.ts (3–10行), src/features/map/types.ts (99–106行)
- 症状: 全く同じ 2 型が両ドメインに定義され、`HomeClient` は home 側、`JapanResortMap` は map 側を使っている。構造的一致で偶然通っているだけで、片方だけ変更すると壊れる。
- 原因: import 方向 (home → map) を避けようとした結果のコピー。
- 修正内容: map/types.ts を正とし、home/types.ts からは re-export or 直接 import に変更 (home→map の依存は既に多数あるため問題ない)。
- 検証方法: `mise run typecheck`。
- 区分: 実装レディ

## [優先度: 中] regionOptions (地域→都道府県の選択肢) 構築が 2 箇所に重複、片方はメモ化なし
- 対象ファイル: src/features/home/layout/HomeLayout.tsx (236–251行), src/features/filters/hooks/useFilterPanelState.ts (33–49行)
- 症状: 「`initialResorts` から存在する都道府県を集めて `REGION_PREFECTURES` をフィルタする」処理が HomeLayout (メモ化なし・毎レンダー実行) と useFilterPanelState (useMemo) に重複。HomeLayout は再レンダー頻度が高い (シートのスナップ変更・ホバー等) ため、506 件の走査 + `getActiveFilterLabels` が毎回走る。
- 原因: モバイル結果ヘッダー用ラベルを HomeLayout に直書きした。
- 修正内容: `features/filters/hooks/useRegionOptions.ts` (resorts を引数に取る useMemo フック) を切り出し、両者から利用。`mobileActiveFilterLabels` も useMemo 化。
- 検証方法: PC/モバイルの都道府県フィルタ表示と結果ヘッダーのチップが従来どおりであること。React DevTools Profiler で HomeLayout 再レンダー時間が下がること。
- 区分: 実装レディ

## [優先度: 中] 比較トグル/比較アクション UI が 3〜4 箇所にコピー実装
- 対象ファイル: src/features/home/components/SkiResortList.tsx (238–277行), src/features/resort-detail/components/InfoSection.tsx (122–155行), src/features/map/components/ResortActionPopup.tsx (47–74行), 「N件を比較/比較をクリア」は src/features/home/components/DesktopSearchPanel.tsx (76–119行) と src/features/home/layout/HomeLayout.tsx (873–913行)
- 症状: 「比較に追加/比較から外す」ボタン (Check/Plus アイコン + brand 配色 + aria-pressed) がリスト・詳細・地図ポップアップにそれぞれスタイルごとコピーされ、微妙にサイズ指定が違う (`5.75rem`/`100px` のハードコードが 2 箇所)。「N件を比較」「比較をクリア」ペアも PC パネルとモバイルヘッダーで重複。
- 原因: 共有ボタンコンポーネントがない。
- 修正内容: `shared/components/CompareToggleButton.tsx` と `CompareActionsBar.tsx` を作り差し替え。なお `home/components/CompareActionButton.tsx` は**未使用のデッドコンポーネント**なので削除 (bugs-and-refactoring.md 参照)。
- 検証方法: 各画面で追加/解除の表示とトグル動作が変わらないこと。
- 区分: 実装レディ

## [優先度: 中] `src/shared` がほぼ空 (LoadingSpinner のみ) で、共有すべき部品が features に散在
- 対象ファイル: src/shared/components/LoadingSpinner.tsx (唯一の shared モジュール)
- 症状: AGENTS.md は shared に `components/ hooks/ types/ utils/` があるとしているが、実在するのは components/LoadingSpinner だけ。実際にドメイン横断で使われている以下が features 側に閉じている:
  - `resort-detail/components/StatCard.tsx` (詳細 4 タブ+InfoSection で使用、比較でも使える汎用カード)
  - `resort-detail/hooks/useBodyScrollLock.ts` (SkiResortCompareView は同じ effect をインライン再実装: SkiResortCompareView.tsx 108–114行)
  - タブバー UI (`DetailTabs` と SkiResortCompareView 内のタブが同型の実装)
  - 「○/△/× ステータス正規化」(detailMetrics の normalizeIconSymbol 系、actions/skiResorts.ts の getOperationSymbol、map/utils/finalizedMapData.ts の getLiftStatusKind/getPisteStatusKind — 同じ正規表現 `/[○〇◯]/u` 等が 3 ファイルに分散)
- 原因: shared の運用が始まっておらず、必要になった場所にその都度実装されている。
- 修正内容: 上記を段階的に shared へ移動 (最優先はステータス正規化と useBodyScrollLock)。移動時は「2 ドメイン以上から使われているもののみ」を基準にする。
- 検証方法: `mise run check` + 該当画面の表示確認。
- 区分: 実装レディ (対象選定のみ要判断)

## [優先度: 中] `actions/crawl.ts` がクローラー起動を Server Action として公開している
- 対象ファイル: src/actions/crawl.ts (1行 `"use server"`), src/lib/scheduler.ts
- 症状: `runAllCrawlersIfNeeded` / `runCrawlerIfNeeded` は "use server" ファイルの export なので、Next.js が POST エンドポイントとして公開する。利用者はスケジューラ (サーバー内) のみで、クライアントから呼ぶ箇所はないのに、外部から任意にクロールを起動できる口が開いている (DoS・外部サイトへの負荷の懸念)。
- 原因: Server Actions とサーバー内部関数の役割の混同。
- 修正内容: `"use server"` を外して `src/lib/crawl.ts` に移動 (scheduler からの import はそのまま動く)。
- 検証方法: `mise run build` が通ること。本番モードで scheduler がクロールを起動できること。クライアントバンドルへの影響なし。
- 区分: 実装レディ

## [優先度: 低] HomeClient → HomeLayout の props バケツリレー (60 個超)
- 対象ファイル: src/features/home/HomeClient.tsx (680–758行), src/features/home/layout/HomeLayout.tsx (46–130行の Props 型)
- 症状: HomeClient が全状態 (検索・比較・シート・地図・キーボード) を 1 コンポーネントで持ち、HomeLayout へ 60 個超の props を渡す。Props 型定義だけで 85 行。1 つの state 変更で HomeLayout 全体が再レンダーされ、変更にも弱い。
- 原因: 機能追加のたびに state と props を積み増した増築構造。依存に `zustand` があるが未使用。
- 修正内容: 一括リライトではなく、(1) 比較系 (`selectedCompareIds`/`compareResortData`/handlers) と (2) モバイル検索オーバーレイ系をそれぞれフック or zustand ストアに切り出し、HomeLayout をセクションコンポーネント (MobileChrome / MapSection / DetailSection) に分割する段階的リファクタを推奨。
- 検証方法: 主要フロー (検索→リスト→詳細→比較→復帰) の Playwright 手動確認一式。
- 区分: 要判断

## [優先度: 低] `types/` 配下の役割が混在し、デッドファイルがある
- 対象ファイル: src/types/forecasts.ts (アプリから import ゼロ), src/types/weathers.ts (`SnowDepthsT` のみ使用、`WeathersT`/`WeatherData` はクローラーが独自定義を持つため未使用), src/types/index.ts (`SkiResortWithWeather` 未使用)
- 症状: `src/types` はアプリ用の型置き場のはずだが、クローラー時代の型が残っていて実使用は `skiResorts.ts` と `SnowDepthsT` だけ。
- 原因: クローラーとアプリで型定義の置き場を分けた際の整理漏れ。
- 修正内容: forecasts.ts 削除、weathers.ts は `SnowDepthsT` のみに縮小 (または weather feature の types へ移動)、`SkiResortWithWeather` 削除。
- 検証方法: `grep` で参照ゼロを確認済み → `mise run typecheck`。
- 区分: 実装レディ

## [優先度: 低] resort-detail 内の構成: 巨大ファイルと誤解を招く barrel
- 対象ファイル: src/features/resort-detail/SkiResortDetailView.tsx (603行、うち 66–298行が `MobileResortMapPreview`), src/features/resort-detail/tabs/DetailTabContent.tsx (単なる re-export)
- 症状: `MobileResortMapPreview` (全画面地図モーダル込み 230 行) が View 本体と同居。`DetailTabContent.tsx` は実装がありそうな名前だが中身は re-export のみで、`ImageCarousel`/`InfoSection` (components 配下) まで tabs/ 経由で import させており構成が読み取りにくい。
- 原因: 分割の途中経過がそのまま残っている。
- 修正内容: `MobileResortMapPreview` を components/ へ移動。DetailTabContent.tsx を削除して各ファイルから直接 import (または index.ts に改名)。
- 検証方法: `mise run typecheck` + 詳細画面表示確認。
- 区分: 実装レディ

## [優先度: 低] ズーム意図検出が 3 系統に分散
- 対象ファイル: src/features/home/hooks/useMapZoomIntentListener.ts (document へ capture リスナー), src/features/map/hooks/useMapZoomInteractionSurface.ts (ラッパー div へ React capture props + native リスナーの二重登録), src/features/map/components/MapControllers.tsx MapEventsHandler (leaflet コンテナへ native リスナー)
- 症状: 「ユーザーがズーム操作をした」ことの検出が document / ラッパー div (しかも React と native の二重) / leaflet コンテナの 3 箇所で行われ、同じ wheel イベントが最大 3 回処理される。どれが実際にシートを畳む責務を持つのか追跡が難しい。
- 原因: 実装時期の異なる対策の積層。useMapZoomInteractionSurface は「schedule → 即 complete」で timeout 機構が形骸化しており (bugs-and-refactoring.md 参照)、簡略化余地が大きい。
- 修正内容: 検出を `MapEventsHandler` (leaflet イベント) に一本化し、home 側へは callback で通知する構成に整理。
- 検証方法: モバイルでピンチ/ダブルタップ/ホイールズーム時にボトムシートが畳まれる挙動が維持されること。
- 区分: 要判断

## 参考: 妥当と判断した構成
- `src/types/skiResorts.ts` が Server Action の戻り値から `Awaited<ReturnType<...>>` で型導出しているのは、Prisma select と UI 型の乖離を防ぐ良い設計。
- Prisma アクセスが `lib/prisma.ts` シングルトン経由に統一されている点は AGENTS.md どおり一貫。
- filters ドメイン (constants/types/utils/hooks/components の分割) は他ドメインの手本になる構成。
