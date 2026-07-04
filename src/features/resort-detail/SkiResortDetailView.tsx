"use client";

import {
  Box,
  Button,
  Flex,
  Portal,
  Text,
  useBreakpointValue,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import { Maximize2, X } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import type {
  ElevationProfileMapPoint,
  JapanResortMapProps,
  SelectedMapFeature,
} from "@/features/map/types";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import type {
  MapSkiResort,
  NullableSkiResortDetail,
  SkiResortDetail,
} from "@/types/skiResorts";
import { DetailTabs } from "./components/DetailTabs";
import { useBodyScrollLock } from "./hooks/useBodyScrollLock";
import {
  CoursesTab,
  ImageCarousel,
  InfoSection,
  LiftsTab,
  OverviewTab,
  TicketsTab,
  WeatherTab,
} from "./tabs/DetailTabContent";

type Props = {
  DynamicMap: ComponentType<JapanResortMapProps>;
  mapResorts: MapSkiResort[];
  resortData: NullableSkiResortDetail | null;
  isLoading: boolean;
  isCompareSelected: boolean;
  sheetSnapPoint: number | string | null;
  setSheetSnapPoint: (snapPoint: number | string | null) => void;
  onToggleCompare: (id: string, selected: boolean) => void;
  selectedFinalizedFeature: SelectedMapFeature | null;
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
  onClose: () => void;
  mobileContentTab?: "info" | "map";
  mobilePresentation?: "overlay" | "inline";
  hideMobileInfoSection?: boolean;
};

const TABS = ["概要", "コース", "リフト", "チケット", "気候"];
type DetailMapMode = "finalized" | "location";

const MotionBox = motion.create(Box);

const MobileResortMapPreview = ({
  DynamicMap,
  resort,
  mapResorts,
  selectedFinalizedFeature,
  selectedElevationProfilePoint,
  onSelectedFinalizedFeatureChange,
  onSelectedElevationProfilePointChange,
}: {
  DynamicMap: ComponentType<JapanResortMapProps>;
  resort: SkiResortDetail;
  mapResorts: MapSkiResort[];
  selectedFinalizedFeature: SelectedMapFeature | null;
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
}) => {
  const hasFinalizedMap =
    (resort.finalizedMapData?.courses?.features.length ?? 0) > 0 ||
    (resort.finalizedMapData?.lifts?.features.length ?? 0) > 0;
  const [mapMode, setMapMode] = useState<DetailMapMode>(
    hasFinalizedMap ? "finalized" : "location",
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedResortIdSet = useMemo(() => new Set([resort.id]), [resort.id]);
  const emptyCompareIdSet = useMemo(() => new Set<string>(), []);

  useEffect(() => {
    setMapMode(hasFinalizedMap ? "finalized" : "location");
  }, [hasFinalizedMap]);

  const modeOptions = hasFinalizedMap
    ? ([
        { value: "finalized", label: "コースマップ" },
        { value: "location", label: "周辺位置" },
      ] as const)
    : ([{ value: "location", label: "周辺位置" }] as const);
  const mapFinalizedData =
    mapMode === "finalized" ? (resort.finalizedMapData ?? null) : null;
  const detailViewportMode = mapMode === "finalized" ? "finalized" : "resort";

  const renderMap = (presentation: "preview" | "expanded") => (
    <DynamicMap
      resorts={mapResorts}
      filteredResortIdSet={selectedResortIdSet}
      isFilterActive={false}
      selectedResortId={resort.id}
      selectedCompareIdSet={emptyCompareIdSet}
      interactionMode="detail"
      finalizedMapData={mapFinalizedData}
      mapPresentation={presentation}
      detailViewportMode={detailViewportMode}
      selectedFinalizedFeature={selectedFinalizedFeature}
      selectedElevationProfilePoint={selectedElevationProfilePoint}
      selectedViewportBottomPaddingRatio={0}
      mapControlBottomPaddingRatio={0}
      onBoundsChange={() => undefined}
      onSelectResort={() => undefined}
      onSelectedFinalizedFeatureChange={onSelectedFinalizedFeatureChange}
      onSelectedElevationProfilePointChange={
        onSelectedElevationProfilePointChange
      }
    />
  );

  const modeTabs = (
    <Flex
      gap={1}
      borderRadius="md"
      bg="white"
      p={1}
      border="1px solid"
      borderColor="gray.200"
      boxShadow="sm"
    >
      {modeOptions.map(option => {
        const isActive = mapMode === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            h={7}
            minW={0}
            px={2.5}
            borderRadius="sm"
            bg={isActive ? "blue.600" : "white"}
            color={isActive ? "white" : "gray.700"}
            fontSize="0.72rem"
            fontWeight="800"
            _hover={{ bg: isActive ? "blue.700" : "gray.50" }}
            onClick={() => setMapMode(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </Flex>
  );

  return (
    <>
      <Box
        position="relative"
        h="210px"
        w="100%"
        flexShrink={0}
        overflow="hidden"
        borderTop="1px solid"
        borderBottom="1px solid"
        borderColor="gray.100"
        bg="gray.100"
      >
        {renderMap("preview")}
        <Flex
          position="absolute"
          top={2}
          left={2}
          right={2}
          zIndex={1200}
          alignItems="flex-start"
          justifyContent="space-between"
          gap={2}
          pointerEvents="none"
        >
          <Box pointerEvents="auto">{modeTabs}</Box>
          <Button
            type="button"
            aria-label="地図を拡大"
            onClick={() => setIsExpanded(true)}
            h={8}
            w={8}
            minW={8}
            p={0}
            borderRadius="md"
            bg="white"
            color="gray.700"
            border="1px solid"
            borderColor="gray.200"
            boxShadow="sm"
            pointerEvents="auto"
            _hover={{ bg: "gray.50" }}
          >
            <Maximize2 size={15} strokeWidth={2.6} />
          </Button>
        </Flex>
      </Box>

      {isExpanded && (
        <Portal>
          <Box
            position="fixed"
            inset={0}
            zIndex={300000}
            bg="white"
            display={{ base: "block", md: "none" }}
          >
            <Flex
              position="absolute"
              top={0}
              left={0}
              right={0}
              zIndex={10}
              alignItems="center"
              justifyContent="space-between"
              gap={2}
              px={3}
              pt="calc(env(safe-area-inset-top, 0px) + 0.625rem)"
              pb={2}
              bg="rgba(255,255,255,0.94)"
              borderBottom="1px solid"
              borderColor="gray.100"
              backdropFilter="blur(10px)"
            >
              <Box minW={0}>
                <Text
                  color="gray.900"
                  fontSize="0.95rem"
                  fontWeight="900"
                  lineHeight="1.25"
                  overflow="hidden"
                  textOverflow="ellipsis"
                  whiteSpace="nowrap"
                >
                  {resort.nameJa}
                </Text>
                <Text
                  mt={0.5}
                  color="brand.600"
                  fontSize="0.75rem"
                  fontWeight="800"
                  lineHeight="1"
                >
                  {mapMode === "finalized" ? "コースマップ" : "周辺位置"}
                </Text>
              </Box>
              <Flex alignItems="center" gap={2} flexShrink={0}>
                {modeTabs}
                <Button
                  type="button"
                  aria-label="地図を閉じる"
                  onClick={() => setIsExpanded(false)}
                  h={8}
                  w={8}
                  minW={8}
                  p={0}
                  borderRadius="full"
                  bg="white"
                  color="gray.700"
                  border="1px solid"
                  borderColor="gray.200"
                  _hover={{ bg: "gray.50" }}
                >
                  <X size={15} strokeWidth={2.8} />
                </Button>
              </Flex>
            </Flex>
            <Box
              h="100%"
              w="100%"
              pt="calc(env(safe-area-inset-top, 0px) + 3.75rem)"
            >
              {renderMap("expanded")}
            </Box>
          </Box>
        </Portal>
      )}
    </>
  );
};

/**
 * スキー場の詳細情報を表示するレスポンシブ対応モーダル
 */
export const SkiResortDetailView = ({
  DynamicMap,
  mapResorts,
  resortData,
  isLoading,
  isCompareSelected,
  onToggleCompare,
  selectedFinalizedFeature,
  selectedElevationProfilePoint,
  onSelectedFinalizedFeatureChange,
  onSelectedElevationProfilePointChange,
  onClose,
  mobileContentTab = "info",
  mobilePresentation = "overlay",
  hideMobileInfoSection = false,
}: Props) => {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const isSidePanel =
    useBreakpointValue({ base: false, md: true }, { ssr: false }) ?? false;
  const canScrollDetailContent = true;
  const panelVariants = isSidePanel
    ? {
        hidden: { opacity: 0, x: 24 },
        visible: { opacity: 1, x: 0 },
      }
    : {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
      };

  useEffect(() => {
    if (selectedFinalizedFeature?.kind === "course") {
      setActiveTab("コース");
    }
    if (selectedFinalizedFeature?.kind === "lift") {
      setActiveTab("リフト");
    }
  }, [selectedFinalizedFeature]);

  useBodyScrollLock();
  const shouldRenderMobilePanel = isSidePanel || mobileContentTab === "info";
  const mobilePanelPositionProps =
    mobilePresentation === "inline"
      ? {
          position: "relative" as const,
          h: "100%",
        }
      : {
          position: "fixed" as const,
          top: "calc(env(safe-area-inset-top, 0px) + 6.75rem)",
          left: 0,
          right: 0,
          bottom: 0,
        };

  if (isLoading || !resortData) {
    return (
      <>
        {isSidePanel && (
          <Portal>
            <Flex
              position="fixed"
              inset={0}
              zIndex={99999}
              display={{ base: "none", md: "flex" }}
              alignItems="center"
              justifyContent="flex-end"
              p={0}
              pointerEvents="none"
            >
              <MotionBox
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                position="absolute"
                inset={0}
                bg="transparent"
                backdropFilter="none"
                pointerEvents="none"
                aria-hidden="true"
              />
              <MotionBox
                data-ski-resort-detail-panel="true"
                variants={panelVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                position="relative"
                zIndex={10}
                display="flex"
                h="100%"
                maxH="none"
                w="min(720px, 70vw)"
                maxW="none"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                overflow="hidden"
                bg="white"
                border="1px solid"
                borderColor="gray.200"
                boxShadow="2xl"
                borderRadius="0"
                pointerEvents="auto"
              >
                <LoadingSpinner text="読み込み中..." />
              </MotionBox>
            </Flex>
          </Portal>
        )}
        {!isSidePanel && shouldRenderMobilePanel && (
          <Box
            data-ski-resort-detail-panel="true"
            {...mobilePanelPositionProps}
            zIndex={200000}
            display="flex"
            alignItems="center"
            justifyContent="center"
            bg="white"
          >
            <LoadingSpinner text="読み込み中..." />
          </Box>
        )}
      </>
    );
  }

  const resort = resortData;
  const images = [
    ...(resort.outlineImages || []),
    ...(resort.courseImages || []),
  ];
  const resortInfo = {
    id: resort.id,
    nameJa: resort.nameJa,
    prefecture: resort.prefecture,
    town: resort.town,
    descriptionShort: resort.descriptionShort,
    yukiMagi: resort.yukiMagi,
  };
  const mobileDetailHeader = (
    <>
      {!hideMobileInfoSection && (
        <InfoSection
          resort={resortInfo}
          finalizedOperationSummary={resort.finalizedOperationSummary}
          isCompareSelected={isCompareSelected}
          onToggleCompare={onToggleCompare}
          onClose={onClose}
        />
      )}
      <MobileResortMapPreview
        DynamicMap={DynamicMap}
        resort={resort}
        mapResorts={mapResorts}
        selectedFinalizedFeature={selectedFinalizedFeature}
        selectedElevationProfilePoint={selectedElevationProfilePoint}
        onSelectedFinalizedFeatureChange={onSelectedFinalizedFeatureChange}
        onSelectedElevationProfilePointChange={
          onSelectedElevationProfilePointChange
        }
      />
    </>
  );
  const desktopDetailHeader = (
    <>
      <InfoSection
        resort={resortInfo}
        finalizedOperationSummary={resort.finalizedOperationSummary}
        isCompareSelected={isCompareSelected}
        onToggleCompare={onToggleCompare}
        onClose={onClose}
      />
      <ImageCarousel images={images} alt={resort.nameJa} />
    </>
  );
  const detailPanelContent = (
    <>
      <Box
        flexGrow={1}
        overflowY={canScrollDetailContent ? "auto" : "hidden"}
        className="custom-scroll"
      >
        {isSidePanel ? desktopDetailHeader : mobileDetailHeader}
        <DetailTabs
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <Box p={{ base: 4, md: 8 }} color="gray.800">
          {activeTab === "概要" && <OverviewTab resort={resort} />}
          {activeTab === "コース" && (
            <CoursesTab
              resort={resort}
              finalizedMapData={resortData?.finalizedMapData ?? null}
              selectedFinalizedFeature={selectedFinalizedFeature}
              selectedElevationProfilePoint={selectedElevationProfilePoint}
              onSelectedFinalizedFeatureChange={
                onSelectedFinalizedFeatureChange
              }
              onSelectedElevationProfilePointChange={
                onSelectedElevationProfilePointChange
              }
            />
          )}
          {activeTab === "リフト" && (
            <LiftsTab
              resort={resort}
              finalizedMapData={resortData?.finalizedMapData ?? null}
              selectedFinalizedFeature={selectedFinalizedFeature}
              onSelectedFinalizedFeatureChange={
                onSelectedFinalizedFeatureChange
              }
            />
          )}
          {activeTab === "チケット" && <TicketsTab resort={resort} />}
          {activeTab === "気候" && <WeatherTab resort={resort} />}
        </Box>
      </Box>
    </>
  );

  return (
    <>
      {isSidePanel && (
        <Portal>
          <Flex
            position="fixed"
            inset={0}
            zIndex={100000}
            alignItems="center"
            justifyContent="flex-end"
            p={0}
            pointerEvents="none"
          >
            <MotionBox
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              position="absolute"
              inset={0}
              bg="transparent"
              backdropFilter="none"
              pointerEvents="none"
              aria-hidden="true"
            />
            <MotionBox
              data-ski-resort-detail-panel="true"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ type: "tween", duration: 0.18, ease: "easeOut" }}
              position="relative"
              zIndex={10}
              display="flex"
              h="100%"
              maxH="none"
              w="min(720px, 70vw)"
              maxW="none"
              flexDirection="column"
              overflow="hidden"
              bg="white"
              border="1px solid"
              borderColor="gray.200"
              boxShadow="2xl"
              borderRadius="0"
              pointerEvents="auto"
            >
              {detailPanelContent}
            </MotionBox>
          </Flex>
        </Portal>
      )}
      {!isSidePanel && shouldRenderMobilePanel && (
        <Box
          data-ski-resort-detail-panel="true"
          {...mobilePanelPositionProps}
          zIndex={200000}
          display="flex"
          flexDirection="column"
          overflow="hidden"
          bg="white"
          borderTop="1px solid"
          borderColor="gray.100"
        >
          <Box
            position="relative"
            display="flex"
            h="100%"
            minH={0}
            flexDirection="column"
            overflow="hidden"
          >
            {detailPanelContent}
          </Box>
        </Box>
      )}
    </>
  );
};

// --- 子コンポーネント群 ---
