# 観点C: バグ・無駄な処理・リファクタリング候補の調査結果

調査日: 2026-07-10。再現確認は `next dev` (localhost:3001) 上で Playwright により実施。
スクリーンショットは `docs/plans/screenshots/` 配下。

---

# 1. バグ

## [優先度: 中] コース統計に「--°」「--m」と単位付きプレースホルダが表示される
- 対象ファイル: src/features/resort-detail/tabs/CoursesTab.tsx (455–463行)
- 症状: データ未取得のスキー場の詳細 > コースタブで、最大斜度が「–°」、最長滑走距離が「--m」と表示される (screenshots/desktop-04-detail-courses.png, mobile-07-detail-courses.png で実際に「–°」を確認)。
- 原因: テンプレートリテラルでフォールバック文字列にも単位を連結している:
  ```tsx
  value={`${resort.longestCourse?.toLocaleString() || "--"}m`}
  value={`${resort.steepestSlope || resort.angleMax || "--"}°`}
  ```
- 修正内容: 既存の `formatMeters` / `formatDegree` (utils/detailMetrics.ts) を使う:
  ```tsx
  value={formatMeters(resort.longestCourse)}
  value={resort.steepestSlope ?? resort.angleMax ? `${resort.steepestSlope ?? resort.angleMax}°` : "--"}
  ```
- 検証方法: 再現手順: finalizedMapData が無く `steepestSlope`/`angleMax` が null のスキー場 (例: ASHIMOI KANKO高穂) の詳細 > コースタブを開く。修正後: 「--」とだけ表示され単位が付かない。値があるスキー場では従来通り単位付き。
- 区分: 実装レディ

## [優先度: 中] `getPisteStyle` の 2 実装が食い違い、「一部圧雪 (△)」の描画スタイルが версии により異なる
- 対象ファイル: src/lib/finalizedResortGeojsonShared.ts (171–175行), src/lib/finalizedResortGeojson.ts (471–476行)
- 症状: Shared 版 (地図が実際に使用) は `△ → "solid"`、非Shared 版 (デッドコード) は `△ → "dash"`。どちらかの変更がもう片方に反映されなかった痕跡で、「一部圧雪コースを破線にする」仕様が意図せず消えた可能性がある (現在 `pisteStyle` 自体が DetailMapLayers で `dashArray = undefined` 固定のため未使用 — 二重に死んでいる)。
- 原因: ファイル重複 (code-structure.md 参照) + `pisteStyle` を使う描画コードの削除。
- 修正内容: 仕様確認の上、(a) 破線表現を復活させるなら Shared 版の `getPisteStyle` を修正して DetailMapLayers の `dashArray` に接続、(b) 非圧雪表現は現在アンダーレイ色 (`pisteUnderlay`) で行っているので、`pisteStyle` 自体を削除。
- 検証方法: コースマップのあるスキー場 (例: ルスツ・GALA湯沢) で△状態のコースの見た目を確認。(b) なら型チェックのみ。
- 区分: 要判断

## [優先度: 中] MobileResultsSheet が `onOpenChange` / スナップ関連 props を受け取るが一切使っていない
- 対象ファイル: src/features/home/components/MobileResultsSheet.tsx (16–24行で宣言、39行で未分割), src/features/home/layout/HomeLayout.tsx (404–425行)
- 症状: `listSheetSnapPoint`, `snapPoints`, `onOpenChange`, `onSetSnapPoint` が Props にあり HomeLayout がハンドラを渡しているが、コンポーネント内で参照されない。特に `onOpenChange` には「シートを閉じたら比較も閉じる」ロジックが接続されているのに呼ばれない。ボトムシート (vaul) から通常の Box に作り替えた際、ハンドラの発火経路が失われた可能性が高い。現在シートの開閉は `isListSheetOpen` の display 切替のみで動いており、「モバイル比較でシートを閉じて比較を終了する」経路が機能しているか怪しい。
- 原因: vaul Drawer → 素の Box への移行時に props の掃除・再接続漏れ。
- 修正内容: 現仕様 (シートはタブ切替でのみ開閉) を確認の上、未使用 props を Props 型・呼び出し側から削除。`onOpenChange` 内の「閉じたら onCloseCompare」ロジックが不要になったのかを確認し、不要なら HomeLayout 側の該当ロジックも削除。
- 検証方法: 型チェック + モバイルで「リスト⇄地図」タブ切替・比較オープン/クローズの動作確認 (比較中に地図タブ→リストタブへ戻ったとき比較が維持されるべきかを仕様として明文化)。
- 区分: 要判断

