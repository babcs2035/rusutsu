"use client";

import { Check, Maximize2, Minimize2, Plus, X } from "lucide-react";
import type {
  ComponentType,
  ChangeEvent as ReactChangeEvent,
  FormEvent as ReactFormEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  RefObject,
} from "react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { REGION_PREFECTURES } from "@/features/filters/constants";
import type { Filters } from "@/features/filters/types";
import { getActiveFilterLabels } from "@/features/filters/utils/filterLabels";
import { DEFAULT_LIFT_TICKET_SEARCH_INPUT } from "@/features/lift-ticket/utils/calculateLiftTicket";
import type {
  CourseColorMode,
  ElevationProfileMapPoint,
  JapanResortMapProps,
  MapTileVariant,
  SelectedMapFeature,
} from "@/features/map/types";
import { SkiResortDetailView } from "@/features/resort-detail/SkiResortDetailView";
import { cn } from "@/lib/utils";
import { AnimatedPanel } from "@/shared/components/AnimatedPanel";
import { SegmentedControl } from "@/shared/components/SegmentedControl";
import type {
  MapSkiResort,
  NullableSkiResortDetail,
  SkiResortDetail,
} from "@/types/skiResorts";
import { CompareMapHeaderBar } from "../components/compare/CompareMapHeaderBar";
import type { CompareSlopeSelection } from "../components/compare/CompareSlopeMapBoard";
import {
  CompareSlopeFeatureDetail,
  CompareSlopeMapBoard,
} from "../components/compare/CompareSlopeMapBoard";
import type { CompareLeftPane } from "../components/compare/types";
import { DesktopSearchPanel } from "../components/DesktopSearchPanel";
import { MobileResultsSheet } from "../components/MobileResultsSheet";
import { MobileSearchButton } from "../components/MobileSearchButton";
import { MobileSearchOverlay } from "../components/MobileSearchOverlay";
import { MobileSearchTopBarShell } from "../components/MobileSearchTopBarShell";
import { SkiResortCompareView } from "../components/SkiResortCompareView";
import type { MapViewRestoreRequest } from "../types";

/**
 * 比較の左エリアの右端。比較パネルの手前で止める。
 * 地図エリアは検索パネルのぶんだけ既に狭いので、その差だけを詰める。
 */
const COMPARE_LEFT_PANE_RIGHT =
  "max(0px, calc(var(--compare-panel-width) - var(--desktop-search-panel-width)))";

const MOBILE_CONTENT_TAB_OPTIONS = [
  { value: "map", label: "地図" },
  { value: "info", label: "リスト" },
] as const satisfies readonly { value: "info" | "map"; label: string }[];

