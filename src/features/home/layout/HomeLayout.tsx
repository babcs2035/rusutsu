"use client";

import { Maximize2, Minimize2, X } from "lucide-react";
import type {
  ComponentType,
  CSSProperties,
  ChangeEvent as ReactChangeEvent,
  FormEvent as ReactFormEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  RefObject,
} from "react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { COMPOSE_STATE_EVENT } from "@/features/community/composerEvents";
import { CORRECTION_STATE_EVENT } from "@/features/corrections/correctionEvents";
import { FavoriteButton } from "@/features/favorites/FavoriteButton";
import type { Filters } from "@/features/filters/types";
import { DEFAULT_LIFT_TICKET_SEARCH_INPUT } from "@/features/lift-ticket/utils/calculateLiftTicket";
import { waitForDetailSaved } from "@/features/map/session/prepareDetail";
import { useScreenState } from "@/features/map/session/useScreenState";
import type {
  ElevationProfileMapPoint,
  JapanResortMapProps,
  SelectedMapFeature,
} from "@/features/map/types";
import {
  ResortFeatureChips,
  type ResortFeatureData,
  resortFeatureDataOf,
} from "@/features/resort-detail/components/ResortFeatureChips";
import {
  SimultaneousToggle,
  useDisplayedResortMapData,
} from "@/features/resort-detail/components/SimultaneousToggle";
import { SkiResortDetailView } from "@/features/resort-detail/SkiResortDetailView";
import { cn } from "@/lib/utils";
import { AnimatedPanel } from "@/shared/components/AnimatedPanel";
import { CompareResortButton } from "@/shared/components/CompareResortButton";
import { CopyResortNameButton } from "@/shared/components/CopyResortNameButton";
import { FormerResortNames } from "@/shared/components/FormerResortNames";
import { RubyText } from "@/shared/components/RubyText";
import { SegmentedControl } from "@/shared/components/SegmentedControl";
import type {
  ResortFormerName,
  ResortRubySegment,
} from "@/shared/types/resortReading";
import type {
  MapSkiResort,
  NullableSkiResortDetail,
  SkiResortDetail,
} from "@/types/skiResorts";
import {
  ComparisonActions,
  useHasComparisonActions,
} from "../components/ComparisonActions";
import { DesktopSearchPanel } from "../components/DesktopSearchPanel";
import { MobileResultsSheet } from "../components/MobileResultsSheet";
import { MobileSearchOverlay } from "../components/MobileSearchOverlay";
import {
  MOBILE_SEARCH_TOP_BAR_HEIGHT,
  MobileSearchTopBarShell,
} from "../components/MobileSearchTopBarShell";
import { SearchButton } from "../components/SearchButton";
import { SkiResortCompareView } from "../components/SkiResortCompareView";
import { useResortSort } from "../hooks/useResortSort";
import type { MapViewRestoreRequest } from "../types";

const MOBILE_CONTENT_TAB_OPTIONS = [
  { value: "map", label: "地図" },
  { value: "info", label: "リスト" },
] as const satisfies readonly { value: "info" | "map"; label: string }[];

const expandedSchema = z.boolean();