## [優先度: 中] SkiResortCompareView の vaul ボトムシート分岐 (~100行 + 依存 `vaul`) が到達不能
- 対象ファイル: src/features/home/components/SkiResortCompareView.tsx (270–372行), src/features/home/layout/HomeLayout.tsx (531–539行), src/features/home/components/MobileResultsSheet.tsx (51–58行)
- 症状: `presentation="sheet"` (デフォルト) でレンダーされるのは `isCompareOpen && isSidePanelLayout` のときだけ (HomeLayout 532行)。つまり sheet モード時は常に PC レイアウトであり、`!isSidePanel` の vaul Drawer 分岐 (snap point 管理、100vh 計算、DrawerPortal 一式) はウィンドウリサイズの一瞬を除き実行されない。モバイルは MobileResultsSheet 経由で `presentation="inline"`。
- 原因: モバイル比較を inline 埋め込みに変更した際、旧ボトムシート実装が残った。
- 修正内容: vaul 分岐と関連ローカル定数 (`BOTTOM_SHEET_*`, `isBottomSheetExpanded`, `VISUALLY_HIDDEN_STYLE`, `BOTTOM_SHEET_CONTENT_STYLE`, `BOTTOM_SHEET_HANDLE_STYLE`)、`sheetSnapPoint` state、wheel/touch での expand ロジックを削除。`package.json` の `vaul` も他で未使用なら削除。
- 検証方法: 再現手順: モバイルで比較を開いても vaul の Drawer DOM (`[data-vaul-drawer]`) が存在しないことを確認 (現状確認済み)。削除後、PC の比較パネル・モバイル inline 比較の表示/スクロール/閉じる動作が変わらないこと。PC→モバイルへのウィンドウリサイズ時にクラッシュしないこと。
- 区分: 要判断 (到達不能の確認自体は済み、リサイズ時の挙動確認のみ)

## [優先度: 中] JapanResortMap: finalizedMapData 変更時の useEffect が if/else 両方で同じ処理
- 対象ファイル: src/features/map/JapanResortMap.tsx (435–441行)
- 症状:
  ```tsx
  useEffect(() => {
    if (finalizedMapData === null) {
      setSelectedFinalizedFeature(null);
      return;
    }
    setSelectedFinalizedFeature(null);
  }, [finalizedMapData, setSelectedFinalizedFeature]);
  ```
  分岐に意味がない。さらに `setSelectedFinalizedFeature` は `onSelectedFinalizedFeatureChange` に依存する useCallback のため、親がインライン関数を渡すと毎レンダー発火し、選択解除→再選択の無駄なサイクルが起こり得る (現状 HomeClient は useCallback を渡しているため顕在化していない)。
- 原因: リファクタの途中残骸。
- 修正内容: `useEffect(() => { setSelectedFinalizedFeature(null); }, [finalizedMapData])` に簡約 (依存から setter を外すか、setter を ref 化)。「詳細を開いた直後に前回の選択が残らない」ことが目的なら、`selectedResortId` 変更時のみクリアで十分かも要確認。
- 検証方法: 詳細 A → 閉じる → 詳細 B と開いたとき、B の地図で A のコース選択ハイライトが残らないこと。コース選択→標高プロファイル表示が従来どおり。
- 区分: 実装レディ

## [優先度: 低] ImageCarousel: images 配列が毎レンダー新規生成され、オートプレイのタイマーがリセットされ続ける
- 対象ファイル: src/features/resort-detail/SkiResortDetailView.tsx (431–434行), src/features/resort-detail/components/ImageCarousel.tsx (25–29行)
- 症状: `const images = [...(resort.outlineImages||[]), ...(resort.courseImages||[])]` がレンダー毎に新しい配列となり、`useEffect` の依存 `[images, nextSlide]` により親が再レンダーするたび (タブ切替・比較トグル・地図操作等) に 4 秒タイマーがリセットされる。頻繁に再レンダーする状況ではスライドが進まない。また images が減った場合 `currentSlide` が範囲外のまま残る。
- 原因: 依存配列に不安定な参照を渡している。
- 修正内容: 親側で `useMemo` 化するか、ImageCarousel 内の依存を `images.length` にする。`currentSlide` は `Math.min(currentSlide, images.length - 1)` でクランプ。
- 検証方法: デスクトップ詳細を開いたまま比較トグルなどで再レンダーを起こし、カルーセルが 4 秒ごとに進み続けること。
- 区分: 実装レディ

