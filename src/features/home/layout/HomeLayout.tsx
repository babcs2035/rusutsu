"use client";

import { Check, Plus, X } from "lucide-react";
import type {
  ComponentType,
  ChangeEvent as ReactChangeEvent,
  FormEvent as ReactFormEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  RefObject,
} from "react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { REGION_PREFECTURES } from "@/features/filters/constants";
import type { Filters } from "@/features/filters/types";
import { getActiveFilterLabels } from "@/features/filters/utils/filterLabels";
import { DEFAULT_LIFT_TICKET_SEARCH_INPUT } from "@/features/lift-ticket/utils/calculateLiftTicket";
import type {
  ElevationProfileMapPoint,
  JapanResortMapProps,
  MapTileVariant,
  SelectedMapFeature,
} from "@/features/map/types";
import { SkiResortDetailView } from "@/features/resort-detail/SkiResortDetailView";
import { cn } from "@/lib/utils";
import { AnimatedPanel } from "@/shared/components/AnimatedPanel";
import type {
  MapSkiResort,
  NullableSkiResortDetail,
  SkiResortDetail,
} from "@/types/skiResorts";
import { DesktopSearchPanel } from "../components/DesktopSearchPanel";
import { MobileResultsSheet } from "../components/MobileResultsSheet";
import { MobileSearchButton } from "../components/MobileSearchButton";
import { MobileSearchOverlay } from "../components/MobileSearchOverlay";
import { MobileSearchTopBarShell } from "../components/MobileSearchTopBarShell";
import { SkiResortCompareView } from "../components/SkiResortCompareView";
import type { MapViewRestoreRequest } from "../types";

