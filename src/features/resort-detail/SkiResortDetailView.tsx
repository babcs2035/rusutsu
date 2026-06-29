"use client";

import {
  Box,
  Button,
  Flex,
  Portal,
  useBreakpointValue,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type {
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";
import type { SelectedMapFeature } from "@/features/map/JapanResortMap";
import type { ElevationProfileMapPoint } from "@/features/map/types";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import type { NullableSkiResortDetail } from "@/types/skiResorts";
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
};

const TABS = ["概要", "コース", "リフト", "チケット", "気候"];

const MotionBox = motion.create(Box);
const BOTTOM_SHEET_EXPANDED_SNAP_POINT = 0.94;
const BOTTOM_SHEET_SNAP_POINTS = [
  0.12,
  0.52,
  BOTTOM_SHEET_EXPANDED_SNAP_POINT,
] as const;
const BOTTOM_SHEET_INITIAL_SNAP_POINT = BOTTOM_SHEET_SNAP_POINTS[1];
const MOBILE_DETAIL_SHEET_Z_INDEX = 300000;
const isBottomSheetExpanded = (snapPoint: number | string | null) =>
  typeof snapPoint === "number" &&
  Math.abs(snapPoint - BOTTOM_SHEET_EXPANDED_SNAP_POINT) < 0.001;
const VISUALLY_HIDDEN_STYLE: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  border: 0,
};
const BOTTOM_SHEET_CONTENT_STYLE: React.CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: MOBILE_DETAIL_SHEET_Z_INDEX,
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  borderTopLeftRadius: "1.5rem",
  borderTopRightRadius: "1.5rem",
  backgroundColor: "rgba(255, 255, 255, 0.98)",
  borderTop: "1px solid rgba(0, 0, 0, 0.05)",
  boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.14)",
};
const BOTTOM_SHEET_HANDLE_STYLE: React.CSSProperties = {
  width: "4rem",
  height: "0.375rem",
  flexShrink: 0,
  borderRadius: "999px",
  backgroundColor: "#d1d5db",
  margin: "0.5rem auto 0.125rem",
};

/**
 * スキー場の詳細情報を表示するレスポンシブ対応モーダル
 */