## [優先度: 低] matchesFilters: 「初級者向け」がデータ未設定 (0%) のスキー場を除外する
- 対象ファイル: src/features/filters/utils/filterResorts.ts (39–41行)
- 症状: `beginnersCoursesPercent < 30` で除外するため、コース割合データが無く 0 になっているスキー場は「初級者向けでない」と判定される。データ欠損と「上級者向け」の区別がない。
- 原因: 欠損値の扱いが未定義。
- 修正内容: 仕様判断。欠損 (0 かつ numberOfCourses 情報なし等) は除外しない、または UI に「データなしを含む」注記。
- 検証方法: 初級者向け ON 時の件数が意図と合うかをデータと突き合わせ。
- 区分: 要判断

# 2. 無駄な処理・パフォーマンス

## [優先度: 中] HomeLayout で毎レンダー 506 件走査 (regionOptions / activeFilterLabels がメモ化なし)
- 対象ファイル: src/features/home/layout/HomeLayout.tsx (236–251行)
- 症状: `availablePrefectureSet` (506 件 map+filter)、`mobileRegionOptions` (地域×都道府県 filter)、`mobileActiveFilterLabels` が素の式として毎レンダー実行される。HomeLayout はシートのドラッグ・ホバー・スナップ変更などで高頻度に再レンダーされるため無駄が大きい。
- 原因: useFilterPanelState に同じロジックのメモ化版があるのに、ここでは直書き (code-structure.md の重複項目と同根)。
- 修正内容: `useRegionOptions(resorts)` フックに共通化して useMemo 化。
- 検証方法: React DevTools Profiler で HomeLayout の render 時間を前後比較。表示は不変。
- 区分: 実装レディ

## [優先度: 中] getSkiResortById が詳細を開くたびに全ての重い関連データを一括取得する
- 対象ファイル: src/actions/skiResorts.ts (153–183行)
- 症状: 詳細を開く (地図マーカー1タップ) たびに、courses/lifts/tickets/weathers/latestReports/yukiMagi/snowDepths (全期間 asc) + finalizedMapData (GeoJSON ファイル読込・正規化) をサーバーで全部組み立てて返す。GeoJSON は座標列が大きく、比較 (`handleOpenCompare`) でも同じ関数を件数分呼ぶため、比較には不要な finalizedMapData・snowDepths まで N 件分転送される。
- 原因: 詳細用のフル取得関数を比較にも流用している。
- 修正内容: (1) 比較用に `getSkiResortForCompare` (基本情報 + weatherIds のみ) を分ける。(2) snowDepths は気候タブ表示時に遅延取得する (既存の `getSkiResortSnowDepths` が使える)。
- 検証方法: Network タブで詳細/比較オープン時のレスポンスサイズを前後比較。比較の概要・天候タブが従来どおり表示されること。
- 区分: 要判断 (分割粒度)

## [優先度: 中] SkiResortWeatherIds.json の線形探索が詳細取得のたびに走る
- 対象ファイル: src/actions/skiResorts.ts (99–113行)
- 症状: `getWeatherIdsBySkiResortId` が呼び出しごとに JSON 配列を `find` で線形探索。比較 N 件では N 回。データ量は小さいので実害は軽微だが、モジュールスコープで `Map` 化すれば済む。
- 原因: 素朴な実装。
- 修正内容: モジュール初期化時に `new Map(entries.map(e => [e.skiResortId, e]))` を構築して lookup。
- 検証方法: 詳細の気候タブのリンクが従来どおり出ること。
- 区分: 実装レディ

## [優先度: 低] HomeClient: 同一内容の useMemo が 2 つ (スナップポイント配列)
- 対象ファイル: src/features/home/HomeClient.tsx (657–667行)
- 症状: `mobileSearchResultSnapPoints` と `mobileCompareSnapPoints` はどちらも `[...BOTTOM_SHEET_SNAP_POINTS]` で完全に同一。しかも選択結果 `mobileListSheetSnapPoints` は MobileResultsSheet 側で使われていない (前述のデッド props)。
- 原因: かつて比較用に別のスナップ構成があった名残。
- 修正内容: デッド props 削除と同時に両 useMemo を削除。
- 検証方法: 型チェック + モバイルシート動作確認。
- 区分: 実装レディ

