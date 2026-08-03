# 観点A: 画面実装・レスポンシブ対応の調査結果

調査日: 2026-07-10 / 対象: `next dev` (現ブランチ `detail_screen_bug_fix`) を Playwright で
モバイル (375×812, iPhone 13 Mini 相当) とデスクトップ (1280×800)、参考としてタブレット幅 (820px) で確認。

スクリーンショットは `docs/plans/screenshots/` 配下。
共通の前提: この UI は `md` (48em = 768px) を境に「サイドパネルレイアウト (PC)」と「ボトムシート+トップバーレイアウト (モバイル)」に切り替わる (`useSidePanelLayout` / Chakra の `base`/`md` prop)。

---

## [優先度: 高] モバイル詳細画面で、デスクトップにある情報 (概要説明・稼働サマリ・画像カルーセル) が丸ごと表示されない
- 対象ファイル: src/features/resort-detail/SkiResortDetailView.tsx (443–478行), src/features/home/layout/HomeLayout.tsx (427–450, 507–528行)
- 症状: デスクトップの詳細パネルには「スキー場名 + descriptionShort + コース/リフト/積雪量/天候/気温の StatCard 5枚 + 画像カルーセル」が表示される (screenshots/desktop-03-detail-overview.png)。モバイル詳細では名前と県・町だけの `MobileContextHeader` + 地図プレビューになり、**説明文・稼働サマリ・画像カルーセルが一切表示されない** (screenshots/mobile-06-detail-top.png)。
- 原因: `HomeLayout` が `SkiResortDetailView` を呼ぶ 2 箇所とも `hideMobileInfoSection` を固定で渡しており、モバイル用ヘッダー (`mobileDetailHeader`) は `InfoSection` をスキップし `ImageCarousel` を含まない構成になっている。
- 修正内容: まず「意図的な簡略化かどうか」の判断が必要。情報を出すなら、モバイル用に `InfoSection` の軽量版 (説明文 + 稼働サマリ) と `ImageCarousel` を `mobileDetailHeader` に追加する。例:
  ```tsx
  const mobileDetailHeader = (
    <>
      <MobileResortMapPreview ... />
      <ImageCarousel images={images} alt={resort.nameJa} />
      {/* 説明文と稼働サマリだけの簡易 InfoSection */}
    </>
  );
  ```
- 検証方法: モバイル幅で詳細を開き、説明文・画像・稼働サマリが表示されること。デスクトップ表示に影響がないこと (スクリーンショット比較)。
- 区分: 要判断

## [優先度: 高] モバイル詳細のタブ切替と `100vh` 系レイアウト: キーボード表示・URL バー変動時の挙動 (要実機確認)
- 対象ファイル: src/features/home/components/SkiResortCompareView.tsx (56–70行 `height: "100vh"`, 361行 `calc(100vh - var(--snap-point-height) - 38px)`), src/app/globals.css (`html { overflow: hidden }`), src/features/home/HomeClient.tsx (visualViewport 監視は検索オーバーレイのみ)
- 症状: 比較ボトムシート (vaul) のコンテンツ高さが `100vh` 基準。iOS Safari では URL バーの表示/非表示やソフトキーボードで `100vh` が実際の可視領域より大きくなり、下端のコンテンツが隠れる典型パターン。検索オーバーレイには `visualViewport` によるキーボードインセット対応 (`useMobileSearchOverlayEffects`) が実装済みだが、比較シート・詳細パネルには無い。
- 原因: `100vh` ハードコード。同ファイル内の別箇所や `MapControls` では `dvh` を使っており不統一 (`BOTTOM_SHEET_MAP_PEEK_HEIGHT = "6vh"` / home/constants は `"14dvh"`)。
- 修正内容: `100vh` → `100dvh` へ統一 (フォールバック込み)。ただし後述 (code-structure.md) の通りこの vaul 分岐自体が現状到達不能の可能性が高く、削除で解決する可能性もある。
- 検証方法: 実機 (iOS Safari / Android Chrome) で比較シートを開き、下端が隠れないこと。デスクトップ回帰なし。
- 区分: 要判断 (要実機確認)