export const SkiResortDetailView = ({
  resortData,
  isLoading,
  isCompareSelected,
  sheetSnapPoint,
  setSheetSnapPoint,
  onToggleCompare,
  selectedFinalizedFeature,
  selectedElevationProfilePoint,
  onSelectedFinalizedFeatureChange,
  onSelectedElevationProfilePointChange,
  onClose,
}: Props) => {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const sheetContentTouchStartYRef = useRef<number | null>(null);
  const isSidePanel =
    useBreakpointValue({ base: false, md: true }, { ssr: false }) ?? false;
  const canScrollDetailContent =
    isSidePanel || isBottomSheetExpanded(sheetSnapPoint);
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

  const expandSheetFromContentScroll = useCallback(() => {
    if (isSidePanel || isBottomSheetExpanded(sheetSnapPoint)) return;

    setSheetSnapPoint(BOTTOM_SHEET_EXPANDED_SNAP_POINT);
  }, [isSidePanel, setSheetSnapPoint, sheetSnapPoint]);
  const handleDetailContentWheelCapture = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (canScrollDetailContent || event.deltaY <= 0) return;

      event.preventDefault();
      expandSheetFromContentScroll();
    },
    [canScrollDetailContent, expandSheetFromContentScroll],
  );
  const handleDetailContentTouchStartCapture = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      sheetContentTouchStartYRef.current = event.touches[0]?.clientY ?? null;
    },
    [],
  );
  const handleDetailContentTouchMoveCapture = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (canScrollDetailContent) return;

      const startY = sheetContentTouchStartYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (startY == null || currentY == null || startY - currentY < 8) return;

      event.preventDefault();
      expandSheetFromContentScroll();
    },
    [canScrollDetailContent, expandSheetFromContentScroll],
  );

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
        {!isSidePanel && (
          <Box>
            <Drawer.Root
              open
              onOpenChange={open => {
                if (!open) onClose();
              }}
              activeSnapPoint={sheetSnapPoint}
              setActiveSnapPoint={setSheetSnapPoint}
              snapPoints={[...BOTTOM_SHEET_SNAP_POINTS]}
              modal={false}
              noBodyStyles
            >
              <Drawer.Portal>
                <Drawer.Content
                  data-ski-resort-detail-panel="true"
                  style={BOTTOM_SHEET_CONTENT_STYLE}
                >
                  <Drawer.Title style={VISUALLY_HIDDEN_STYLE}>
                    スキー場詳細
                  </Drawer.Title>
                  <Drawer.Handle style={BOTTOM_SHEET_HANDLE_STYLE} />
                  <Flex
                    h="calc(100vh - var(--snap-point-height, 0px) - 38px)"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <LoadingSpinner text="読み込み中..." />
                  </Flex>
                </Drawer.Content>
              </Drawer.Portal>
            </Drawer.Root>
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
  const mobileDetailHeader = (
    <>
      <InfoSection
        resort={resort}
        isCompareSelected={isCompareSelected}
        onToggleCompare={onToggleCompare}
        onClose={onClose}
      />
      <ImageCarousel images={images} alt={resort.nameJa} />
    </>
  );
  const desktopDetailHeader = (
    <>
      <ImageCarousel images={images} alt={resort.nameJa} />
      <InfoSection
        resort={resort}
        isCompareSelected={isCompareSelected}
        onToggleCompare={onToggleCompare}
        onClose={onClose}
      />
    </>
  );
  const detailPanelContent = (
    <>
      {isSidePanel && (
        <Button
          onClick={onClose}
          position="absolute"
          top={4}
          right={4}
          zIndex={20}
          display="flex"
          h={10}
          w={10}
          alignItems="center"
          justifyContent="center"
          borderRadius="full"
          bg="white"
          border="1px solid"
          borderColor="gray.200"
          fontSize="xl"
          color="gray.600"
          boxShadow="sm"
          _hover={{
            bg: "gray.50",
            color: "gray.900",
            transform: "scale(1.05)",
          }}
          _focus={{ outline: "none", ring: "2px", ringColor: "brand.400" }}
          minW="auto"
          p={0}
          transition="all 0.2s"
        >
          ✕
        </Button>
      )}
      <Box
        flexGrow={1}
        overflowY={canScrollDetailContent ? "auto" : "hidden"}
        className="custom-scroll"
        onTouchMoveCapture={handleDetailContentTouchMoveCapture}
        onTouchStartCapture={handleDetailContentTouchStartCapture}
        onWheelCapture={handleDetailContentWheelCapture}
      >
        {!isSidePanel && isBottomSheetExpanded(sheetSnapPoint) && (
          <Flex
            position="sticky"
            top={0}
            zIndex={20}
            justifyContent="center"
            bg="rgba(255, 255, 255, 0.96)"
            backdropFilter="blur(12px)"
            py={1}
          >
            <Button
              type="button"
              aria-label="詳細を中間位置に戻す"
              onClick={() => setSheetSnapPoint(BOTTOM_SHEET_INITIAL_SNAP_POINT)}
              display="flex"
              h={9}
              w={12}
              minW="auto"
              alignItems="center"
              justifyContent="center"
              borderRadius="full"
              bg="gray.100"
              color="gray.700"
              p={0}
              _hover={{ bg: "gray.200", color: "gray.900" }}
              _focus={{ outline: "none", ring: "2px", ringColor: "brand.400" }}
            >
              <ChevronDown size={22} strokeWidth={2.8} />
            </Button>
          </Flex>
        )}
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
      {!isSidePanel && (
        <Box>
          <Drawer.Root
            open
            onOpenChange={open => {
              if (!open) onClose();
            }}
            activeSnapPoint={sheetSnapPoint}
            setActiveSnapPoint={setSheetSnapPoint}
            snapPoints={[...BOTTOM_SHEET_SNAP_POINTS]}
            modal={false}
            noBodyStyles
          >
            <Drawer.Portal>
              <Drawer.Content
                data-ski-resort-detail-panel="true"
                style={BOTTOM_SHEET_CONTENT_STYLE}
              >
                <Drawer.Title style={VISUALLY_HIDDEN_STYLE}>
                  {resort.nameJa}
                </Drawer.Title>
                <Drawer.Handle style={BOTTOM_SHEET_HANDLE_STYLE} />
                <Box
                  position="relative"
                  display="flex"
                  h="calc(100vh - var(--snap-point-height, 0px) - 38px)"
                  flexDirection="column"
                  overflow="hidden"
                >
                  {detailPanelContent}
                </Box>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>
        </Box>
      )}
    </>
  );
};

// --- 子コンポーネント群 ---