## [優先度: 低] CoursesTab / LiftsTab: `?? []` により useMemo の依存が毎レンダー変わる
- 対象ファイル: src/features/resort-detail/tabs/CoursesTab.tsx (83–87行), LiftsTab.tsx (40行)
- 症状: `const finalizedCourses = finalizedMapData?.courses?.features ?? []` は finalizedMapData が null のとき毎レンダー新配列を返し、下流の `useMemo(() => createFinalizedCourseGroups(...), [finalizedCourses])` が毎回再計算される。
- 原因: 空配列リテラルのインライン生成。
- 修正内容: `map/utils/finalizedMapData.ts` に既にある `EMPTY_FINALIZED_COURSES` / `EMPTY_FINALIZED_LIFTS` を使う (shared へ移すのが筋なら detailMetrics 側に定数を置く)。
- 検証方法: 型チェック + コースタブ表示確認。
- 区分: 実装レディ

## [優先度: 低] useMapZoomInteractionSurface: 同一要素へ React capture props と native listener を二重登録、schedule 機構も形骸化
- 対象ファイル: src/features/map/hooks/useMapZoomInteractionSurface.ts, src/features/map/JapanResortMap.tsx (527–539行)
- 症状: ラッパー div に `onWheelCapture` 等の React props と、useEffect での `addEventListener` の両方が付いており、1 回の wheel で `scheduleWrapperZoomInteraction` が 2 回呼ばれる。また `schedule...` は「pending フラグを立てて即 complete」しており、`wrapperZoomInteractionTimeoutRef` に値が入ることがなく、タイマー管理コードは全て死んでいる。
- 原因: 実装変遷の残骸。
- 修正内容: native listener 側 (または React props 側) に一本化し、`onUserMapZoomInteraction?.()` を直接呼ぶ数行のフックに簡約。
- 検証方法: モバイル幅エミュレーションでピンチ/ダブルタップ/ホイール時にボトムシートが畳まれること (handleUserMapZoomInteraction の発火を console で確認)。
- 区分: 実装レディ

## [優先度: 低] DetailMapNameLabels: オフセット 0 の同一候補を 2 回評価 / 定数関数
- 対象ファイル: src/features/map/components/DetailMapNameLabels.tsx (860–864行 `liftOffset = 0` で `+0` と `-0` の候補 2 つ, 123–127行 `getCourseStraightnessLimit` は全分岐 10)
- 症状: リフトラベル配置で全く同じ placement を 2 回衝突判定している。`getCourseStraightnessLimit` はどの zoom でも 10 を返す関数。
- 原因: パラメータ調整の痕跡。
- 修正内容: 候補 1 つに簡約、関数は定数 `COURSE_STRAIGHTNESS_LIMIT_PX = 10` に。将来調整するつもりなら現状維持でコメント追加でも可。
- 検証方法: コースマップ表示でラベル配置が変わらないこと (同一入力なら決定的)。
- 区分: 実装レディ

# 3. デッドコード (削除候補一覧)

## [優先度: 中] 未使用のコンポーネント・関数・型・定数
- 対象ファイル・シンボル (いずれも `grep` で参照ゼロを確認済み):
  - src/features/home/components/CompareActionButton.tsx — コンポーネントごと未使用
  - src/features/home/constants.ts: `MOBILE_COMPARE_BUTTON_BOTTOM_CLOSED`, `MOBILE_COMPARE_BUTTON_BOTTOM_GAP`, `BOTTOM_SHEET_MAP_PEEK_HEIGHT` (home 版)
  - src/features/map/utils/finalizedMapData.ts: `getUngroomedDashArray`
  - src/actions/skiResorts.ts: `getSkiResorts`, `getSkiResortWeather`, `getSkiResortSnowDepths`, `getYukiMagiList` — **"use server" のため未使用でも POST エンドポイントとして公開されている**。`getSkiResorts` は全件フル relation 取得なので放置リスクが高い
  - src/types/index.ts: `SkiResortWithWeather` / src/types/forecasts.ts 全体 / src/types/weathers.ts の `WeathersT`・`WeatherData`
  - src/features/resort-detail/components/ElevationProfile.tsx: `showSlope` prop (受け取るが未使用。呼び出し側 2 箇所は指定している)
  - src/features/resort-detail/SkiResortDetailView.tsx: `sheetSnapPoint` / `setSheetSnapPoint` / `mobileContentTab` props (常に "info" 固定で渡され、内部でも実質未使用)、`canScrollDetailContent` (常に true の定数)
  - src/features/map/JapanResortMap.tsx: `_mapZoomSurfaceRef` (325行)
  - src/features/home/layout/HomeLayout.tsx: `MobileContextHeader` の detail 用タブ定義 (responsive-fixes.md 参照)