type Props = {
  DynamicMap: ComponentType<JapanResortMapProps>;
  compareResortData: SkiResortDetail[];
  filteredResortIdSet: Set<string>;
  filteredResortIds: string[];
  filteredResorts: MapSkiResort[];
  filters: Filters;
  hasActiveFilters: boolean;
  hoveredResortId: string | null;
  initialResorts: MapSkiResort[];
  isCompareLoading: boolean;
  isCompareOpen: boolean;
  /** 比較のゲレンデで見えているスキー場。地図データを先に取る */
  onCompareMapResortsNeeded: (ids: string[]) => void;
  isFilterEditorOpen: boolean;
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
  /** 詳細の取得待ちでも名前と所在地を出すための一覧側データ */
  selectedResortSummary: MapSkiResort | null;
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
  onCompareFavorites: () => void;
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
  hoveredResortId,
  initialResorts,
  isCompareLoading,
  isCompareOpen,
  onCompareMapResortsNeeded,
  isFilterEditorOpen,
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
  selectedResortSummary,
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
  onCompareFavorites,
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
  // 「〇〇も同時に表示」中は、組のスキー場をまとめた地図を出す
  const selectedMapData = useDisplayedResortMapData(selectedResortData ?? null);
  const [composingResortId, setComposingResortId] = useState<string | null>(
    null,
  );
  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (
        event as CustomEvent<{ resortId: string; active: boolean }>
      ).detail;
      if (!detail) return;
      setComposingResortId(current =>
        detail.active
          ? detail.resortId
          : current === detail.resortId
            ? null
            : current,
      );
    };
    // 現地レポートの投稿中と情報の修正中は、どちらも詳細パネルを入力画面に切り替える
    window.addEventListener(COMPOSE_STATE_EVENT, handle);
    window.addEventListener(CORRECTION_STATE_EVENT, handle);
    return () => {
      window.removeEventListener(COMPOSE_STATE_EVENT, handle);
      window.removeEventListener(CORRECTION_STATE_EVENT, handle);
    };
  }, []);
  // デスクトップの詳細で、左の地図を画面いっぱいに広げているか
  const [isDesktopMapExpanded, setIsDesktopMapExpanded] = useScreenState(
    `rusutsu:panel:v1:${selectedResortId}:desktopExpanded`,
    expandedSchema,
    false,
  );
  const isDesktopDetailMapExpanded =
    isSidePanelLayout &&
    Boolean(selectedResortId) &&
    !isCompareOpen &&
    isDesktopMapExpanded;

  // 詳細を閉じたら全画面も畳む。比較を開いたときも同じ
  useEffect(() => {
    if (selectedResortId && !isCompareOpen) return;
    setIsDesktopMapExpanded(false);
  }, [isCompareOpen, selectedResortId, setIsDesktopMapExpanded]);

  useEffect(() => {
    if (!isDesktopDetailMapExpanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 選択中の Escape はコース選択の解除が先（地図側で処理する）
      if (event.key !== "Escape" || selectedFinalizedFeature) return;
      setIsDesktopMapExpanded(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    isDesktopDetailMapExpanded,
    selectedFinalizedFeature,
    setIsDesktopMapExpanded,
  ]);

  const liftTicketInput =
    filters.liftTicket ?? DEFAULT_LIFT_TICKET_SEARCH_INPUT;
  // 比較中の地図はデスクトップの背景地図だけ。モバイルは比較タブの中で完結する
  const mapSearchResultResortIds = hasActiveFilters ? filteredResortIds : [];
  const shouldShowMobileSearchScreen =
    !isSidePanelLayout && isMobileFilterOverlayOpen;
  // モバイルの比較は専用画面（比較タブ）で完結させるので、
  // 上部のコンテキストヘッダーも背景地図も出さない
  const isMobileCompare = !isSidePanelLayout && isCompareOpen;
  const shouldShowMobileContextHeader =
    !isSidePanelLayout &&
    !isMobileFilterOverlayOpen &&
    !isCompareOpen &&
    selectedResortId !== composingResortId &&
    Boolean(selectedResortId);
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
        (!selectedResortId &&
          !shouldShowMobileTopChrome &&
          !shouldShowMobileSearchScreen)));
  const mapProps: JapanResortMapProps = {
    resorts: initialResorts,
    filteredResortIdSet,
    isFilterActive: hasActiveFilters,
    // 条件なしで検索結果を閉じる時に、全スキー場へ fit して地図位置が動くのを防ぐ。
    searchResultResortIds: mapSearchResultResortIds,
    searchViewportRequestKey,
    searchViewportBottomPaddingRatio,
    selectedResortId,
    hoveredResortId,
    onSelectResort,
    interactionMode: mapInteractionMode,
    selectedCompareIdSet,
    onToggleCompare,
    onBoundsChange: () => undefined,
    onViewChange: onMapViewChange,
    onUserMapInteraction,
    onUserMapZoomInteraction,
    restoreViewRequest,
    finalizedMapData: selectedMapData,
    linkedAreaControl: selectedResortData ? (
      <SimultaneousToggle
        resort={selectedResortData}
        onSelectResort={onSelectResort}
        size="inline"
      />
    ) : undefined,
    selectedFinalizedFeature,
    onSelectedFinalizedFeatureChange,
    selectedElevationProfilePoint,
    onSelectedElevationProfilePointChange,
  };
  // 隠している間は最後に表示した状態のまま止め、裏で地図を動かさない。
  // 一度も表示していない（URL から詳細を開いた）ときは全国の表示で作る。
  const visibleMapPropsRef = useRef<JapanResortMapProps | null>(null);
  if (shouldRenderMap) visibleMapPropsRef.current = mapProps;
  const mainMapProps: JapanResortMapProps = shouldRenderMap
    ? mapProps
    : (visibleMapPropsRef.current ?? {
        ...mapProps,
        selectedResortId: null,
        hoveredResortId: null,
        interactionMode: "default",
        finalizedMapData: null,
        linkedAreaControl: undefined,
        selectedFinalizedFeature: null,
        selectedElevationProfilePoint: null,
      });
  const [hasMainMap, setHasMainMap] = useState(shouldRenderMap);
  const renderMainMap = shouldRenderMap || hasMainMap;
  useEffect(() => {
    if (shouldRenderMap) setHasMainMap(true);
  }, [shouldRenderMap]);
  // URL から詳細を開いたときは、詳細の取得と圏外用の保存が終わってから
  // 全国地図を裏で作る。電波が弱いときに詳細の通信と取り合わないようにする。
  const isDetailReady =
    Boolean(selectedResortId) &&
    selectedResortData?.id === selectedResortId &&
    !isPending;
  useEffect(() => {
    if (hasMainMap || !isDetailReady || !selectedResortId) return;
    let disposed = false;
    let idle: number | undefined;
    void waitForDetailSaved(selectedResortId).then(() => {
      if (disposed) return;
      const create = () => {
        if (!disposed) setHasMainMap(true);
      };
      idle =
        typeof window.requestIdleCallback === "function"
          ? window.requestIdleCallback(create, { timeout: 3000 })
          : window.setTimeout(create, 500);
    });
    return () => {
      disposed = true;
      if (idle === undefined) return;
      if (typeof window.cancelIdleCallback === "function")
        window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, [hasMainMap, isDetailReady, selectedResortId]);
  const { sortedResorts, controls: sortControls } =
    useResortSort(filteredResorts);
  const shouldShowMobileComparisonActions = useHasComparisonActions(
    selectedCompareIds.length,
  );
  const mobileSearchChromeHeight = shouldShowMobileComparisonActions
    ? `calc(${MOBILE_SEARCH_TOP_BAR_HEIGHT} + 2.25rem)`
    : MOBILE_SEARCH_TOP_BAR_HEIGHT;

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
          検索画面では検索欄と比較チップを地図に重ねる。
          詳細・比較画面ではこの検索用の操作を出さない。
        */}
        {shouldShowMobileTopChrome && shouldShowMobileSearchButton && (
          <div
            data-map-top-controls="true"
            className="pointer-events-none fixed top-0 right-0 left-0 z-[150] hide-desktop flex-col"
          >
            <MobileSearchHeader
              activeTab={mobileContentTab}
              keyword={filters.keyword}
              onKeywordClear={onMobileSearchButtonKeywordClear}
              onOpenSearch={onOpenMobileFilterOverlay}
              onPointerDown={onMobileSearchButtonPointerDown}
              onTabChange={onMobileContentTabChange}
            />
            <ComparisonActions
              compareCount={selectedCompareIds.length}
              onOpenCompare={onOpenCompare}
              onClearCompare={onClearCompare}
              onCompareFavorites={onCompareFavorites}
            />
          </div>
        )}
        {/*
          地図は検索欄の背後まで描画する。リストだけは検索欄と比較チップの
          高さを空け、先頭のスキー場が固定操作に隠れないようにする。
        */}
        <div
          className="flex-1 min-h-0 flex flex-col"
          style={
            !isSidePanelLayout &&
            shouldShowMobileSearchButton &&
            !shouldRenderMap
              ? { paddingTop: mobileSearchChromeHeight }
              : undefined
          }
        >
          {shouldShowMobileContextHeader && (
            <MobileContextHeader
              detailTitle={
                selectedResortData?.nameJa ??
                selectedResortSummary?.nameJa ??
                "読み込み中"
              }
              detailNameRuby={
                selectedResortData?.nameRuby ??
                selectedResortSummary?.nameRuby ??
                null
              }
              detailFormerNames={
                selectedResortData?.formerNames ??
                selectedResortSummary?.formerNames ??
                []
              }
              detailPrefecture={
                selectedResortData?.prefecture ??
                selectedResortSummary?.prefecture ??
                ""
              }
              detailTown={
                selectedResortData?.town ?? selectedResortSummary?.town ?? ""
              }
              detailYukiMagi={Boolean(
                selectedResortData?.yukiMagi ??
                  selectedResortSummary?.yukiMagiId,
              )}
              detailHasEvCharger={Boolean(
                selectedResortData?.evChargers?.length ??
                  selectedResortSummary?.evChargerSummary,
              )}
              detailFeatures={
                selectedResortData
                  ? resortFeatureDataOf(selectedResortData)
                  : null
              }
              detailResortId={selectedResortId}
              isDetailCompareSelected={
                selectedResortId
                  ? selectedCompareIdSet.has(selectedResortId)
                  : false
              }
              onCloseDetail={onCloseDetail}
              onToggleCompare={onToggleCompare}
            />
          )}
          <div
            className="flex-1 min-h-0 relative"
            style={
              !isSidePanelLayout && shouldShowMobileSearchButton
                ? ({
                    "--mobile-map-top-offset": mobileSearchChromeHeight,
                  } as CSSProperties)
                : undefined
            }
          >
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
            {renderMainMap && (
              // スマホで詳細・比較・検索を開いている間も地図は破棄せず隠す。
              // 閉じたときに地図を作り直さず、前の画面をすぐ出すため。
              <div
                className={
                  shouldRenderMap
                    ? "absolute inset-0"
                    : "invisible pointer-events-none absolute inset-0"
                }
                aria-hidden={!shouldRenderMap}
                inert={!shouldRenderMap}
              >
                <DynamicMap {...mainMapProps} />
              </div>
            )}
            {!shouldRenderMap &&
              !selectedResortId &&
              shouldRenderMobileListSheet && (
                <MobileResultsSheet
                  DynamicMap={DynamicMap}
                  mapResorts={initialResorts}
                  compareResorts={compareResortData}
                  filteredResorts={sortedResorts}
                  sortControls={sortControls}
                  isCompareLoading={isCompareLoading}
                  isCompareOpen={isCompareOpen}
                  onCompareMapResortsNeeded={onCompareMapResortsNeeded}
                  listSheetContentRef={listSheetContentRef}
                  listSheetSnapPoint={listSheetSnapPoint}
                  snapPoints={mobileListSheetSnapPoints}
                  selectedCompareIdSet={selectedCompareIdSet}
                  liftTicketInput={liftTicketInput}
                  featureLines={{
                    yukiMagi: filters.yukiMagi,
                    evCharger: filters.evCharger,
                  }}
                  onCloseCompare={onCloseCompare}
                  onEditLiftTicketConditions={() => {
                    onOpenMobileFilterOverlay();
                    window.setTimeout(() => {
                      const calculator = document.getElementById(
                        "lift-ticket-calculator",
                      );
                      calculator?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                      calculator?.focus({ preventScroll: true });
                    }, 180);
                  }}
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
                resortSummary={selectedResortSummary}
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
                onSelectResort={onSelectResort}
                mobileContentTab="info"
                mobilePresentation="inline"
                hideMobileInfoSection
                liftTicketInput={filters.liftTicket ?? undefined}
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
        showAccount={!selectedResortId && !isCompareOpen}
        filters={filters}
        resorts={initialResorts}
        filteredResorts={sortedResorts}
        sortControls={sortControls}
        compareCount={selectedCompareIds.length}
        isCompareOpen={isCompareOpen}
        isFilterEditorOpen={isFilterEditorOpen}
        selectedCompareIdSet={selectedCompareIdSet}
        onExpandedChange={onSetFilterEditorOpen}
        onFilterChange={onFilterChange}
        onKeywordClear={onMobileSearchButtonKeywordClear}
        onKeyboardInputBlur={onFilterKeyboardInputBlur}
        onKeyboardInputFocus={onFilterKeyboardInputFocus}
        onClearCompare={onClearCompare}
        onOpenCompare={onOpenCompare}
        onCompareFavorites={onCompareFavorites}
        onSearch={onSearch}
        onSelectResort={onSelectResort}
        onToggleCompare={onToggleCompare}
        onHoverResortChange={onSetHoveredResortId}
        // スマホではこの一覧は隠れている。詳細を開いている間も裏に隠れる
        liftTicketPaused={Boolean(selectedResortId) || !isSidePanelLayout}
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
            resortSummary={selectedResortSummary}
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
            onSelectResort={onSelectResort}
            mobileContentTab="info"
            hideMobileInfoSection
            isDesktopMapExpanded={isDesktopDetailMapExpanded}
            liftTicketInput={filters.liftTicket ?? undefined}
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
          onMapResortsNeeded={onCompareMapResortsNeeded}
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
    floating
    showAccount
    action={
      // §13: 塗りつぶしセグメントタブはウェイト font-semibold（比較タブと同一）
      <SegmentedControl
        options={MOBILE_CONTENT_TAB_OPTIONS}
        value={activeTab}
        onChange={onTabChange}
        radius="full"
        className="h-10 shadow-sm"
        itemClassName="h-full flex-1 px-2"
        ariaLabel={option => `${option.label}を表示`}
      />
    }
  >
    <SearchButton
      keyword={keyword}
      onKeywordClear={onKeywordClear}
      onOpen={onOpenSearch}
      onPointerDown={onPointerDown}
    />
  </MobileSearchTopBarShell>
);

type MobileContextHeaderProps = {
  detailTitle: string;
  detailNameRuby: ResortRubySegment[] | null;
  detailFormerNames: ResortFormerName[];
  detailPrefecture: string;
  detailTown: string;
  detailYukiMagi: boolean;
  detailHasEvCharger: boolean;
  /** 詳細の読み込み前は null（雪マジ・EV充電のチップは押せない） */
  detailFeatures: ResortFeatureData | null;
  detailResortId: string | null;
  isDetailCompareSelected: boolean;
  onCloseDetail: () => void;
  onToggleCompare: (id: string, selected: boolean) => void;
};

const MobileContextHeader = ({
  detailTitle,
  detailNameRuby,
  detailFormerNames,
  detailPrefecture,
  detailTown,
  detailYukiMagi,
  detailHasEvCharger,
  detailFeatures,
  detailResortId,
  isDetailCompareSelected,
  onCloseDetail,
  onToggleCompare,
}: MobileContextHeaderProps) => {
  const detailLocation = [detailPrefecture, detailTown]
    .filter(Boolean)
    .join("・");

  return (
    <div className="relative z-10 pointer-events-auto md:hidden">
      {/*
        名前・所在地の右に、お気に入り・比較・閉じるを1行で並べる。
        ボタンを縦に積むとヘッダーが2段分の高さになり、地図が下に押し出される。
        比較ボタンは文言を短くし、正式な操作名は aria-label に持たせる。
      */}
      <div className="flex items-center gap-1.5 px-3 pt-1 pb-1.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate-2 text-gray-900 text-base leading-tight font-bold font-[var(--font-heading)]">
            <RubyText segments={detailNameRuby} fallback={detailTitle} />
            {/* 名前のすぐ後ろに置く。行ボックスを広げないよう行送りより小さくする */}
            <CopyResortNameButton
              name={detailTitle}
              className="ml-1 size-5 align-middle"
            />
          </h2>
          {detailFormerNames.length > 0 && (
            <p className="truncate text-[11px] leading-snug text-gray-500">
              旧称: <FormerResortNames names={detailFormerNames} />
            </p>
          )}
          <p className="flex items-center gap-1.5 text-gray-600 text-xs font-semibold leading-snug">
            {/* 県・市町村のどちらかが未取得のときに区切り文字だけが残らないようにする */}
            {detailLocation && (
              <span className="truncate">{detailLocation}</span>
            )}
            <ResortFeatureChips
              hasYukiMagi={detailYukiMagi}
              hasEvCharger={detailHasEvCharger}
              data={detailFeatures}
              size="sm"
            />
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {detailResortId && (
            <FavoriteButton resortId={detailResortId} name={detailTitle} />
          )}
          {detailResortId && (
            <CompareResortButton
              isSelected={isDetailCompareSelected}
              resortName={detailTitle}
              onClick={() =>
                onToggleCompare(detailResortId, !isDetailCompareSelected)
              }
              className="flex h-8 shrink-0 items-center justify-center gap-0.5 rounded-full px-2 text-xs font-semibold"
            />
          )}
          <Button
            type="button"
            aria-label="詳細を閉じる"
            variant="ghost"
            onClick={onCloseDetail}
            className="flex h-8 w-8 min-w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 p-0 text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          >
            <X size={18} strokeWidth={2.5} />
          </Button>
        </div>
      </div>
    </div>
  );
};