const MAP_TILE_OPTIONS: Array<{ label: string; value: MapTileVariant }> = [
  { label: "地図", value: "pale" },
  { label: "衛星", value: "photo" },
];

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
  const liftTicketInput =
    filters.liftTicket ?? DEFAULT_LIFT_TICKET_SEARCH_INPUT;
  const isMobileCompareMapFocus = !isSidePanelLayout && isCompareOpen;
  const mapFilteredResortIdSet = isMobileCompareMapFocus
    ? selectedCompareIdSet
    : filteredResortIdSet;
  const mapSearchResultResortIds = isMobileCompareMapFocus
    ? selectedCompareIds
    : hasActiveFilters
      ? filteredResortIds
      : [];
  const shouldShowMobileSearchScreen =
    !isSidePanelLayout && isMobileFilterOverlayOpen;
  // 未検索状態で比較セットを構築した場合（詳細シート/リストから追加）も
  // 「N 件を比較」ボタンを表示できる必要があり，compareCount > 0 でも表示する。
  // デスクトップ（DesktopSearchPanel）は compareCount > 0 で常時表示するため，
  // モバイルとの挙動を揃える。
  const shouldShowMobileContextHeader =
    !isSidePanelLayout &&
    !isMobileFilterOverlayOpen &&
    (isCompareOpen ||
      Boolean(selectedResortId) ||
      hasSearched ||
      selectedCompareIds.length > 0);
  const shouldShowMobileSearchButton =
    !isCompareOpen && !isMobileFilterOverlayOpen && !selectedResortId;
  const shouldShowMobileTopChrome =
    !isSidePanelLayout &&
    !isMobileFilterOverlayOpen &&
    (shouldShowMobileSearchButton || shouldShowMobileContextHeader);
  const shouldRenderMap =
    isSidePanelLayout ||
    mobileContentTab === "map" ||
    (!shouldShowMobileTopChrome && !shouldShowMobileSearchScreen);

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
      <div className="h-full w-full relative flex flex-col bg-white">
        {shouldShowMobileTopChrome && (
          <div className="fixed top-0 right-0 left-0 z-[150] hide-desktop flex-col gap-2 px-4 pb-2 bg-white border-b border-gray-100">
            {shouldShowMobileSearchButton && (
              <MobileSearchHeader
                activeTab={mobileContentTab}
                keyword={filters.keyword}
                onKeywordClear={onMobileSearchButtonKeywordClear}
                onOpenSearch={onOpenMobileFilterOverlay}
                onPointerDown={onMobileSearchButtonPointerDown}
                onTabChange={onMobileContentTabChange}
              />
            )}
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
              mode={
                isCompareOpen
                  ? "compare"
                  : selectedResortId
                    ? "detail"
                    : "results"
              }
              activeTab={mobileContentTab}
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
              mapTileVariant={mapTileVariant}
              onTabChange={onMobileContentTabChange}
              onAddCompare={onCloseCompare}
              onCloseDetail={onCloseDetail}
              onClearCompare={onClearCompare}
              onMapTileVariantChange={setMapTileVariant}
              onOpenCompare={onOpenCompare}
              onToggleCompare={onToggleCompare}
            />
          )}
          <div className="flex-1 min-h-0 relative">
            {shouldRenderMap && (
              <DynamicMap
                resorts={initialResorts}
                filteredResortIdSet={mapFilteredResortIdSet}
                isFilterActive={
                  isMobileCompareMapFocus ? true : hasActiveFilters
                }
                // 条件なしで検索結果を閉じる時に、全スキー場へ fit して地図位置が動くのを防ぐ。
                searchResultResortIds={mapSearchResultResortIds}
                searchViewportRequestKey={searchViewportRequestKey}
                searchViewportBottomPaddingRatio={
                  searchViewportBottomPaddingRatio
                }
                mapControlBottomPaddingRatio={searchViewportBottomPaddingRatio}
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
        rootClassName="fixed inset-0 z-[60] md:flex pointer-events-none"
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
          />
        )}
      </AnimatedPanel>

      <AnimatedPanel
        visible={isCompareOpen && isSidePanelLayout}
        rootClassName="fixed inset-0 z-[100] flex items-center justify-center p-0 pointer-events-none"
      >
        {isCompareOpen && isSidePanelLayout && (
          <SkiResortCompareView
            resorts={compareResortData}
            isLoading={isCompareLoading}
            initialLiftTicketInput={liftTicketInput}
            onClose={onCloseCompare}
          />
        )}
      </AnimatedPanel>
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
      <div className="flex h-10 rounded-full bg-gray-100 border border-gray-200 overflow-hidden shadow-sm">
        {[
          ["map", "地図"],
          ["info", "リスト"],
        ].map(([tab, label]) => {
          const isActive = activeTab === tab;
          return (
            <Button
              key={tab}
              type="button"
              variant={isActive ? "default" : "ghost"}
              aria-pressed={isActive}
              onClick={() => onTabChange(tab as "info" | "map")}
              // §13: 塗りつぶしセグメントタブはウェイト font-semibold（比較タブと同一）
              className={`flex-1 min-w-0 h-full px-4 whitespace-nowrap transition-smooth rounded-none font-semibold ${
                isActive
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {label}
            </Button>
          );
        })}
      </div>
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
  mode: "results" | "compare" | "detail";
  activeTab: "info" | "map";
  resultCount: number;
  compareCount: number;
  detailTitle: string;
  detailPrefecture: string;
  detailTown: string;
  detailResortId: string | null;
  isDetailCompareSelected: boolean;
  activeFilterLabels: string[];
  mapTileVariant: MapTileVariant;
  onTabChange: (tab: "info" | "map") => void;
  onAddCompare: () => void;
  onCloseDetail: () => void;
  onClearCompare: () => void;
  onMapTileVariantChange: (variant: MapTileVariant) => void;
  onOpenCompare: () => void;
  onToggleCompare: (id: string, selected: boolean) => void;
};

const MobileContextHeader = ({
  mode,
  activeTab,
  resultCount,
  compareCount,
  detailTitle,
  detailPrefecture,
  detailTown,
  detailResortId,
  isDetailCompareSelected,
  activeFilterLabels,
  mapTileVariant,
  onTabChange,
  onAddCompare,
  onCloseDetail,
  onClearCompare,
  onMapTileVariantChange,
  onOpenCompare,
  onToggleCompare,
}: MobileContextHeaderProps) => {
  const isResults = mode === "results";
  const tabs =
    mode === "compare"
      ? { info: "情報で比較", map: "地図で比較" }
      : mode === "detail"
        ? { info: "詳細", map: "地図" }
        : { info: "リストで探す", map: "地図で探す" };
  const filterLabels = activeFilterLabels;
  const shouldShowMapTileControl = isResults && activeTab === "map";

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
            {shouldShowMapTileControl && (
              <div className="ml-auto h-[28px] min-w-fit px-1 rounded-lg bg-gray-100 border border-gray-200 gap-0.5 flex">
                {MAP_TILE_OPTIONS.map(option => {
                  const isActive = mapTileVariant === option.value;

                  return (
                    <Button
                      key={option.value}
                      type="button"
                      variant={isActive ? "default" : "ghost"}
                      aria-label={`${option.label}に切り替え`}
                      aria-pressed={isActive}
                      onClick={() => onMapTileVariantChange(option.value)}
                      className="h-full min-w-0 px-3 rounded-md text-xs font-semibold leading-none"
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {mode === "compare" && (
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-gray-900 text-base font-bold font-[var(--font-heading)]">
              比較中：{compareCount}件
            </h2>
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={onAddCompare}
            >
              <Plus size={16} strokeWidth={2.5} />
              追加
            </Button>
          </div>
        </div>
      )}

      {mode === "detail" && (
        <div className="px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <h2 className="flex-1 text-gray-900 text-xl font-bold leading-tight min-w-0 break-words truncate font-[var(--font-heading)]">
              {detailTitle}
            </h2>
            <Button
              type="button"
              aria-label="詳細を閉じる"
              variant="ghost"
              onClick={onCloseDetail}
              className="flex-shrink-0 h-9 w-9 min-w-9 p-0 rounded-full text-gray-500 border border-gray-200 flex items-center justify-center hover:bg-gray-50 hover:text-gray-900"
            >
              <X size={18} strokeWidth={2.5} />
            </Button>
          </div>
          <div className="mt-2 flex items-start justify-between gap-2">
            <p className="flex-1 min-w-0 text-gray-600 text-sm font-semibold leading-snug break-words truncate">
              {detailPrefecture} · {detailTown}
            </p>
            {detailResortId && (
              <Button
                type="button"
                size="sm"
                variant={isDetailCompareSelected ? "default" : "outline"}
                onClick={() =>
                  onToggleCompare(detailResortId, !isDetailCompareSelected)
                }
                className="flex-shrink-0 h-8 px-3 rounded-lg text-xs font-semibold gap-1.5 flex items-center justify-center"
              >
                {isDetailCompareSelected ? (
                  <Check size={16} strokeWidth={2} />
                ) : (
                  <Plus size={16} strokeWidth={2} />
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

      {mode === "compare" && (
        <div className="w-full border-t border-gray-200 flex">
          {(["info", "map"] as const).map(tab => {
            const isActive = activeTab === tab;
            return (
              <Button
                key={tab}
                type="button"
                variant="ghost"
                onClick={() => onTabChange(tab)}
                className={`flex-1 h-12 rounded-none transition-smooth font-semibold ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {tabs[tab]}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
};