- 修正内容: 上記を削除。skiResorts.ts の未使用 action は「今後使う予定」が無ければ削除、あるなら "use server" ファイルから外して lib へ。
- 検証方法: `mise run check` (typecheck + lint) が通ること。`next build` 成功。主要フローの手動確認。
- 区分: 実装レディ (未使用 action の扱いのみ要判断)

# 4. 過剰に複雑な実装

## [優先度: 中] CoursesTab の finalized / 非 finalized 分岐で約 230 行が重複
- 対象ファイル: src/features/resort-detail/tabs/CoursesTab.tsx (211–445行と447–681行)
- 症状: 「統計カード 4 枚 → レベル別割合バー → 難易度セレクト付きコース一覧テーブル」という同一構造が、finalized 用と resort.courses 用でほぼ丸ごと 2 回書かれている。レベル別割合バー (green/blue/red の 3 分割 Flex) は 1 文字違いレベルのコピー。
- 原因: finalized データ対応を追加した際に分岐ごと複製した。
- 修正内容: `LevelRatioBar({ beginner, intermediate, advanced })`、`CourseStatsCards`、`CourseTable` (行データを正規化して渡す) に分解し、分岐はデータ整形のみにする。LiftsTab も同様の構造 (3 分岐) なので同じ部品を使う。
- 検証方法: finalized ありのスキー場 (ルスツ等) と無しのスキー場の両方でコース/リフトタブの表示が前後一致すること (スクリーンショット比較)。ソート・難易度フィルタの動作確認。
- 区分: 実装レディ

## [優先度: 中] WeatherTab の積雪データ整形: 3 重配列への詰め替えが過剰
- 対象ファイル: src/features/resort-detail/tabs/WeatherTab.tsx (15–54行), src/features/weather/utils/weatherChartData.ts, src/types/weathers.ts (`SnowDepthsT`)
- 症状: `snowDepths` (date, depth の配列) を「シーズン年 → 月インデックス(1,2,3,4,12月) → 日 (32 要素)」の 3 重配列 `SnowDepthsT` に詰め替えた後、`createSnowDepthLineData` が結局「月/日」キーで全年をフラットに集計し直している。`firstYear` はガード以外未使用で、途中の年が欠けると `Object.values` の詰めにより意味を失うが、最終出力には影響しないため誰も気づかない、という分かりにくさ。
- 原因: 旧チャート実装 (年別表示?) のデータ形式を維持したまま集計仕様が変わった。
- 修正内容: WeatherTab から `SnowDepthRecord[]` をそのまま `createSnowDepthLineData` に渡し、内部で「月/日 → depth[]」の Map を直接作る形に書き直す。`SnowDepthsT` は削除。
- 検証方法: 積雪データのあるスキー場 (例: かぐら・ニセコ系) の気候タブでチャートの中央値/最大/最小の各点が前後一致すること (лineData を console.log でダンプして diff、またはユニットテスト追加)。
- 区分: 実装レディ

## [優先度: 低] scheduleRestoreDocumentPointerEvents: rAF + setTimeout×3 の散弾銃的リトライ
- 対象ファイル: src/features/home/utils/dom.ts (23–29, 47–51行)
- 症状: `document.body.style.pointerEvents` の復元を即時 + rAF + 0ms + 120ms + 300ms の 5 回実行。スクロール位置復元も 3 回。vaul (modal) が body に付ける pointer-events: none の解除タイミング問題への対処と推測されるが、根拠のコメントがなく、タイミング競合を時間差リトライで握りつぶしている。
- 原因: 対症療法の積み重ね。
- 修正内容: vaul 削除 (前述) 後に再現テストし、不要になれば単純化。残す場合は理由をコメントで明記。
- 検証方法: モバイルで詳細を閉じた直後に地図がタップ可能なこと、リスト復帰時にスクロール位置が戻ること。
- 区分: 要判断