type Props = {
  DynamicMap: ComponentType<JapanResortMapProps>;
  compareResortData: SkiResortDetail[];
  filteredResortIdSet: Set<string>;
  filteredResortIds: string[];
  filteredResorts: MapSkiResort[];
  filters: Filters;
  hasActiveFilters: boolean;
  hasSearched: boolean;
  hoveredResortId: string | null;
  initialResorts: MapSkiResort[];
  isCompareLoading: boolean;
  isCompareOpen: boolean;
  isFilterEditorOpen: boolean;
  isListSheetOpen: boolean;
  isMobileFilterOverlayOpen: boolean;
  isPending: boolean;
  isSidePanelLayout: boolean;
  listSheetContentRef: RefObject<HTMLDivElement | null>;
  listSheetSnapPoint: number | string | null;
  mapInteractionMode: JapanResortMapProps["interactionMode"];
  mobileContentTab: "info" | "map";
  mobileFilterOverlayRef: RefObject<HTMLDivElement | null>;
  mobileListSheetSnapPoints: (number | string)[];
  mobileDraftFilteredResortCount: number;
  mobileDraftHasChanges: boolean;
  mobileDraftFilters: Filters;
  mobileSearchFilterBottomPadding: string;
  mobileSearchFilterScrollRef: RefObject<HTMLDivElement | null>;
  mobileSearchPanelInputRef: RefObject<HTMLInputElement | null>;
  restoreViewRequest: MapViewRestoreRequest | null;
  searchViewportBottomPaddingRatio: number;
  searchViewportRequestKey: number;
  selectedCompareIdSet: Set<string>;
  selectedCompareIds: string[];
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  selectedFinalizedFeature: SelectedMapFeature | null;
  selectedResortData: NullableSkiResortDetail | null;
  selectedResortId: string | null;
  shouldRenderMobileListSheet: boolean;
  onCloseCompare: () => void;
  onClearCompare: () => void;
  onCloseDetail: () => void;
  onCloseMobileFilterOverlay: () => void;
  onFilterChange: (filters: Filters) => void;
  onFilterKeyboardInputBlur: () => void;
  onFilterKeyboardInputFocus: () => void;
  onMainPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void;
  onMapViewChange: JapanResortMapProps["onViewChange"];
  onMobileFilterAreaPointerDown: (
    event: ReactPointerEvent<HTMLElement> | ReactTouchEvent<HTMLElement>,
  ) => void;
  onMobileFilterChange: (filters: Filters) => void;
  onMobileKeywordChange: (event: ReactChangeEvent<HTMLInputElement>) => void;
  onMobileKeywordClear: () => void;
  onMobileSearchButtonKeywordClear: () => void;
  onMobileSearchButtonPointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onMobileContentTabChange: (tab: "info" | "map") => void;
  onMobileSearchFilterInputBlur: () => void;
  onMobileSearchFilterInputFocus: () => void;
  onMobileSearchSubmit: (event: ReactFormEvent<HTMLElement>) => void;
  onMobileSearch: () => void;
  onOpenCompare: () => void;
  onOpenMobileFilterOverlay: () => void;
  onSearch: () => void;
  onSelectResort: (id: string) => void;
  onSelectedFinalizedFeatureChange: NonNullable<
    JapanResortMapProps["onSelectedFinalizedFeatureChange"]
  >;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
  onSetFilterEditorOpen: (isOpen: boolean) => void;
  onSetHoveredResortId: (id: string | null) => void;
  onSetListSheetOpen: (isOpen: boolean) => void;
  onSetListSheetSnapPoint: (snapPoint: number | string | null) => void;
  onToggleCompare: (id: string, selected: boolean) => void;
  onUserMapInteraction: JapanResortMapProps["onUserMapInteraction"];
  onUserMapZoomInteraction: JapanResortMapProps["onUserMapZoomInteraction"];
};