## [優先度: 中] モバイル詳細のタブバーが 375px で見切れる (スクロール可能と分からない)
- 対象ファイル: src/features/resort-detail/components/DetailTabs.tsx (36行 `flex={{ base: "1 0 80px" }}`)
- 症状: タブ 5 個 × 最小 80px = 400px > 375px のため「気候」タブが右端で半分見切れる (screenshots/mobile-06-detail-top.png, mobile-07-detail-courses.png)。`overflowX="auto"` でスクロールはできるが、スクロールバーを消しているためスクロール可能なことが視覚的に分からない。
- 原因: `flex: 1 0 80px` の最小幅ハードコードと、スクロールインジケータ非表示 (`&::-webkit-scrollbar { display: none }`) の組み合わせ。
- 修正内容: 案1: モバイルでは `flex="1 1 0"` + `px` を詰めて 5 タブを 375px に収める (ラベルは全て 2〜4 文字なので収まる)。案2: 右端にフェードグラデーションを置いてスクロール可能を示す。案1 推奨:
  ```tsx
  flex={{ base: "1 1 0", md: "1 0 96px" }}
  px={{ base: 1, md: 2 }}
  ```
- 検証方法: 375px 幅で 5 タブすべてが見える (または見切れが視覚的に分かる) こと。desktop 表示は変化なし。
- 区分: 実装レディ

## [優先度: 中] モバイルのテーブル (チケット / 比較概要) が横に見切れ、スクロール可能と分からない
- 対象ファイル: src/features/resort-detail/tabs/TicketsTab.tsx, src/features/home/components/compare/CompareOverviewTab.tsx (16行 `minW="760px"`), CoursesTab.tsx / LiftsTab.tsx の各テーブル
- 症状: モバイルのチケット表は「子供」「シニア」列が画面外 (screenshots/mobile-09-detail-tickets.png)。比較の概要表は「コース数」から先が見切れる (screenshots/mobile-13-compare-overview.png)。どちらも `overflowX="auto"` でスクロール自体はできるが、ヒントが無く気づきにくい。全セル `whiteSpace="nowrap"` + `px={6}` (24px) の余白が幅を圧迫。
- 原因: テーブルをデスクトップと同一実装のまま流用。モバイル向けのセル余白調整やカード型表示がない。`CompareOverviewTab` の `minW="760px"` ハードコード。
- 修正内容: 最小対応としてモバイルは `px={{ base: 3, md: 6 }}` に詰める + テーブルコンテナ右端にフェード/シャドウでスクロール示唆。比較概要は項目数が少ないのでモバイルではカード型 (1 リゾート 1 カード) への切替を検討。
- 検証方法: 375px 幅でチケット表・比較表を開き、全列が見える or スクロール可能なことが分かること。
- 区分: 要判断 (最小対応の余白調整のみなら実装レディ)

## [優先度: 中] モバイル比較画面のヘッダーが二重 (画面の約 1/3 を消費、閉じる導線も2つ)
- 対象ファイル: src/features/home/layout/HomeLayout.tsx (640–946行 MobileContextHeader), src/features/home/components/SkiResortCompareView.tsx (155–200行)
- 症状: モバイル比較では上から「比較中：2件 + 追加ボタン」「情報で比較 / 地図で比較 タブ」(MobileContextHeader) に続けて、`SkiResortCompareView` 自身の「スキー場比較 / 2件を比較中 / ×ボタン」が重ねて表示され、コンテンツ開始位置が画面の 4 割近くまで下がる (screenshots/mobile-13-compare-overview.png)。「×」と「地図で比較→情報で比較」など閉じる/戻る導線が複線化して分かりにくい。
- 原因: `SkiResortCompareView` の `comparePanelContent` がデスクトップ用ヘッダーを含んだまま、モバイルでは `presentation="inline"` として `MobileContextHeader` の下にそのまま埋め込まれるため。
- 修正内容: `presentation="inline"` のとき `SkiResortCompareView` 内のタイトルブロックと×ボタンを非表示にする (`hideHeader` prop 追加など)。タブ (概要/天候) は残す。
- 検証方法: モバイルで比較を開き、ヘッダーが1段になりコンテンツ開始位置が上がること。デスクトップの比較パネルは従来通り。
- 区分: 実装レディ

## [優先度: 中] Snow Forecast 埋め込み iframe のクロップ量ハードコードで下端が見切れる
- 対象ファイル: src/features/home/components/compare/constants.ts (7–32行), src/features/home/components/compare/CompactSnowForecastEmbed.tsx
- 症状: デスクトップ比較の天候タブで、iframe 下端のテキスト行 ("Light rain, light winds…") が中途半端に見切れる (screenshots/desktop-10-compare-weather.png)。クロップ位置 (`CROP_TOP=35`, `CROP_RIGHT=290` など) と `SNOW_FORECAST_FEED_ZOOM=0.92` が外部サイトの現行レイアウトに合わせた px ハードコードのため、snow-forecast.com 側の変更で簡単にズレる。
- 原因: 外部 iframe を transform+crop で無理やり切り抜く実装。構造上ある程度は避けられないが、数値が 10 個以上の定数に分散しており調整コストが高い。
- 修正内容: 即修正よりも「ズレたときに調整する場所」を README コメントで constants.ts に集約明記し、viewport 高さを数 px 増やして見切れを解消 (`SNOW_FORECAST_FEED_VIEWPORT_HEIGHT` 170→190 目安)。
- 検証方法: デスクトップ比較の天候タブで下端の行が読み切れること。モバイル (mobile-14-compare-weather.png) のクロップが崩れないこと。
- 区分: 要判断

