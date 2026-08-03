"use client";

import { Box, Button, Flex, Heading, Text } from "@chakra-ui/react";
import { AnimatePresence } from "framer-motion";
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
import type {
  MapSkiResort,
  NullableSkiResortDetail,
  SkiResortDetail,
} from "@/types/skiResorts";
import { DesktopSearchPanel } from "../components/DesktopSearchPanel";
import { MobileResultsSheet } from "../components/MobileResultsSheet";
import { MobileSearchButton } from "../components/MobileSearchButton";
import { MobileSearchOverlay } from "../components/MobileSearchOverlay";
import {
  MOBILE_SEARCH_TOP_BAR_HEIGHT,
  MobileSearchTopBarShell,
} from "../components/MobileSearchTopBarShell";
import { SkiResortCompareView } from "../components/SkiResortCompareView";
import type { MapViewRestoreRequest } from "../types";

const MAP_TILE_OPTIONS: Array<{ label: string; value: MapTileVariant }> = [
  { label: "地図", value: "pale" },
  { label: "衛星", value: "photo" },
];

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
  selectedViewportBottomPaddingRatio: number;
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
  selectedViewportBottomPaddingRatio,
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
  onSetDetailSheetSnapPoint,
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
  const shouldShowMobileContextHeader =
    !isSidePanelLayout &&
    !isMobileFilterOverlayOpen &&
    (isCompareOpen || Boolean(selectedResortId) || hasSearched);
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
    <Flex
      as="main"
      onPointerDownCapture={onMainPointerDownCapture}
      position="fixed"
      top={0}
      right={0}
      bottom={0}
      left={0}
      minH={0}
      w="100vw"
      overflow="hidden"
      flexDirection={{ md: "row" }}
      bg="var(--bg-light)"
    >
      <Box
        h="100%"
        w="100%"
        position="relative"
        display="flex"
        flexDirection="column"
        bg="white"
      >
        {shouldShowMobileTopChrome && (
          <Flex
            display={{ base: "flex", md: "none" }}
            position="fixed"
            top={0}
            right={0}
            left={0}
            zIndex={150000}
            flexDirection="column"
            gap={0}
            px={0}
            pb={0}
            bg="white"
          >
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
          </Flex>
        )}
        <Box
          flex="1 1 auto"
          minH={0}
          position="relative"
          display="flex"
          flexDirection="column"
          pt={{
            base:
              shouldShowMobileSearchButton && shouldShowMobileTopChrome
                ? MOBILE_SEARCH_TOP_BAR_HEIGHT
                : 0,
            md: 0,
          }}
        >
          <Box
            flex="1 1 auto"
            minH={0}
            position="relative"
            display="flex"
            flexDirection="column"
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
            <Box flex="1 1 auto" minH={0} position="relative">
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
                  mapControlBottomPaddingRatio={
                    searchViewportBottomPaddingRatio
                  }
                  selectedResortId={selectedResortId}
                  selectedViewportBottomPaddingRatio={
                    selectedViewportBottomPaddingRatio
                  }
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
                  finalizedMapData={
                    selectedResortData?.finalizedMapData ?? null
                  }
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
                  sheetSnapPoint={detailSheetSnapPoint}
                  setSheetSnapPoint={onSetDetailSheetSnapPoint}
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
            </Box>
            {shouldShowMobileSearchScreen && (
              <Box
                position="absolute"
                inset={0}
                zIndex={200000}
                display={{ base: "block", md: "none" }}
              >
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
              </Box>
            )}
          </Box>
        </Box>
      </Box>

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

      <AnimatePresence>
        {selectedResortId && (isSidePanelLayout || shouldRenderMap) && (
          <SkiResortDetailView
            DynamicMap={DynamicMap}
            mapResorts={initialResorts}
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
            mobileContentTab="info"
            hideMobileInfoSection
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCompareOpen && isSidePanelLayout && (
          <SkiResortCompareView
            resorts={compareResortData}
            isLoading={isCompareLoading}
            initialLiftTicketInput={liftTicketInput}
            onClose={onCloseCompare}
          />
        )}
      </AnimatePresence>
    </Flex>
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
      <Flex
        minW={0}
        h={10}
        p={1}
        borderRadius="full"
        bg="gray.100"
        border="1px solid"
        borderColor="gray.200"
        gap={1}
        overflow="hidden"
      >
        {[
          ["map", "地図"],
          ["info", "リスト"],
        ].map(([tab, label]) => {
          const isActive = activeTab === tab;
          return (
            <Button
              key={tab}
              type="button"
              aria-pressed={isActive}
              onClick={() => onTabChange(tab as "info" | "map")}
              flex="1 1 0"
              minW={0}
              h="100%"
              px={1}
              borderRadius="full"
              bg={isActive ? "brand.500" : "transparent"}
              color={isActive ? "white" : "gray.600"}
              boxShadow={
                isActive ? "0 1px 4px rgba(37, 99, 235, 0.24)" : "none"
              }
              fontSize="0.78rem"
              fontWeight="800"
              lineHeight="1"
              whiteSpace="nowrap"
              _hover={{ bg: isActive ? "brand.600" : "gray.200" }}
            >
              {label}
            </Button>
          );
        })}
      </Flex>
    }
  >
    <MobileSearchButton
      keyword={keyword}
      isHidden={false}
      placement="static"
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
    <Box
      display={{ base: "block", md: "none" }}
      position="relative"
      zIndex={1}
      pointerEvents="auto"
    >
      {isResults && (
        <Box px={4} pt={0} pb={2}>
          <Flex gap={1.5} flexWrap="wrap" alignItems="center">
            {filterLabels.map(label => (
              <Box
                key={label}
                px={2}
                minH="28px"
                borderRadius="md"
                bg="gray.100"
                color="gray.700"
                fontSize="0.8125rem"
                fontWeight="700"
                lineHeight="1.4"
                display="flex"
                alignItems="center"
                whiteSpace="normal"
                overflowWrap="anywhere"
              >
                {label}
              </Box>
            ))}
            <Box
              as="span"
              px={2}
              minH="28px"
              borderRadius="md"
              bg="brand.50"
              color="brand.700"
              fontSize="0.8125rem"
              fontWeight="800"
              lineHeight="1.4"
              display="flex"
              alignItems="center"
            >
              {resultCount.toLocaleString()}件
            </Box>
            {shouldShowMapTileControl && (
              <Flex
                ml="auto"
                h="28px"
                minW="fit-content"
                p="2px"
                borderRadius="md"
                bg="gray.100"
                border="1px solid"
                borderColor="gray.200"
                gap="2px"
              >
                {MAP_TILE_OPTIONS.map(option => {
                  const isActive = mapTileVariant === option.value;

                  return (
                    <Button
                      key={option.value}
                      type="button"
                      aria-label={`${option.label}に切り替え`}
                      aria-pressed={isActive}
                      onClick={() => onMapTileVariantChange(option.value)}
                      h="100%"
                      minW={0}
                      px={2}
                      borderRadius="sm"
                      bg={isActive ? "brand.500" : "transparent"}
                      color={isActive ? "white" : "gray.600"}
                      boxShadow={
                        isActive ? "0 1px 4px rgba(37, 99, 235, 0.24)" : "none"
                      }
                      fontSize="0.75rem"
                      fontWeight="800"
                      lineHeight="1"
                      _hover={{ bg: isActive ? "brand.600" : "gray.200" }}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </Flex>
            )}
          </Flex>
        </Box>
      )}

      {mode === "compare" && (
        <Box px={4} pb={3}>
          <Flex alignItems="center" justifyContent="space-between" gap={3}>
            <Heading as="h2" size="sm" color="gray.900">
              比較中：{compareCount}件
            </Heading>
            <Button
              type="button"
              onClick={onAddCompare}
              size="sm"
              h={9}
              px={3}
              borderRadius="md"
              bg="brand.500"
              color="white"
              fontSize="0.78rem"
              fontWeight="800"
              _hover={{ bg: "brand.600" }}
            >
              <Plus size={15} strokeWidth={3} />
              追加
            </Button>
          </Flex>
        </Box>
      )}

      {mode === "detail" && (
        <Box px={4} pb={2.5}>
          <Flex alignItems="flex-start" justifyContent="space-between" gap={2}>
            <Heading
              as="h2"
              flex="1"
              color="gray.900"
              fontSize="1.28rem"
              fontWeight="900"
              lineHeight="1.35"
              minW={0}
              whiteSpace="normal"
              overflowWrap="anywhere"
            >
              {detailTitle}
            </Heading>
            <Button
              type="button"
              aria-label="詳細を閉じる"
              onClick={onCloseDetail}
              flexShrink={0}
              h={8}
              w={8}
              minW={8}
              p={0}
              borderRadius="full"
              bg="white"
              color="gray.600"
              border="1px solid"
              borderColor="gray.200"
              _hover={{ bg: "gray.50", color: "gray.900" }}
            >
              <X size={15} strokeWidth={2.8} />
            </Button>
          </Flex>
          <Flex
            mt={1.5}
            alignItems="flex-start"
            justifyContent="space-between"
            gap={2}
          >
            <Text
              flex="1"
              minW={0}
              color="brand.600"
              fontSize="0.95rem"
              fontWeight="800"
              lineHeight="1.45"
              whiteSpace="normal"
              overflowWrap="anywhere"
            >
              {detailPrefecture} • {detailTown}
            </Text>
            {detailResortId && (
              <Button
                type="button"
                onClick={() =>
                  onToggleCompare(detailResortId, !isDetailCompareSelected)
                }
                size="sm"
                flexShrink={0}
                h={8}
                px={2.5}
                borderRadius="md"
                bg={isDetailCompareSelected ? "brand.500" : "white"}
                color={isDetailCompareSelected ? "white" : "brand.600"}
                border="1px solid"
                borderColor="brand.500"
                fontSize="0.75rem"
                fontWeight="800"
                gap={1.5}
                _hover={{
                  bg: isDetailCompareSelected ? "brand.600" : "brand.50",
                }}
              >
                {isDetailCompareSelected ? (
                  <Check size={15} strokeWidth={3} />
                ) : (
                  <Plus size={15} strokeWidth={3} />
                )}
                {isDetailCompareSelected ? "比較から外す" : "比較に追加"}
              </Button>
            )}
          </Flex>
        </Box>
      )}

      {isResults && compareCount > 0 && (
        <Flex
          px={4}
          pb={3}
          gap={2}
          alignItems="center"
          borderBottom="1px solid"
          borderColor="gray.100"
        >
          <Button
            flex={1}
            minW={0}
            h={10}
            borderRadius="md"
            bg="orange.500"
            color="white"
            fontSize="sm"
            fontWeight="800"
            _hover={{ bg: "orange.600" }}
            onClick={onOpenCompare}
          >
            {compareCount} 件を比較
          </Button>
          <Button
            flex={1}
            minW={0}
            h={10}
            borderRadius="md"
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            color="gray.700"
            fontSize="sm"
            fontWeight="800"
            _hover={{ bg: "gray.50" }}
            onClick={onClearCompare}
          >
            比較をクリア
          </Button>
        </Flex>
      )}

      {mode === "compare" && (
        <Flex
          w="100%"
          borderTop="0"
          borderBottom="1px solid"
          borderColor="gray.100"
        >
          {(["info", "map"] as const).map(tab => {
            const isActive = activeTab === tab;
            return (
              <Button
                key={tab}
                type="button"
                onClick={() => onTabChange(tab)}
                flex="1"
                h={12}
                borderRadius={0}
                bg={isActive ? "brand.500" : "transparent"}
                color={isActive ? "white" : "gray.600"}
                fontSize="0.95rem"
                fontWeight="800"
                _hover={{ bg: isActive ? "brand.600" : "gray.100" }}
              >
                {tabs[tab]}
              </Button>
            );
          })}
        </Flex>
      )}
    </Box>
  );
};