export const HomeLayout = ({
  DynamicMap,
  compareResortData,
  filteredResortIdSet,
  filteredResortIds,
  filteredResorts,
  filters,
  hasActiveFilters,
  hasSearched,
  hoveredResortId,
  initialResorts,
  isCompareLoading,
  isCompareOpen,
  isFilterEditorOpen,
  isListSheetOpen,
  isMobileFilterOverlayOpen,
  isPending,
  isSidePanelLayout,
  listSheetContentRef,
  listSheetSnapPoint,
  mapInteractionMode,
  mobileContentTab,
  mobileFilterOverlayRef,
  mobileListSheetSnapPoints,
  mobileDraftFilteredResortCount,
  mobileDraftHasChanges,
  mobileDraftFilters,
  mobileSearchFilterBottomPadding,
  mobileSearchFilterScrollRef,
  mobileSearchPanelInputRef,
  restoreViewRequest,
  searchViewportBottomPaddingRatio,
  searchViewportRequestKey,
  selectedCompareIdSet,
  selectedCompareIds,
  selectedElevationProfilePoint,
  selectedFinalizedFeature,
  selectedResortData,
  selectedResortId,
  shouldRenderMobileListSheet,
  onCloseCompare,
  onClearCompare,
  onCloseDetail,
  onCloseMobileFilterOverlay,
  onFilterChange,
  onFilterKeyboardInputBlur,
  onFilterKeyboardInputFocus,
  onMainPointerDownCapture,
  onMapViewChange,
  onMobileFilterAreaPointerDown,
  onMobileFilterChange,
  onMobileKeywordChange,
  onMobileKeywordClear,
  onMobileSearchButtonKeywordClear,
  onMobileSearchButtonPointerDown,
  onMobileContentTabChange,
  onMobileSearchFilterInputBlur,
  onMobileSearchFilterInputFocus,
  onMobileSearchSubmit,
  onMobileSearch,
  onOpenCompare,
  onOpenMobileFilterOverlay,
  onSearch,
  onSelectResort,
  onSelectedFinalizedFeatureChange,
  onSelectedElevationProfilePointChange,
  onSetFilterEditorOpen,
  onSetHoveredResortId,
  onSetListSheetOpen,
  onSetListSheetSnapPoint,
  onToggleCompare,
  onUserMapInteraction,
  onUserMapZoomInteraction,
}: Props) => {
  const [mapTileVariant, setMapTileVariant] = useState<MapTileVariant>("pale");
  // デスクトップの比較では、左の地図エリアを「ゲレンデ（コースマップ一覧）」と
  // 「アクセス（位置の地図）」で切り替える。既定はゲレンデ
  const [compareLeftPane, setCompareLeftPane] =
    useState<CompareLeftPane>("slope");
  // ゲレンデ一覧の表示設定。比較中のスキー場すべてに同じものを効かせるため、
  // 地図ごとではなくここで持つ
  const [compareCourseColorMode, setCompareCourseColorMode] =
    useState<CourseColorMode>("slope");
  const [compareShowOpenOnly, setCompareShowOpenOnly] = useState(false);
  const [compareSlopeTileVariant, setCompareSlopeTileVariant] =
    useState<MapTileVariant>("photo");
  // 選んだコース・リフトは右の比較パネルに重ねて出すので、
  // カードごとではなく比較全体で 1 つだけ持つ
  const [compareSlopeSelection, setCompareSlopeSelection] =
    useState<CompareSlopeSelection | null>(null);
  // デスクトップの詳細で、左の地図を画面いっぱいに広げているか
  const [isDesktopMapExpanded, setIsDesktopMapExpanded] = useState(false);
  const isDesktopCompare = isSidePanelLayout && isCompareOpen;
  const isDesktopDetailMapExpanded =
    isSidePanelLayout &&
    Boolean(selectedResortId) &&
    !isCompareOpen &&
    isDesktopMapExpanded;

  useEffect(() => {
    if (isCompareOpen) return;
    setCompareLeftPane("slope");
  }, [isCompareOpen]);

  // 地図を切り替えたり比較を閉じたら、選択も外す
  useEffect(() => {
    if (isCompareOpen && compareLeftPane === "slope") return;
    setCompareSlopeSelection(null);
  }, [compareLeftPane, isCompareOpen]);

  // 詳細を閉じたら全画面も畳む。比較を開いたときも同じ
  useEffect(() => {
    if (selectedResortId && !isCompareOpen) return;
    setIsDesktopMapExpanded(false);
  }, [isCompareOpen, selectedResortId]);

  useEffect(() => {
    if (!isDesktopDetailMapExpanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 選択中の Escape はコース選択の解除が先（地図側で処理する）
      if (event.key !== "Escape" || selectedFinalizedFeature) return;
      setIsDesktopMapExpanded(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDesktopDetailMapExpanded, selectedFinalizedFeature]);

  // 比較中のスキー場にコース・リフトが 1 つもなければ、
  // 帯のコース設定（色分け・凡例）は出しても意味がない
  const compareHasCourses = compareResortData.some(
    resort => (resort.finalizedMapData?.courses?.features.length ?? 0) > 0,
  );
  const compareHasLifts = compareResortData.some(
    resort => (resort.finalizedMapData?.lifts?.features.length ?? 0) > 0,
  );
  const liftTicketInput =
    filters.liftTicket ?? DEFAULT_LIFT_TICKET_SEARCH_INPUT;
  // 比較中の地図はデスクトップの背景地図だけ。モバイルは比較タブの中で完結する
  const mapSearchResultResortIds = hasActiveFilters ? filteredResortIds : [];
  const shouldShowMobileSearchScreen =
    !isSidePanelLayout && isMobileFilterOverlayOpen;
  // 未検索状態で比較セットを構築した場合（詳細シート/リストから追加）も
  // 「N 件を比較」ボタンを表示できる必要があり，compareCount > 0 でも表示する。
  // デスクトップ（DesktopSearchPanel）は compareCount > 0 で常時表示するため，
  // モバイルとの挙動を揃える。
  // モバイルの比較は専用画面（比較タブ）で完結させるので、
  // 上部のコンテキストヘッダーも背景地図も出さない
  const isMobileCompare = !isSidePanelLayout && isCompareOpen;
  const shouldShowMobileContextHeader =
    !isSidePanelLayout &&
    !isMobileFilterOverlayOpen &&
    !isCompareOpen &&
    (Boolean(selectedResortId) || hasSearched || selectedCompareIds.length > 0);
  const shouldShowMobileSearchButton =
    !isCompareOpen && !isMobileFilterOverlayOpen && !selectedResortId;
  const shouldShowMobileTopChrome =
    !isSidePanelLayout &&
    !isMobileFilterOverlayOpen &&
    (shouldShowMobileSearchButton || shouldShowMobileContextHeader);
  const shouldRenderMap =
    isSidePanelLayout ||
    (!isMobileCompare &&
      (mobileContentTab === "map" ||
        (!shouldShowMobileTopChrome && !shouldShowMobileSearchScreen)));

  const compareSelectedSlopeResort = compareSlopeSelection
    ? (compareResortData.find(
        resort => resort.id === compareSlopeSelection.resortId,
      ) ?? null)
    : null;
  const compareSlopeFeatureDetail =
    compareSlopeSelection && compareSelectedSlopeResort ? (
      <CompareSlopeFeatureDetail
        resort={compareSelectedSlopeResort}
        selection={compareSlopeSelection}
        onSelectionChange={setCompareSlopeSelection}
      />
    ) : null;

  const availablePrefectureSet = new Set(
    initialResorts.map(resort => resort.prefecture).filter(Boolean),
  );
  const mobileRegionOptions = Object.entries(REGION_PREFECTURES)
    .map(([region, prefectures]) => ({
      region,
      prefectures: prefectures.filter(prefecture =>
        availablePrefectureSet.has(prefecture),
      ),
    }))
    .filter(option => option.prefectures.length > 0);
  const mobileActiveFilterLabels = getActiveFilterLabels(
    filters,
    mobileRegionOptions,
    { includeKeyword: false },
  );

  return (
    <main
      onPointerDownCapture={onMainPointerDownCapture}
      className="fixed inset-0 min-h-0 w-screen overflow-hidden flex flex-col md:flex-row bg-gray-100"
    >
      <div
        className={cn(
          "relative flex h-full w-full flex-col bg-white",
          // 詳細で地図を広げているときは、検索パネルと詳細パネルの上に出す
          isDesktopDetailMapExpanded && "md:fixed md:inset-0 md:z-[400]",
        )}
      >
        {/*
          中身が検索ヘッダだけなので、検索ヘッダを出さないとき（詳細・比較）は
          帯ごと描かない。空の帯でも pb-2 + border-b の分だけ画面上部を食う。
        */}
        {shouldShowMobileTopChrome && shouldShowMobileSearchButton && (
          <div className="fixed top-0 right-0 left-0 z-[150] hide-desktop flex-col gap-2 pb-2 bg-white border-b border-gray-100">
            <MobileSearchHeader
              activeTab={mobileContentTab}
              keyword={filters.keyword}
              onKeywordClear={onMobileSearchButtonKeywordClear}
              onOpenSearch={onOpenMobileFilterOverlay}
              onPointerDown={onMobileSearchButtonPointerDown}
              onTabChange={onMobileContentTabChange}
            />
          </div>
        )}
        {/*
          固定トップバー（検索ヘッダ）はフロー外（position: fixed）のため，
          表示中はフロー内コンテンツをバーの高さだけ下げる。
          4.6875rem = MobileSearchTopBarShell の 4.125rem + ラッパーの pb-2 + border-b。
          無視するとコンテキストヘッダ（件数バッジ・比較ボタン）とリスト先頭が
          バーに隠れる（モバイルの検索結果表示・リストタブで発生していた）。
          変更時は MobileSearchTopBarShell の高さとも同期が必要。
        */}
        <div
          className={cn(
            "flex-1 min-h-0 flex flex-col",
            // isSidePanelLayout（デスクトップ）ではトップバー自体が存在しない
            !isSidePanelLayout &&
              shouldShowMobileSearchButton &&
              "pt-[calc(env(safe-area-inset-top,0px)+4.6875rem)]",
          )}
        >
          {shouldShowMobileContextHeader && (
            <MobileContextHeader
              mode={selectedResortId ? "detail" : "results"}
              resultCount={filteredResorts.length}
              compareCount={selectedCompareIds.length}
              detailTitle={selectedResortData?.nameJa ?? "読み込み中"}
              detailPrefecture={selectedResortData?.prefecture ?? ""}
              detailTown={selectedResortData?.town ?? ""}
              detailResortId={selectedResortId}
              isDetailCompareSelected={
                selectedResortId
                  ? selectedCompareIdSet.has(selectedResortId)
                  : false
              }
              activeFilterLabels={mobileActiveFilterLabels}
              onCloseDetail={onCloseDetail}
              onClearCompare={onClearCompare}
              onOpenCompare={onOpenCompare}
              onToggleCompare={onToggleCompare}
            />
          )}
          <div className="flex-1 min-h-0 relative">
            {/*
              比較の左エリア。上に白い帯（切替と表示設定）を固定し、
              その下だけがスクロールする。ゲレンデ一覧は地図の上に重ねる。
              地図を unmount すると、戻ったときにタイルの読み直しと
              表示位置のリセットが起きるため。
              右端は比較パネルの手前で止める。全幅にするとカードもスクロールバーも
              パネルの下に潜ってしまう。地図エリアは検索パネルのぶんだけ
              既に狭いので、その差だけを詰める。
            */}
            {isDesktopCompare && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 left-0 z-[80] flex flex-col"
                style={{ right: COMPARE_LEFT_PANE_RIGHT }}
              >
                <CompareMapHeaderBar
                  pane={compareLeftPane}
                  onPaneChange={setCompareLeftPane}
                  courseColorMode={compareCourseColorMode}
                  onCourseColorModeChange={setCompareCourseColorMode}
                  showOpenOnly={compareShowOpenOnly}
                  onShowOpenOnlyChange={setCompareShowOpenOnly}
                  mapTileVariant={compareSlopeTileVariant}
                  onMapTileVariantChange={setCompareSlopeTileVariant}
                  hasCourses={compareHasCourses}
                  hasLifts={compareHasLifts}
                />
                {compareLeftPane === "slope" && (
                  <CompareSlopeMapBoard
                    resorts={compareResortData}
                    DynamicMap={DynamicMap}
                    mapResorts={initialResorts}
                    courseColorMode={compareCourseColorMode}
                    onCourseColorModeChange={setCompareCourseColorMode}
                    showOpenOnly={compareShowOpenOnly}
                    onShowOpenOnlyChange={setCompareShowOpenOnly}
                    mapTileVariant={compareSlopeTileVariant}
                    onMapTileVariantChange={setCompareSlopeTileVariant}
                    selection={compareSlopeSelection}
                    onSelectionChange={setCompareSlopeSelection}
                    className="pointer-events-auto min-h-0 flex-1 px-6 pt-6 pb-10"
                  />
                )}
              </div>
            )}
            {isSidePanelLayout &&
              Boolean(selectedResortId) &&
              !isCompareOpen && (
                <Button
                  type="button"
                  aria-label={
                    isDesktopMapExpanded ? "地図を元に戻す" : "地図を拡大"
                  }
                  onClick={() => setIsDesktopMapExpanded(current => !current)}
                  className="absolute top-3 left-3 z-[90] h-10 w-10 min-w-10 rounded-md border border-gray-200 bg-white p-0 text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10"
                >
                  {isDesktopMapExpanded ? (
                    <Minimize2 size={17} strokeWidth={2.5} />
                  ) : (
                    <Maximize2 size={17} strokeWidth={2.5} />
                  )}
                </Button>
              )}
            {shouldRenderMap && (
              <DynamicMap
                resorts={initialResorts}
                filteredResortIdSet={filteredResortIdSet}
                isFilterActive={hasActiveFilters}
                // 条件なしで検索結果を閉じる時に、全スキー場へ fit して地図位置が動くのを防ぐ。
                searchResultResortIds={mapSearchResultResortIds}
                searchViewportRequestKey={searchViewportRequestKey}
                searchViewportBottomPaddingRatio={
                  searchViewportBottomPaddingRatio
                }
                selectedResortId={selectedResortId}
                hoveredResortId={hoveredResortId}
                onSelectResort={onSelectResort}
                interactionMode={mapInteractionMode}
                selectedCompareIdSet={selectedCompareIdSet}
                onToggleCompare={onToggleCompare}
                onBoundsChange={() => undefined}
                onViewChange={onMapViewChange}
                onUserMapInteraction={onUserMapInteraction}
                onUserMapZoomInteraction={onUserMapZoomInteraction}
                restoreViewRequest={restoreViewRequest}
                finalizedMapData={selectedResortData?.finalizedMapData ?? null}
                mapTileVariant={mapTileVariant}
                onMapTileVariantChange={setMapTileVariant}
                selectedFinalizedFeature={selectedFinalizedFeature}
                onSelectedFinalizedFeatureChange={
                  onSelectedFinalizedFeatureChange
                }
                selectedElevationProfilePoint={selectedElevationProfilePoint}
                onSelectedElevationProfilePointChange={
                  onSelectedElevationProfilePointChange
                }
              />
            )}
            {!shouldRenderMap &&
              !selectedResortId &&
              shouldRenderMobileListSheet && (
                <MobileResultsSheet
                  DynamicMap={DynamicMap}
                  mapResorts={initialResorts}
                  compareResorts={compareResortData}
                  filteredResorts={filteredResorts}
                  isCompareLoading={isCompareLoading}
                  isCompareOpen={isCompareOpen}
                  isListSheetOpen={isListSheetOpen}
                  listSheetContentRef={listSheetContentRef}
                  listSheetSnapPoint={listSheetSnapPoint}
                  snapPoints={mobileListSheetSnapPoints}
                  selectedCompareIdSet={selectedCompareIdSet}
                  liftTicketInput={liftTicketInput}
                  onCloseCompare={onCloseCompare}
                  onHoverResortChange={onSetHoveredResortId}
                  onOpenChange={open => {
                    onSetListSheetOpen(open && mobileContentTab === "info");
                    if (!open && isCompareOpen) {
                      onCloseCompare();
                    }
                  }}
                  onSelectResort={onSelectResort}
                  onSetSnapPoint={onSetListSheetSnapPoint}
                  onToggleCompare={onToggleCompare}
                />
              )}
            {!shouldRenderMap && selectedResortId && (
              <SkiResortDetailView
                DynamicMap={DynamicMap}
                mapResorts={initialResorts}
                resortData={selectedResortData}
                isLoading={isPending}
                isCompareSelected={selectedCompareIdSet.has(selectedResortId)}
                onToggleCompare={onToggleCompare}
                selectedFinalizedFeature={selectedFinalizedFeature}
                selectedElevationProfilePoint={selectedElevationProfilePoint}
                onSelectedFinalizedFeatureChange={
                  onSelectedFinalizedFeatureChange
                }
                onSelectedElevationProfilePointChange={
                  onSelectedElevationProfilePointChange
                }
                onClose={onCloseDetail}
                mobileContentTab="info"
                mobilePresentation="inline"
                hideMobileInfoSection
              />
            )}
            {shouldShowMobileSearchScreen && (
              <div className="absolute inset-0 z-[200] md:hidden">
                <MobileSearchOverlay
                  filters={mobileDraftFilters}
                  resorts={initialResorts}
                  filteredResortCount={mobileDraftFilteredResortCount}
                  isOpen={isMobileFilterOverlayOpen}
                  isSidePanelLayout={isSidePanelLayout}
                  overlayRef={mobileFilterOverlayRef}
                  inputRef={mobileSearchPanelInputRef}
                  scrollRef={mobileSearchFilterScrollRef}
                  filterBottomPadding={mobileSearchFilterBottomPadding}
                  hasChanges={mobileDraftHasChanges}
                  onClose={onCloseMobileFilterOverlay}
                  onFilterAreaPointerDown={onMobileFilterAreaPointerDown}
                  onFilterChange={onMobileFilterChange}
                  onInputBlur={onMobileSearchFilterInputBlur}
                  onInputFocus={onMobileSearchFilterInputFocus}
                  onKeywordChange={onMobileKeywordChange}
                  onKeywordClear={onMobileKeywordClear}
                  onSearch={onMobileSearch}
                  onSubmit={onMobileSearchSubmit}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <DesktopSearchPanel
        filters={filters}
        resorts={initialResorts}
        filteredResorts={filteredResorts}
        compareCount={selectedCompareIds.length}
        hasSearched={hasSearched}
        isCompareOpen={isCompareOpen}
        isFilterEditorOpen={isFilterEditorOpen}
        selectedCompareIdSet={selectedCompareIdSet}
        onExpandedChange={onSetFilterEditorOpen}
        onFilterChange={onFilterChange}
        onKeyboardInputBlur={onFilterKeyboardInputBlur}
        onKeyboardInputFocus={onFilterKeyboardInputFocus}
        onClearCompare={onClearCompare}
        onOpenCompare={onOpenCompare}
        onSearch={onSearch}
        onSelectResort={onSelectResort}
        onToggleCompare={onToggleCompare}
        onHoverResortChange={onSetHoveredResortId}
      />

      <AnimatedPanel
        visible={Boolean(
          selectedResortId && (isSidePanelLayout || shouldRenderMap),
        )}
        rootClassName={cn(
          "fixed inset-0 md:flex pointer-events-none",
          // 全画面地図のときは、その上に選択中のコースを重ねる
          isDesktopDetailMapExpanded ? "z-[420]" : "z-[60]",
        )}
      >
        {selectedResortId && (isSidePanelLayout || shouldRenderMap) && (
          <SkiResortDetailView
            DynamicMap={DynamicMap}
            mapResorts={initialResorts}
            resortData={selectedResortData}
            isLoading={isPending}
            isCompareSelected={selectedCompareIdSet.has(selectedResortId)}
            onToggleCompare={onToggleCompare}
            selectedFinalizedFeature={selectedFinalizedFeature}
            selectedElevationProfilePoint={selectedElevationProfilePoint}
            onSelectedFinalizedFeatureChange={onSelectedFinalizedFeatureChange}
            onSelectedElevationProfilePointChange={
              onSelectedElevationProfilePointChange
            }
            onClose={onCloseDetail}
            mobileContentTab="info"
            hideMobileInfoSection
            isDesktopMapExpanded={isDesktopDetailMapExpanded}
          />
        )}
      </AnimatedPanel>

      {isCompareOpen && isSidePanelLayout && (
        <SkiResortCompareView
          resorts={compareResortData}
          isLoading={isCompareLoading}
          initialLiftTicketInput={liftTicketInput}
          onClose={onCloseCompare}
          DynamicMap={DynamicMap}
          mapResorts={initialResorts}
          onSelectResort={onSelectResort}
          showSlopeTab={false}
          showAccessTab={false}
          featureDetailOverlay={compareSlopeFeatureDetail}
        />
      )}
    </main>
  );
};

type MobileSearchHeaderProps = {
  activeTab: "info" | "map";
  keyword: string;
  onKeywordClear: () => void;
  onOpenSearch: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onTabChange: (tab: "info" | "map") => void;
};

const MobileSearchHeader = ({
  activeTab,
  keyword,
  onKeywordClear,
  onOpenSearch,
  onPointerDown,
  onTabChange,
}: MobileSearchHeaderProps) => (
  <MobileSearchTopBarShell
    action={
      // §13: 塗りつぶしセグメントタブはウェイト font-semibold（比較タブと同一）
      <SegmentedControl
        options={MOBILE_CONTENT_TAB_OPTIONS}
        value={activeTab}
        onChange={onTabChange}
        radius="full"
        className="h-10 shadow-sm"
        itemClassName="h-full flex-1 px-4"
        ariaLabel={option => `${option.label}を表示`}
      />
    }
  >
    <MobileSearchButton
      keyword={keyword}
      onKeywordClear={onKeywordClear}
      onOpen={onOpenSearch}
      onPointerDown={onPointerDown}
    />
  </MobileSearchTopBarShell>
);

type MobileContextHeaderProps = {
  mode: "results" | "detail";
  resultCount: number;
  compareCount: number;
  detailTitle: string;
  detailPrefecture: string;
  detailTown: string;
  detailResortId: string | null;
  isDetailCompareSelected: boolean;
  activeFilterLabels: string[];
  onCloseDetail: () => void;
  onClearCompare: () => void;
  onOpenCompare: () => void;
  onToggleCompare: (id: string, selected: boolean) => void;
};

const MobileContextHeader = ({
  mode,
  resultCount,
  compareCount,
  detailTitle,
  detailPrefecture,
  detailTown,
  detailResortId,
  isDetailCompareSelected,
  activeFilterLabels,
  onCloseDetail,
  onClearCompare,
  onOpenCompare,
  onToggleCompare,
}: MobileContextHeaderProps) => {
  const isResults = mode === "results";
  const filterLabels = activeFilterLabels;

  return (
    <div className="relative z-10 pointer-events-auto md:hidden">
      {isResults && (
        <div className="px-4 pt-0 pb-2">
          <div className="flex gap-4 flex-wrap items-center">
            {filterLabels.map(label => (
              <Badge
                key={label}
                variant="secondary"
                className="min-h-[28px] rounded-lg text-sm font-semibold"
              >
                {label}
              </Badge>
            ))}
            <Badge
              variant="secondary"
              className="min-h-[28px] rounded-lg bg-blue-50 text-blue-900 text-sm font-medium"
            >
              {resultCount.toLocaleString()}件
            </Badge>
          </div>
        </div>
      )}

      {/*
        スキー場名と所在地の 2 行。左右が揃うよう、各行を
        「左: テキスト（伸びる） / 右: 操作（固定幅）」の 2 カラムで組む。
        地図をすぐ始めたいので、行間・上下の余白は最小限にする。
      */}
      {mode === "detail" && (
        <div className="px-4 pt-1.5 pb-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex-1 min-w-0 text-gray-900 text-base font-bold leading-tight truncate font-[var(--font-heading)]">
              {detailTitle}
            </h2>
            <Button
              type="button"
              aria-label="詳細を閉じる"
              variant="ghost"
              onClick={onCloseDetail}
              className="flex h-9 w-9 min-w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 p-0 text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            >
              <X size={18} strokeWidth={2.5} />
            </Button>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="flex-1 min-w-0 truncate text-gray-600 text-xs font-semibold leading-snug">
              {detailPrefecture} · {detailTown}
            </p>
            {detailResortId && (
              <Button
                type="button"
                variant={isDetailCompareSelected ? "default" : "outline"}
                onClick={() =>
                  onToggleCompare(detailResortId, !isDetailCompareSelected)
                }
                className="flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 text-xs font-semibold"
              >
                {isDetailCompareSelected ? (
                  <Check size={14} strokeWidth={2.5} />
                ) : (
                  <Plus size={14} strokeWidth={2.5} />
                )}
                {isDetailCompareSelected ? "比較から外す" : "比較に追加"}
              </Button>
            )}
          </div>
        </div>
      )}

      {isResults && compareCount > 0 && (
        <div className="flex px-4 pb-3 gap-2 items-center border-b border-gray-100">
          <Button
            variant="default"
            className="flex-1 min-w-0 h-10 rounded-lg font-semibold shadow-sm"
            onClick={onOpenCompare}
          >
            {compareCount} 件を比較
          </Button>
          <Button
            variant="outline"
            className="flex-1 min-w-0 h-10 rounded-lg border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 hover:text-gray-900"
            onClick={onClearCompare}
          >
            比較をクリア
          </Button>
        </div>
      )}
    </div>
  );
};