## [優先度: 中] Chakra レスポンシブ prop・生 media query・コンテナクエリ・JS の matchMedia が混在
- 対象ファイル:
  - src/features/home/constants.ts:18 `SIDE_PANEL_MEDIA_QUERY = "(min-width: 48em)"` (JS matchMedia)
  - src/features/map/constants.ts:30 `MOBILE_MAP_MEDIA_QUERY = "(max-width: 47.999em)"` (JS matchMedia)
  - src/features/home/components/SkiResortList.tsx:9 `HOVER_HIGHLIGHT_MEDIA_QUERY` (JS matchMedia)
  - src/features/resort-detail/SkiResortDetailView.tsx:321 / SkiResortCompareView.tsx:95 `useBreakpointValue({ base, md }, { ssr: false })`
  - src/features/home/components/compare/CompareWeatherTab.tsx:152–217 コンテナクエリ + px 定数
  - 各コンポーネントの Chakra `{ base, md }` prop
- 症状: 同じ「768px 境界」の判定が 5 通りの書き方で分散。`useSidePanelLayout` (state) と CSS の `display={{ base, md }}` が二重に効いている画面が多く、初回レンダー時は `isSidePanelLayout=false` で始まるため PC でも一瞬モバイル向け分岐が走る (SSR 直後のちらつき・无駄レンダーの温床。観点Cのハイドレーションエラーとも関連)。
- 原因: ブレークポイント定数と「レイアウト判定フック」が一元化されていない。
- 修正内容: `shared/constants/breakpoints.ts` に 48em を単一定義し、JS 判定は `useSidePanelLayout` 1 本に寄せる (map の `MOBILE_MAP_MEDIA_QUERY` も同じ定数から導出)。`useBreakpointValue` の 2 箇所は `useSidePanelLayout` を props で受ける形に統一。
- 検証方法: 型チェック + 全幅 (375/768/820/1280) でレイアウト切替が従来通りであること。ウィンドウリサイズで 768px を跨いだときの挙動確認。
- 区分: 実装レディ (機械的な統一)

## [優先度: 中] タップ領域が 44px 未満のコントロールが多い
- 対象ファイル: src/features/filters/components/FilterControls.tsx (FilterToggle `h={{ base: "28px" }}`、CompactNumberInput `h={{ base: 9 }}` は 36px で許容), src/features/resort-detail/components/InfoSection.tsx (閉じるボタン `h={7} w={7}` = 28px), src/features/home/layout/HomeLayout.tsx (詳細ヘッダーの×ボタン `h={8} w={8}` = 32px), src/features/map/components/MapControls.tsx (モバイル `h={10}` = 40px で概ね OK)
- 症状: モバイルで都道府県トグル (高さ28px)・詳細の閉じるボタン (28〜32px) などが Apple/Google 推奨の 44px を下回り、誤タップしやすい (screenshots/mobile-02-search-overlay.png の都道府県ボタン群)。
- 原因: デスクトップ向けの密なサイズをモバイルでも流用。
- 修正内容: モバイル (`base`) では最低 `minH="36px"`、閉じる系は 40px 以上に。FilterToggle は `h={{ base: "36px", md: "32px" }}` へ。
- 検証方法: モバイル幅でフィルタ群・閉じるボタンの高さを DevTools で計測 (36px 以上)。レイアウト崩れがないこと。
- 区分: 実装レディ

## [優先度: 低] 検索結果 0 件時、モバイル結果ヘッダーに絞り込み条件が表示されないことがある (「営業中のみ」)
- 対象ファイル: src/features/filters/utils/filterLabels.ts (92–135行)
- 症状: 「営業中のみ」だけを ON にして検索すると、結果ヘッダーのチップ列に条件が出ず「0件」だけが表示される。PC の折りたたみパネルでは「条件なし」と表示され、実際にはフィルタされているのに条件が見えない。
- 原因: `getActiveFilterLabels` が `filters.status` のラベルを生成していない (バグ。詳細は bugs-and-refactoring.md 側に記載)。
- 修正内容: bugs-and-refactoring.md「営業中のみフィルタのラベル欠落」参照。
- 検証方法: 同上。
- 区分: 実装レディ

