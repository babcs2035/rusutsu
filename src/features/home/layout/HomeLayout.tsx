"use client";

import { Box, Flex } from "@chakra-ui/react";
import { AnimatePresence } from "framer-motion";
import type {
  ComponentType,
  ChangeEvent as ReactChangeEvent,
  FormEvent as ReactFormEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  RefObject,
} from "react";
import type { Filters } from "@/features/filters/types";
import type {
  ElevationProfileMapPoint,
  JapanResortMapProps,
  SelectedMapFeature,
} from "@/features/map/types";
import { SkiResortDetailView } from "@/features/resort-detail/SkiResortDetailView";
import type {
  MapSkiResort,
  NullableSkiResortDetail,
  SkiResortDetail,
} from "@/types/skiResorts";
import { CompareActionButton } from "../components/CompareActionButton";
import { DesktopSearchPanel } from "../components/DesktopSearchPanel";
import { MobileResultsSheet } from "../components/MobileResultsSheet";
import { MobileSearchButton } from "../components/MobileSearchButton";
import { MobileSearchOverlay } from "../components/MobileSearchOverlay";
import { SkiResortCompareView } from "../components/SkiResortCompareView";
import type { MapViewRestoreRequest } from "../types";

type Props = {
  DynamicMap: ComponentType<JapanResortMapProps>;
  compareResortData: SkiResortDetail[];
  detailSheetSnapPoint: number | string | null;
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
  isMobileCompareButtonPinnedToTop: boolean;
  isMobileFilterOverlayOpen: boolean;
  isPending: boolean;
  isSidePanelLayout: boolean;
  listSheetContentRef: RefObject<HTMLDivElement | null>;
  listSheetSnapPoint: number | string | null;
  mapInteractionMode: JapanResortMapProps["interactionMode"];
  mobileCompareButtonBottom: string;
  mobileFilterOverlayRef: RefObject<HTMLDivElement | null>;
  mobileListSheetSnapPoints: (number | string)[];
  mobileSearchFilterBottomPadding: string;
  mobileSearchFilterScrollRef: RefObject<HTMLDivElement | null>;
  mobileSearchFilterTop: string;
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
  selectedViewportBottomPaddingRatio: number;
  shouldRenderMobileListSheet: boolean;
  onCloseCompare: () => void;
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
  onMobileKeywordChange: (event: ReactChangeEvent<HTMLInputElement>) => void;
  onMobileKeywordClear: () => void;
  onMobileSearchButtonPointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onMobileSearchFilterInputBlur: () => void;
  onMobileSearchFilterInputFocus: () => void;
  onMobileSearchSubmit: (event: ReactFormEvent<HTMLElement>) => void;
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
  onSetDetailSheetSnapPoint: (snapPoint: number | string | null) => void;
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
  detailSheetSnapPoint,
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
  isMobileCompareButtonPinnedToTop,
  isMobileFilterOverlayOpen,
  isPending,
  isSidePanelLayout,
  listSheetContentRef,
  listSheetSnapPoint,
  mapInteractionMode,
  mobileCompareButtonBottom,
  mobileFilterOverlayRef,
  mobileListSheetSnapPoints,
  mobileSearchFilterBottomPadding,
  mobileSearchFilterScrollRef,
  mobileSearchFilterTop,
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
  selectedViewportBottomPaddingRatio,
  shouldRenderMobileListSheet,
  onCloseCompare,
  onCloseDetail,
  onCloseMobileFilterOverlay,
  onFilterChange,
  onFilterKeyboardInputBlur,
  onFilterKeyboardInputFocus,
  onMainPointerDownCapture,
  onMapViewChange,
  onMobileFilterAreaPointerDown,
  onMobileKeywordChange,
  onMobileKeywordClear,
  onMobileSearchButtonPointerDown,
  onMobileSearchFilterInputBlur,
  onMobileSearchFilterInputFocus,
  onMobileSearchSubmit,
  onOpenCompare,
  onOpenMobileFilterOverlay,
  onSearch,
  onSelectResort,
  onSelectedFinalizedFeatureChange,
  onSelectedElevationProfilePointChange,
  onSetDetailSheetSnapPoint,
  onSetFilterEditorOpen,
  onSetHoveredResortId,
  onSetListSheetOpen,
  onSetListSheetSnapPoint,
  onToggleCompare,
  onUserMapInteraction,
  onUserMapZoomInteraction,
}: Props) => (
  <Flex
    as="main"
    onPointerDownCapture={onMainPointerDownCapture}
    position="relative"
    h="100vh"
    w="100vw"
    overflow="hidden"
    flexDirection={{ md: "row" }}
    bg="var(--bg-light)"
  >
    <Box h="100%" w="100%" position="relative">
      <DynamicMap
        resorts={initialResorts}
        filteredResortIdSet={filteredResortIdSet}
        isFilterActive={hasActiveFilters}
        searchResultResortIds={filteredResortIds}
        searchViewportRequestKey={searchViewportRequestKey}
        searchViewportBottomPaddingRatio={searchViewportBottomPaddingRatio}
        mapControlBottomPaddingRatio={searchViewportBottomPaddingRatio}
        selectedResortId={selectedResortId}
        selectedViewportBottomPaddingRatio={selectedViewportBottomPaddingRatio}
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
        selectedFinalizedFeature={selectedFinalizedFeature}
        onSelectedFinalizedFeatureChange={onSelectedFinalizedFeatureChange}
        selectedElevationProfilePoint={selectedElevationProfilePoint}
      />
      <MobileSearchButton
        keyword={filters.keyword}
        isHidden={isCompareOpen || isMobileFilterOverlayOpen}
        onOpen={onOpenMobileFilterOverlay}
        onPointerDown={onMobileSearchButtonPointerDown}
      />
      <MobileSearchOverlay
        filters={filters}
        resorts={initialResorts}
        filteredResortCount={filteredResorts.length}
        isOpen={isMobileFilterOverlayOpen}
        isSidePanelLayout={isSidePanelLayout}
        overlayRef={mobileFilterOverlayRef}
        inputRef={mobileSearchPanelInputRef}
        scrollRef={mobileSearchFilterScrollRef}
        filterTop={mobileSearchFilterTop}
        filterBottomPadding={mobileSearchFilterBottomPadding}
        onClose={onCloseMobileFilterOverlay}
        onFilterAreaPointerDown={onMobileFilterAreaPointerDown}
        onFilterChange={onFilterChange}
        onInputBlur={onMobileSearchFilterInputBlur}
        onInputFocus={onMobileSearchFilterInputFocus}
        onKeywordChange={onMobileKeywordChange}
        onKeywordClear={onMobileKeywordClear}
        onSearch={onSearch}
        onSubmit={onMobileSearchSubmit}
      />
    </Box>

    <DesktopSearchPanel
      filters={filters}
      resorts={initialResorts}
      filteredResorts={filteredResorts}
      hasSearched={hasSearched}
      isFilterEditorOpen={isFilterEditorOpen}
      selectedCompareIdSet={selectedCompareIdSet}
      onExpandedChange={onSetFilterEditorOpen}
      onFilterChange={onFilterChange}
      onKeyboardInputBlur={onFilterKeyboardInputBlur}
      onKeyboardInputFocus={onFilterKeyboardInputFocus}
      onSearch={onSearch}
      onSelectResort={onSelectResort}
      onToggleCompare={onToggleCompare}
      onHoverResortChange={onSetHoveredResortId}
    />

    {shouldRenderMobileListSheet && (
      <MobileResultsSheet
        compareResorts={compareResortData}
        filteredResorts={filteredResorts}
        hasSearched={hasSearched}
        isCompareLoading={isCompareLoading}
        isCompareOpen={isCompareOpen}
        isListSheetOpen={isListSheetOpen}
        listSheetContentRef={listSheetContentRef}
        listSheetSnapPoint={listSheetSnapPoint}
        snapPoints={mobileListSheetSnapPoints}
        selectedCompareIdSet={selectedCompareIdSet}
        onCloseCompare={onCloseCompare}
        onHoverResortChange={onSetHoveredResortId}
        onOpenChange={open => {
          onSetListSheetOpen(open && (hasSearched || isCompareOpen));
          if (!open && isCompareOpen) {
            onCloseCompare();
          }
        }}
        onSelectResort={onSelectResort}
        onSetSnapPoint={onSetListSheetSnapPoint}
        onToggleCompare={onToggleCompare}
      />
    )}

    <CompareActionButton
      compareCount={selectedCompareIds.length}
      isCompareOpen={isCompareOpen}
      isPinnedToTop={isMobileCompareButtonPinnedToTop}
      mobileBottom={mobileCompareButtonBottom}
      onOpenCompare={onOpenCompare}
    />

    <AnimatePresence>
      {selectedResortId && (
        <SkiResortDetailView
          resortData={selectedResortData}
          isLoading={isPending}
          isCompareSelected={selectedCompareIdSet.has(selectedResortId)}
          sheetSnapPoint={detailSheetSnapPoint}
          setSheetSnapPoint={onSetDetailSheetSnapPoint}
          onToggleCompare={onToggleCompare}
          selectedFinalizedFeature={selectedFinalizedFeature}
          selectedElevationProfilePoint={selectedElevationProfilePoint}
          onSelectedFinalizedFeatureChange={onSelectedFinalizedFeatureChange}
          onSelectedElevationProfilePointChange={
            onSelectedElevationProfilePointChange
          }
          onClose={onCloseDetail}
        />
      )}
    </AnimatePresence>

    <AnimatePresence>
      {isCompareOpen && isSidePanelLayout && (
        <SkiResortCompareView
          resorts={compareResortData}
          isLoading={isCompareLoading}
          onClose={onCloseCompare}
        />
      )}
    </AnimatePresence>
  </Flex>
);