## [優先度: 低] WeatherChart CustomTooltip: 系列名の文字列一致で色をハードコード
- 対象ファイル: src/features/weather/WeatherChart.tsx (162–225行)
- 症状: ツールチップの文字色を「中央値」「最大値」…といった日本語/英語の系列名で switch しており、系列追加・改名で静かに壊れる。「最高気温」「降雪確率」など現在存在しない系列の分岐も残っている (旧チャートの残骸)。
- 原因: payload の `stroke`/`fill` を使えば済む処理を名前ベースで実装。
- 修正内容: `pld.stroke ?? pld.fill ?? pld.color` を第一候補にし、名前分岐を削除。
- 検証方法: 気候タブのチャートで各系列のツールチップ文字色が系列色と一致すること。
- 区分: 実装レディ

## [優先度: 低] runCrawlerIfNeeded / runAllCrawlersIfNeeded の名前が実態と不一致
- 対象ファイル: src/actions/crawl.ts
- 症状: 「IfNeeded」と言いつつ lastRunAt 等のチェックはなく常に実行する。戻り値 `ran` も常に true。スケジューラのログを読む人が誤解する。
- 原因: 実行条件チェックが未実装のまま命名だけ残った。
- 修正内容: `runCrawler` / `runAllCrawlers` に改名 (または本当に必要なら CrawlLog の lastRunAt を見て日次スキップを実装)。code-structure.md の「Server Action をやめ lib へ移動」と同時に実施。
- 検証方法: スケジューラ起動 (本番モード) でクロールが従来どおり実行され、CrawlLog が記録されること。
- 区分: 実装レディ

# 5. TypeScript strict を損なう箇所

## [優先度: 中] DetailMapLayers の `as unknown as FinalizedLineFeature` (5 箇所)
- 対象ファイル: src/features/map/components/DetailMapLayers.tsx (393, 399, 441行ほか)
- 症状: leaflet の `GeoJSON.Feature` と独自の `FinalizedLineFeature` の橋渡しに double assertion を多用。properties の形が変わってもコンパイルエラーにならない。
- 原因: `L.geoJSON` のコールバック型が geojson 標準型で固定なため。
- 修正内容: `const properties = feature.properties as FinalizedLineFeatureProperties` のように assertion 対象を最小化し、`style`/`onEachFeature` に渡す前に 1 箇所でナローイングするヘルパー (`asFinalizedFeature(feature): FinalizedLineFeature`) に集約 + 開発時 assert。
- 検証方法: 型チェック + コースマップ表示。
- 区分: 実装レディ

## [優先度: 低] SkiResortWeatherIds.json の `as SkiResortWeatherIdsEntry[]` キャスト
- 対象ファイル: src/actions/skiResorts.ts (100行)
- 症状: 名寄せ辞書 JSON を無検証キャスト。キー名変更 (`SnowForecastId` と `snowForecast` の大文字小文字混在が既にその兆候) があっても型エラーにならない。
- 原因: スキーマ検証なし。依存に `zod` があるのに未使用。
- 修正内容: zod スキーマを定義しモジュール初期化時に parse (失敗時はビルド/起動で気づける)。
- 検証方法: 既存 JSON が parse を通ること。わざとキー名を壊すと起動時にエラーになること。
- 区分: 実装レディ

## [優先度: 低] スナップポイントの型 `number | string | null` が実態より広い
- 対象ファイル: src/features/home/HomeClient.tsx, HomeLayout.tsx, SkiResortDetailView.tsx, MobileResultsSheet.tsx ほか (snapPoint 関連の全 props)
- 症状: vaul の API に合わせて `number | string | null` で引き回しているが、実際に入る値は `BOTTOM_SHEET_SNAP_POINTS` の number のみ。`getBottomSheetHeightRatio` は string を 0 に潰すなど、使いもしない string ケースの防御コードが各所にある。
- 原因: vaul の型をそのまま伝播。
- 修正内容: vaul 依存の整理 (前述) 後、`type BottomSheetSnapPoint = number` (または union of literal) に狭める。
- 検証方法: 型チェック + シート開閉動作。
- 区分: 実装レディ

## [優先度: 低] `coordinate[2] as number` (標高) の assertion
- 対象ファイル: src/features/resort-detail/utils/detailMetrics.ts (133, 210行)
- 症状: `coordinates.every(c => c.length >= 3)` でガードした後とはいえ、型上は `[number, number]` の可能性が残るため as で潰している。
- 原因: `GeoCoordinate` が 2 要素/3 要素の union のため。
- 修正内容: ガードを型述語 (`isCoordinate3D(c): c is [number, number, number]`) にして filter し、as を排除。
- 検証方法: 型チェック + 標高プロファイル表示。
- 区分: 実装レディ