## [優先度: 低] 比較地図 (モバイル) でリゾートラベルが画面端で見切れる
- 対象ファイル: src/features/map/utils/viewport.ts (getSafeFitPadding 52–74行), src/features/map/hooks/useJapanMapLabelLayout.ts
- 症状: 「地図で比較」で 2 地点にフィットした際、片方のラベル (「…KANKO高穂」) が左端で切れて表示される (screenshots/mobile-15-compare-maptab.png)。
- 原因: `fitBounds` のパディングが基本 32px 固定で、ラベル幅 (地点の左右に伸びる) を考慮していない。ラベル配置エンジン (`useJapanMapLabelLayout`) はビューポート外配置を許容する `createExpandedLabelViewport` を使っている。
- 修正内容: 比較モードの `fitResortsInViewport` 呼び出し時に左右パディングを最大ラベル幅程度 (約 120px) 加算する、またはラベル候補選択でビューポート内配置を優先。
- 検証方法: モバイルで 2〜3 件比較 → 地図で比較 → 全ラベルが読めること。
- 区分: 実装レディ

## [優先度: 低] デスクトップ検索パネルの幅 400px 固定
- 対象ファイル: src/features/home/components/DesktopSearchPanel.tsx (53行 `w="400px"`)
- 症状: 768〜900px 程度のウィンドウでは地図側が 370〜500px しか残らない (screenshots/tablet-01-top-820.png)。実害は小さいが、詳細パネル `w="min(720px, 70vw)"` と設計思想が揃っていない。
- 原因: 幅の px 固定。
- 修正内容: `w="min(400px, 45vw)"` など上限付き可変幅へ。
- 検証方法: 768〜1280px の各幅で検索パネルと地図の比率を確認。
- 区分: 実装レディ

## [優先度: 低] `userScalable: false` / `maximumScale: 1` によるピンチズーム全面禁止
- 対象ファイル: src/app/layout.tsx (17–23行), src/features/home/hooks/useHomeGestureGuards.ts
- 症状: ページ全体のピンチズームが禁止されている。地図の誤ズーム防止が目的と思われるが、`useHomeGestureGuards` が既に非地図領域の gesturestart/touchmove を preventDefault しており二重。テキスト拡大が必要なユーザーにはアクセシビリティ上の問題 (WCAG 1.4.4)。
- 原因: viewport メタと JS ガードの重複対策。
- 修正内容: `userScalable: false` / `maximumScale: 1` を外し、JS ガード側に一本化することを検討 (iOS Safari は viewport 設定を無視してズームを許可するため実効性も薄い)。
- 検証方法: 実機でダブルタップ/ピンチ時に地図以外が意図せずズームしないこと (要実機確認)。
- 区分: 要判断 (要実機確認)

## [優先度: 低] モバイル詳細用のタブ定義「地図」が UI に存在しない (設定だけ残存)
- 対象ファイル: src/features/home/layout/HomeLayout.tsx (661–666行)
- 症状: `MobileContextHeader` の `tabs` に `detail: { info: "詳細", map: "地図" }` が定義されているが、タブ UI が描画されるのは `mode === "compare"` のときだけ。詳細画面から全画面地図へは地図プレビュー右上の拡大ボタン (⤢) しか導線がない (Playwright でも「地図」タブは検出されず)。
- 原因: 詳細画面の地図タブを廃止 (プレビュー+拡大に置換) した際の設定消し忘れ、もしくはタブ描画の実装漏れ。
- 修正内容: 意図確認の上、(a) 設定オブジェクトから detail 分岐を削除するか、(b) compare と同様にタブを描画する。
- 検証方法: (a) なら型チェックのみ。(b) ならモバイル詳細で地図タブ切替を確認。
- 区分: 要判断

## 参考: 問題なしを確認した点
- 検索オーバーレイのキーボード対応 (`visualViewport` 監視 + `flushSync` での同期フォーカス) は丁寧に実装されている。
- 地図のズームコントロール類はモバイルで 40px 角を確保。
- モバイルの検索結果リスト (screenshots/mobile-05-search-results-list.png)、天候比較 (mobile-14-compare-weather.png) はレイアウト良好。
- リストの長い名前は ellipsis 処理済み (「ばんけいの森…」)。
