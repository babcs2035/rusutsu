"use client";

import { Box, Button, Flex, Heading, Text } from "@chakra-ui/react";
import { AnimatePresence } from "framer-motion";
import { Check, Filter, Plus, SlidersHorizontal, X } from "lucide-react";
import type {
  ComponentType,
  ChangeEvent as ReactChangeEvent,
  FormEvent as ReactFormEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  RefObject,
} from "react";
import { REGION_PREFECTURES } from "@/features/filters/constants";
import type { Filters } from "@/features/filters/types";
import { getActiveFilterLabels } from "@/features/filters/utils/filterLabels";
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
  isMobileFilterOverlayOpen: boolean;
  isPending: boolean;
  isSidePanelLayout: boolean;
  listSheetContentRef: RefObject<HTMLDivElement | null>;
  listSheetSnapPoint: number | string | null;
  mapInteractionMode: JapanResortMapProps["interactionMode"];
  mobileContentTab: "info" | "map";
  mobileFilterOverlayRef: RefObject<HTMLDivElement | null>;
  mobileListSheetSnapPoints: (number | string)[];
  hasActiveMobileDraftFilters: boolean;
  mobileDraftFilteredResortCount: number;
  mobileDraftFilters: Filters;
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
  hasActiveMobileDraftFilters,
  mobileDraftFilteredResortCount,
  mobileDraftFilters,
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
  const isMobileCompareMapFocus = !isSidePanelLayout && isCompareOpen;
  const mapFilteredResortIdSet = isMobileCompareMapFocus
    ? selectedCompareIdSet
    : filteredResortIdSet;
  const mapSearchResultResortIds = isMobileCompareMapFocus
    ? selectedCompareIds
    : hasActiveFilters
      ? filteredResortIds
      : [];
  const shouldShowMobileContextHeader =
    !isSidePanelLayout &&
    !isMobileFilterOverlayOpen &&
    (isCompareOpen || Boolean(selectedResortId) || hasSearched);
  const shouldRenderMap =
    isSidePanelLayout ||
    (!selectedResortId && mobileContentTab === "map") ||
    !shouldShowMobileContextHeader;
  const shouldShowMobileSearchButton =
    !isCompareOpen &&
    !isMobileFilterOverlayOpen &&
    !selectedResortId &&
    !hasSearched;
  const shouldShowMobileTopChrome =
    !isSidePanelLayout &&
    !isMobileFilterOverlayOpen &&
    (shouldShowMobileSearchButton || shouldShowMobileContextHeader);

  const mobileRegionOptions = Object.entries(REGION_PREFECTURES).map(
    ([region, prefectures]) => ({ region, prefectures }),
  );
  const mobileActiveFilterLabels = getActiveFilterLabels(
    filters,
    mobileRegionOptions,
  );

  return (
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
            flex="0 0 auto"
            flexDirection="column"
            gap={0}
            px={0}
            pt="calc(env(safe-area-inset-top, 0px) + 0.75rem)"
            pb={0}
            bg="white"
            borderBottom="1px solid"
            borderColor="gray.100"
            boxShadow="0 1px 0 rgba(15, 23, 42, 0.04)"
          >
            <MobileSearchButton
              keyword={filters.keyword}
              isHidden={!shouldShowMobileSearchButton}
              placement="static"
              onKeywordClear={onMobileSearchButtonKeywordClear}
              onOpen={onOpenMobileFilterOverlay}
              onPointerDown={onMobileSearchButtonPointerDown}
            />
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
                onTabChange={onMobileContentTabChange}
                onAddCompare={onCloseCompare}
                onChangeFilters={onOpenMobileFilterOverlay}
                onCloseDetail={onCloseDetail}
                onClearCompare={onClearCompare}
                onOpenCompare={onOpenCompare}
                onToggleCompare={onToggleCompare}
              />
            )}
          </Flex>
        )}
        <Box flex="1 1 auto" minH={0} position="relative">
          {shouldRenderMap && (
            <DynamicMap
              resorts={initialResorts}
              filteredResortIdSet={mapFilteredResortIdSet}
              isFilterActive={isMobileCompareMapFocus ? true : hasActiveFilters}
              // 条件なしで検索結果を閉じる時に、全スキー場へ fit して地図位置が動くのを防ぐ。
              searchResultResortIds={mapSearchResultResortIds}
              searchViewportRequestKey={searchViewportRequestKey}
              searchViewportBottomPaddingRatio={
                searchViewportBottomPaddingRatio
              }
              mapControlBottomPaddingRatio={searchViewportBottomPaddingRatio}
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
              finalizedMapData={selectedResortData?.finalizedMapData ?? null}
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
        <MobileSearchOverlay
          filters={mobileDraftFilters}
          resorts={initialResorts}
          filteredResortCount={mobileDraftFilteredResortCount}
          canSearch={hasActiveMobileDraftFilters}
          isOpen={isMobileFilterOverlayOpen}
          isSidePanelLayout={isSidePanelLayout}
          overlayRef={mobileFilterOverlayRef}
          inputRef={mobileSearchPanelInputRef}
          scrollRef={mobileSearchFilterScrollRef}
          filterTop={mobileSearchFilterTop}
          filterBottomPadding={mobileSearchFilterBottomPadding}
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
            onClose={onCloseCompare}
          />
        )}
      </AnimatePresence>
    </Flex>
  );
};

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
  onTabChange: (tab: "info" | "map") => void;
  onAddCompare: () => void;
  onChangeFilters: () => void;
  onCloseDetail: () => void;
  onClearCompare: () => void;
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
  onTabChange,
  onAddCompare,
  onChangeFilters,
  onCloseDetail,
  onClearCompare,
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
  const filterLabels =
    activeFilterLabels.length > 0 ? activeFilterLabels : ["条件なし"];

  return (
    <Box
      display={{ base: "block", md: "none" }}
      position="relative"
      zIndex={1}
      pointerEvents="auto"
    >
      {isResults && (
        <Box px={4} pb={3}>
          <Flex alignItems="center" justifyContent="space-between" gap={3}>
            <Heading
              as="h2"
              size="md"
              color="gray.900"
              display="flex"
              alignItems="center"
              gap={2}
            >
              <Filter size={16} color="var(--brand-main)" />
              スキー場検索
              <Box
                as="span"
                display="inline-flex"
                alignItems="center"
                h="30px"
                px={3}
                borderRadius="full"
                bg="brand.50"
                color="brand.700"
                fontSize="1rem"
                fontWeight="900"
                lineHeight="1"
                whiteSpace="nowrap"
              >
                {resultCount.toLocaleString()}件
              </Box>
            </Heading>
            <Button
              type="button"
              onClick={onChangeFilters}
              size="sm"
              flex="0 0 auto"
              h={8}
              px={3}
              borderRadius="md"
              bg="gray.900"
              color="white"
              border="1px solid"
              borderColor="gray.900"
              gap={1.5}
              fontSize="0.78rem"
              fontWeight="800"
              _hover={{ bg: "gray.800", borderColor: "gray.800" }}
            >
              <SlidersHorizontal size={14} />
              フィルタを変更
            </Button>
          </Flex>
          <Flex mt={3} gap={1.5} flexWrap="wrap" alignItems="center">
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
              >
                {label}
              </Box>
            ))}
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

      {mode !== "detail" && (
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
