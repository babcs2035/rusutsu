"use client";

import {
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  Link,
  List,
  NativeSelect,
  Portal,
  Table,
  Text,
  useBreakpointValue,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import { ArrowLeft, Check, ChevronDown, Plus } from "lucide-react";
import Image from "next/image";
import type {
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";
import type { SelectedMapFeature } from "@/components/SkiResortMap";
import {
  COURSE_DIFFICULTY_META,
  type FinalizedLiftFeature,
  type FinalizedResortMapData,
  type GeoCoordinate,
  getCourseDifficulty,
} from "@/lib/finalizedResortGeojsonShared";
import type {
  NullableSkiResortDetail,
  SkiResortDetail,
} from "@/types/skiResorts";
import type { SnowDepthsT } from "@/types/weathers";
import { LoadingSpinner } from "./LoadingSpinner";
import { SnowDepthLineChart, SnowForecastEmbed } from "./WeatherChart";

type Props = {
  resortData: NullableSkiResortDetail | null;
  isLoading: boolean;
  isCompareSelected: boolean;
  sheetSnapPoint: number | string | null;
  setSheetSnapPoint: (snapPoint: number | string | null) => void;
  onToggleCompare: (id: string, selected: boolean) => void;
  selectedFinalizedFeature: SelectedMapFeature | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
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
  onSelectedFinalizedFeatureChange,
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

  // モーダル表示時にスクロールを防止
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

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
        <Flex
          as="nav"
          position="sticky"
          top={0}
          zIndex={10}
          borderBottom="1px solid"
          borderColor="gray.100"
          bg="rgba(255, 255, 255, 0.95)"
          backdropFilter="blur(16px)"
          overflowX="auto"
          css={{
            "&::-webkit-scrollbar": { display: "none" },
            msOverflowStyle: "none",
            scrollbarWidth: "none",
          }}
        >
          {TABS.map(tab => (
            <Button
              key={tab}
              onClick={() => setActiveTab(tab)}
              flex={{ base: "1 0 80px", md: "1 0 96px" }}
              py={4}
              px={{ base: 4, md: 2 }}
              textAlign="center"
              fontSize={{ base: "sm", md: "md" }}
              fontWeight="700"
              bg="transparent"
              borderRadius={0}
              borderBottom={activeTab === tab ? "2px solid" : "none"}
              borderColor={activeTab === tab ? "brand.500" : "transparent"}
              color={activeTab === tab ? "brand.600" : "gray.500"}
              _hover={{ bg: "gray.50", color: "brand.600" }}
              transition="all 0.2s"
            >
              {tab}
            </Button>
          ))}
        </Flex>
        <Box p={{ base: 4, md: 8 }} color="gray.800">
          {activeTab === "概要" && <OverviewTab resort={resort} />}
          {activeTab === "コース" && (
            <CoursesTab
              resort={resort}
              finalizedMapData={resortData?.finalizedMapData ?? null}
              selectedFinalizedFeature={selectedFinalizedFeature}
              onSelectedFinalizedFeatureChange={
                onSelectedFinalizedFeatureChange
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

const ImageCarousel = ({ images, alt }: { images: string[]; alt: string }) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = useCallback(
    () => setCurrentSlide(s => (s === images.length - 1 ? 0 : s + 1)),
    [images.length],
  );
  const prevSlide = useCallback(
    () => setCurrentSlide(s => (s === 0 ? images.length - 1 : s - 1)),
    [images.length],
  );

  useEffect(() => {
    if (!images || images.length <= 1) return;
    const interval = setInterval(nextSlide, 4000);
    return () => clearInterval(interval);
  }, [images, nextSlide]);

  if (!images || images.length === 0)
    return (
      <Box
        h={{ base: "160px", md: "256px" }}
        w="100%"
        flexShrink={0}
        bg="#d1d5db"
      />
    );

  return (
    <Box
      position="relative"
      h={{ base: "160px", md: "256px" }}
      w="100%"
      flexShrink={0}
      overflow="hidden"
    >
      <Flex
        h="100%"
        w="100%"
        transition="transform 0.7s ease-in-out"
        style={{ transform: `translateX(-${currentSlide * 100}%)` }}
      >
        {images.map((src: string) => (
          <Box key={src} position="relative" h="100%" w="100%" flexShrink={0}>
            <Image
              src={src}
              alt={alt}
              fill
              style={{ objectFit: "contain" }}
              unoptimized
              priority
            />
          </Box>
        ))}
      </Flex>
      {images.length > 1 && (
        <>
          <Button
            onClick={prevSlide}
            position="absolute"
            left={3}
            top="50%"
            transform="translateY(-50%)"
            display="flex"
            h={7}
            w={7}
            alignItems="center"
            justifyContent="center"
            borderRadius="full"
            bg="blackAlpha.500"
            fontSize="2xl"
            color="white"
            boxShadow="lg"
            backdropFilter="blur(4px)"
            _hover={{
              bg: "blackAlpha.700",
              transform: "translateY(-50%) scale(1.1)",
            }}
            _focus={{
              outline: "none",
              ring: "2px",
              ringColor: "whiteAlpha.500",
            }}
            minW="auto"
            p={0}
            aria-label="前の画像"
          >
            ‹
          </Button>
          <Button
            onClick={nextSlide}
            position="absolute"
            right={3}
            top="50%"
            transform="translateY(-50%)"
            display="flex"
            h={7}
            w={7}
            alignItems="center"
            justifyContent="center"
            borderRadius="full"
            bg="blackAlpha.500"
            fontSize="2xl"
            color="white"
            boxShadow="lg"
            backdropFilter="blur(4px)"
            _hover={{
              bg: "blackAlpha.700",
              transform: "translateY(-50%) scale(1.1)",
            }}
            _focus={{
              outline: "none",
              ring: "2px",
              ringColor: "whiteAlpha.500",
            }}
            minW="auto"
            p={0}
            aria-label="次の画像"
          >
            ›
          </Button>
        </>
      )}
    </Box>
  );
};

type Resort = SkiResortDetail;

type FinalizedCourseGroup = {
  id: string;
  displayName: string;
  courses: NonNullable<FinalizedResortMapData["courses"]>["features"];
};

type ElevationProfilePoint = {
  distance: number;
  elevation: number;
  slope: number | null;
};

const normalizeIconSymbol = (value: string | null | undefined) => {
  if (!value) return null;
  if (/[○〇◯]/u.test(value)) return "○";
  if (/[△]/u.test(value)) return "△";
  if (/[×✕✖]/u.test(value)) return "×";
  return null;
};

const formatCourseStatus = (status: string | null | undefined) => {
  const symbol = normalizeIconSymbol(status);
  if (symbol === "○") return "全面滑走可";
  if (symbol === "△") return "一部滑走可";
  if (symbol === "×") return "クローズ";
  return status ?? "--";
};

const formatLiftStatus = (status: string | null | undefined) => {
  const symbol = normalizeIconSymbol(status);
  if (symbol === "○") return "運行中";
  if (symbol === "△") return "準備中・待機中";
  if (symbol === "×") return "運休";
  return status ?? "--";
};

const formatPisteStatus = (piste: string | null | undefined) => {
  const symbol = normalizeIconSymbol(piste);
  if (symbol === "○") return "圧雪";
  if (symbol === "△") return "一部圧雪";
  if (symbol === "×") return "非圧雪";
  return piste ?? "--";
};

const formatMeters = (value: number | null | undefined) =>
  value == null ? "--" : `${Math.round(value).toLocaleString()}m`;

const formatDegree = (value: number | null | undefined) =>
  value == null ? "--" : `${value.toFixed(1)}°`;

const getLiftElevationDiff = (lift: FinalizedLiftFeature) => {
  if (lift.properties.elevationDiffMap != null) {
    return lift.properties.elevationDiffMap;
  }

  const first = lift.coordinates[0]?.[2];
  const last = lift.coordinates[lift.coordinates.length - 1]?.[2];
  if (typeof first === "number" && typeof last === "number") {
    return Math.abs(last - first);
  }

  return lift.properties.vertical;
};

const maxNullable = (values: Array<number | null | undefined>) => {
  const numericValues = values.filter(
    (value): value is number => typeof value === "number",
  );
  return numericValues.length > 0 ? Math.max(...numericValues) : null;
};

const averageNullable = (values: Array<number | null | undefined>) => {
  const numericValues = values.filter(
    (value): value is number => typeof value === "number",
  );
  if (numericValues.length === 0) return null;
  return (
    numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
  );
};

const createFinalizedCourseGroups = (
  courses: NonNullable<FinalizedResortMapData["courses"]>["features"],
): FinalizedCourseGroup[] => {
  const groups = new Map<string, FinalizedCourseGroup>();
  for (const course of courses) {
    const current = groups.get(course.groupId);
    if (current) {
      current.courses.push(course);
    } else {
      groups.set(course.groupId, {
        id: course.groupId,
        displayName: course.displayName,
        courses: [course],
      });
    }
  }
  return [...groups.values()];
};

const haversineMeters = (a: GeoCoordinate, b: GeoCoordinate) => {
  const radius = 6371000;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const createElevationProfile = (
  coordinates: GeoCoordinate[],
  slopeDeg: number[] | null = null,
): ElevationProfilePoint[] => {
  if (!coordinates.every(coordinate => coordinate.length >= 3)) return [];

  const shouldReverse =
    (coordinates[0][2] ?? 0) < (coordinates[coordinates.length - 1][2] ?? 0);
  const displayCoordinates = shouldReverse
    ? [...coordinates].reverse()
    : coordinates;
  const displaySlopes =
    shouldReverse && slopeDeg?.length === coordinates.length
      ? [...slopeDeg].reverse()
      : slopeDeg;

  let distance = 0;
  return displayCoordinates.map((coordinate, index) => {
    if (index > 0) {
      distance += haversineMeters(displayCoordinates[index - 1], coordinate);
    }

    return {
      distance,
      elevation: coordinate[2] as number,
      slope:
        displaySlopes && displaySlopes.length === displayCoordinates.length
          ? displaySlopes[index]
          : null,
    };
  });
};

const ElevationProfile = ({
  points,
  showSlope,
}: {
  points: ElevationProfilePoint[];
  showSlope: boolean;
}) => {
  if (points.length < 2) return null;

  const width = 420;
  const height = 132;
  const padding = 14;
  const maxDistance = Math.max(...points.map(point => point.distance));
  const minElevation = Math.min(...points.map(point => point.elevation));
  const maxElevation = Math.max(...points.map(point => point.elevation));
  const elevationRange = Math.max(1, maxElevation - minElevation);
  const toX = (distance: number) =>
    padding + (distance / Math.max(1, maxDistance)) * (width - padding * 2);
  const toY = (elevation: number) =>
    height -
    padding -
    ((elevation - minElevation) / elevationRange) * (height - padding * 2);
  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${toX(point.distance).toFixed(1)} ${toY(
          point.elevation,
        ).toFixed(1)}`,
    )
    .join(" ");
  const steepestPoint =
    showSlope && points.some(point => point.slope != null)
      ? points.reduce((best, point) =>
          (point.slope ?? -Infinity) > (best.slope ?? -Infinity) ? point : best,
        )
      : null;

  return (
    <Box
      border="1px solid"
      borderColor="gray.200"
      borderRadius="lg"
      bg="white"
      p={4}
    >
      <Text mb={2} fontSize="sm" fontWeight="900" color="gray.900">
        標高プロファイル
      </Text>
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", width: "100%" }}
      >
        <path
          d={path}
          fill="none"
          stroke="#2563EB"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={4}
        />
      </svg>
      <Grid templateColumns={{ base: "1fr", sm: "repeat(3, 1fr)" }} gap={3}>
        <Box>
          <Text color="gray.500" fontSize="xs" fontWeight="700">
            距離
          </Text>
          <Text fontWeight="900">{formatMeters(maxDistance)}</Text>
        </Box>
        <Box>
          <Text color="gray.500" fontSize="xs" fontWeight="700">
            標高差
          </Text>
          <Text fontWeight="900">
            {formatMeters(maxElevation - minElevation)}
          </Text>
        </Box>
        {steepestPoint && (
          <Box>
            <Text color="gray.500" fontSize="xs" fontWeight="700">
              最大付近
            </Text>
            <Text fontWeight="900">
              {Math.round(steepestPoint.slope ?? 0)}°
            </Text>
          </Box>
        )}
      </Grid>
    </Box>
  );
};

const InfoSection = ({
  resort,
  isCompareSelected,
  onToggleCompare,
  onClose,
}: {
  resort: Resort;
  isCompareSelected: boolean;
  onToggleCompare: (id: string, selected: boolean) => void;
  onClose: () => void;
}) => (
  <Box
    bg="transparent"
    pt={{ base: 1.5, md: 8 }}
    pr={{ base: 4, md: 8 }}
    pb={{ base: 3, md: 8 }}
    pl={{ base: 4, md: 8 }}
    borderBottom="1px solid"
    borderColor="gray.200"
  >
    <Flex alignItems="flex-start" justifyContent="space-between" gap={2}>
      <Heading
        flex="1 1 auto"
        minW={0}
        color="gray.900"
        fontFamily="var(--font-heading)"
        fontSize={{ base: "1.25rem", md: "2.5rem" }}
        lineHeight={{ base: "1.18", md: "1.16" }}
      >
        {resort.nameJa}
      </Heading>
      <Flex
        display={{ base: "flex", md: "none" }}
        flex="0 0 auto"
        alignItems="center"
        gap={2}
      >
        <Button
          size="xs"
          flex="0 0 5.75rem"
          w="5.75rem"
          h="28px"
          minW="5.75rem"
          px={2}
          borderRadius="md"
          gap={1}
          fontSize="0.68rem"
          fontWeight="800"
          color={isCompareSelected ? "white" : "brand.600"}
          bg={isCompareSelected ? "brand.500" : "white"}
          border="1px solid"
          borderColor={isCompareSelected ? "brand.400" : "brand.500"}
          aria-pressed={isCompareSelected}
          aria-label={`${resort.nameJa}を${
            isCompareSelected ? "比較から外す" : "比較に追加"
          }`}
          _hover={{
            bg: isCompareSelected ? "brand.600" : "brand.50",
          }}
          onClick={() => onToggleCompare(resort.id, !isCompareSelected)}
        >
          <Box
            as={isCompareSelected ? Check : Plus}
            boxSize="12px"
            strokeWidth={3}
          />
          <Box as="span">
            {isCompareSelected ? "比較から外す" : "比較に追加"}
          </Box>
        </Button>
        <Button
          onClick={onClose}
          h={10}
          w={10}
          minW={10}
          flex="0 0 auto"
          alignItems="center"
          justifyContent="center"
          borderRadius="full"
          bg="white"
          border="1px solid"
          borderColor="gray.200"
          fontSize="xl"
          color="gray.600"
          boxShadow="sm"
          _hover={{ bg: "gray.50", color: "gray.900" }}
          _focus={{ outline: "none", ring: "2px", ringColor: "brand.400" }}
          p={0}
          aria-label="詳細を閉じる"
        >
          ✕
        </Button>
      </Flex>
    </Flex>
    <Flex
      display={{ base: "none", md: "flex" }}
      mt={4}
      alignItems="center"
      gap={3}
      wrap="wrap"
    >
      <Button
        size="xs"
        w="100px"
        minW="100px"
        h="var(--chakra-sizes-8)"
        px={2}
        borderRadius="md"
        gap={1.5}
        fontWeight="800"
        color={isCompareSelected ? "white" : "brand.600"}
        bg={isCompareSelected ? "brand.500" : "white"}
        border="1px solid"
        borderColor="brand.500"
        aria-pressed={isCompareSelected}
        aria-label={`${resort.nameJa}を${
          isCompareSelected ? "比較から外す" : "比較に追加"
        }`}
        _hover={{
          bg: isCompareSelected ? "brand.600" : "brand.50",
        }}
        onClick={() => onToggleCompare(resort.id, !isCompareSelected)}
      >
        <Box
          as={isCompareSelected ? Check : Plus}
          boxSize="16px"
          strokeWidth={3}
        />
        {isCompareSelected ? "比較から外す" : "比較に追加"}
      </Button>
    </Flex>
    <Text mt={2.5} fontSize="sm" color="brand.600" fontWeight="700">
      {resort.prefecture} • {resort.town}
    </Text>
    <Text
      mt={{ base: 3, md: 4 }}
      color="gray.600"
      fontSize={{ base: "0.95rem", md: "md" }}
      lineHeight={{ base: "1.45", md: "1.6" }}
      w={{ base: "100%", md: "80%" }}
    >
      {resort.descriptionShort}
    </Text>
    <Grid
      mt={{ base: 4, md: 8 }}
      templateColumns={{
        base: "repeat(2, 1fr)",
        md: resort.yukiMagi ? "repeat(4, 1fr)" : "repeat(3, 1fr)",
      }}
      gap={{ base: 2, md: 5 }}
      textAlign="center"
    >
      <StatCard title="コンディション" value={resort.condition || "--"} />
      <StatCard title="営業状況" value={resort.status || "--"} />
      <StatCard title="評価" value={resort.review?.toFixed(1) || "--"} />
      {resort.yukiMagi && (
        <StatCard title="雪マジ" value="対象" valueColor="pink.500" />
      )}
    </Grid>
  </Box>
);

const OverviewTab = ({ resort }: { resort: Resort }) => (
  <Flex flexDirection="column" gap={10}>
    {resort.yukiMagi && (
      <Box
        as="section"
        bg="pink.50"
        p={6}
        borderRadius="2xl"
        border="1px solid"
        borderColor="pink.200"
      >
        <Flex alignItems="center" gap={3} mb={4}>
          <Heading size="md" color="pink.600" fontWeight="700">
            雪マジ！情報
          </Heading>
          {resort.yukiMagi.tag && (
            <Box
              px={3}
              py={1}
              bg="pink.100"
              color="pink.700"
              fontSize="xs"
              fontWeight="bold"
              borderRadius="full"
            >
              {resort.yukiMagi.tag}
            </Box>
          )}
        </Flex>

        <Flex flexDirection="column" gap={4}>
          {resort.yukiMagi.benefit && (
            <Box>
              <Text fontWeight="700" fontSize="xs" color="pink.700">
                特典内容
              </Text>
              <Text mt={1} fontSize="sm" color="gray.800" whiteSpace="pre-wrap">
                {resort.yukiMagi.benefit}
              </Text>
            </Box>
          )}
          {resort.yukiMagi.period && (
            <Box>
              <Text fontWeight="700" fontSize="xs" color="pink.700">
                利用期間
              </Text>
              <Text mt={1} fontSize="sm" color="gray.800" whiteSpace="pre-wrap">
                {resort.yukiMagi.period}
              </Text>
            </Box>
          )}
          {resort.yukiMagi.exclusionDate && (
            <Box>
              <Text fontWeight="700" fontSize="xs" color="pink.700">
                除外日
              </Text>
              <Text mt={1} fontSize="sm" color="gray.800" whiteSpace="pre-wrap">
                {resort.yukiMagi.exclusionDate}
              </Text>
            </Box>
          )}
          {resort.yukiMagi.url && (
            <Link
              href={resort.yukiMagi.url}
              target="_blank"
              fontSize="xs"
              color="brand.600"
              textDecoration="underline"
              _hover={{
                color: "brand.700",
              }}
              display="inline-block"
              mt={2}
            >
              公式サイトで詳細を見る
            </Link>
          )}
        </Flex>
      </Box>
    )}
    <Box as="section">
      <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
        概要
      </Heading>
      <Text
        mt={4}
        whiteSpace="pre-wrap"
        color="gray.700"
        lineHeight="1.8"
        fontSize="md"
      >
        {resort.descriptionLong}
      </Text>
    </Box>
    <Box as="section">
      <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
        営業時間
      </Heading>
      <Box
        mt={4}
        w="100%"
        overflowX="auto"
        borderRadius="xl"
        border="1px solid"
        borderColor="gray.200"
        bg="white"
      >
        <Table.Root size="md">
          <Table.Header>
            <Table.Row bg="gray.100">
              <Table.ColumnHeader
                px={6}
                py={4}
                color="gray.600"
                fontWeight="700"
                fontSize="sm"
              >
                区分
              </Table.ColumnHeader>
              <Table.ColumnHeader
                px={6}
                py={4}
                color="gray.600"
                fontWeight="700"
                fontSize="sm"
              >
                時間
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row borderColor="gray.200">
              <Table.Cell px={6} py={4} fontWeight="700" color="gray.800">
                平日
              </Table.Cell>
              <Table.Cell px={6} py={4} color="gray.600">
                {resort.weekdayOpen} - {resort.weekdayClose}
              </Table.Cell>
            </Table.Row>
            <Table.Row borderColor="transparent">
              <Table.Cell px={6} py={4} fontWeight="700" color="gray.800">
                土日祝
              </Table.Cell>
              <Table.Cell px={6} py={4} color="gray.600">
                {resort.weekendOpen} - {resort.weekendClose}
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </Box>
      {resort.timesComment && (
        <Text mt={3} fontSize="sm" color="gray.500" fontStyle="italic">
          * {resort.timesComment}
        </Text>
      )}
    </Box>

    <Box as="section">
      <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
        リンク
      </Heading>
      <List.Root as="ul" mt={4} listStyleType="none" gap={3}>
        {resort.website && (
          <List.Item as="li">
            <Link
              href={resort.website}
              target="_blank"
              rel="noopener noreferrer"
              color="brand.600"
              display="flex"
              alignItems="center"
              gap={2}
              _hover={{
                color: "brand.700",
                textDecoration: "underline",
              }}
              transition="all 0.2s"
            >
              <Box as="span" h={2} w={2} borderRadius="full" bg="brand.500" />{" "}
              公式サイト
            </Link>
          </List.Item>
        )}
        {resort.sources.map((src: string) => (
          <List.Item key={src} as="li">
            <Link
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              color="gray.600"
              display="flex"
              alignItems="center"
              gap={2}
              _hover={{ color: "brand.600", textDecoration: "underline" }}
              transition="all 0.2s"
            >
              <Box as="span" h={2} w={2} borderRadius="full" bg="gray.400" />{" "}
              {new URL(src).hostname}
            </Link>
          </List.Item>
        ))}
      </List.Root>
    </Box>
  </Flex>
);

const CoursesTab = ({
  resort,
  finalizedMapData,
  selectedFinalizedFeature,
  onSelectedFinalizedFeatureChange,
}: {
  resort: Resort;
  finalizedMapData: FinalizedResortMapData | null;
  selectedFinalizedFeature: SelectedMapFeature | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
}) => {
  const finalizedCourses = finalizedMapData?.courses?.features ?? [];
  const finalizedCourseGroups = useMemo(
    () => createFinalizedCourseGroups(finalizedCourses),
    [finalizedCourses],
  );
  const selectedFinalizedCourseGroup =
    selectedFinalizedFeature?.kind === "course"
      ? (finalizedCourseGroups.find(
          group => group.id === selectedFinalizedFeature.id,
        ) ?? null)
      : null;
  const selectedFinalizedCourse =
    selectedFinalizedCourseGroup?.courses[0] ?? null;
  const courses = resort.courses;
  const [difficultyFilter, setDifficultyFilter] = useState("全て");
  const [sortConfig, setSortConfig] = useState<{
    key: "distance";
    direction: "asc" | "desc";
  } | null>(null);

  const difficultyOptions = useMemo(
    () => [
      "全て",
      ...Array.from(
        new Set(courses.map(c => c.difficulty).filter(Boolean) as string[]),
      ),
    ],
    [courses],
  );

  const processedCourses = useMemo(() => {
    let filtered = [...courses];
    if (difficultyFilter !== "全て") {
      filtered = filtered.filter(c => c.difficulty === difficultyFilter);
    }
    if (sortConfig !== null) {
      filtered.sort((a, b) => {
        const aVal = a[sortConfig.key] || 0;
        const bVal = b[sortConfig.key] || 0;
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [courses, difficultyFilter, sortConfig]);

  if (selectedFinalizedCourseGroup && selectedFinalizedCourse) {
    const distance = selectedFinalizedCourseGroup.courses.reduce(
      (sum, course) =>
        sum +
        (course.properties.slopeDistMap ?? course.properties.distance ?? 0),
      0,
    );
    const profilePoints = createElevationProfile(
      selectedFinalizedCourse.coordinates,
      selectedFinalizedCourse.slopeDeg,
    );

    return (
      <Flex flexDirection="column" gap={5}>
        <Button
          type="button"
          alignSelf="flex-start"
          variant="ghost"
          color="gray.700"
          fontWeight="800"
          px={2}
          onClick={() => onSelectedFinalizedFeatureChange(null)}
        >
          <ArrowLeft size={18} />
          コース一覧へ戻る
        </Button>
        <Box>
          <Heading size="lg" color="gray.900">
            {selectedFinalizedCourseGroup.displayName}
          </Heading>
          <Text mt={1} color="gray.600" fontWeight="800">
            {
              COURSE_DIFFICULTY_META[
                getCourseDifficulty(selectedFinalizedCourse.properties.level)
              ].label
            }
          </Text>
        </Box>

        {selectedFinalizedCourse.properties.image && (
          <Box
            position="relative"
            h={{ base: "180px", md: "220px" }}
            w="100%"
            overflow="hidden"
            borderRadius="lg"
          >
            <Image
              src={selectedFinalizedCourse.properties.image}
              alt={selectedFinalizedCourseGroup.displayName}
              fill
              unoptimized
              style={{ objectFit: "cover" }}
            />
          </Box>
        )}

        <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }} gap={3}>
          <StatCard
            title="営業状況"
            value={formatCourseStatus(
              selectedFinalizedCourse.properties.status,
            )}
          />
          <StatCard
            title="圧雪"
            value={formatPisteStatus(selectedFinalizedCourse.properties.piste)}
          />
          <StatCard title="距離" value={formatMeters(distance)} />
          <StatCard
            title="平均斜度"
            value={formatDegree(
              averageNullable(
                selectedFinalizedCourseGroup.courses.map(
                  course => course.properties.avgSlopeDegMap,
                ),
              ),
            )}
          />
          <StatCard
            title="最大斜度"
            value={formatDegree(
              maxNullable(
                selectedFinalizedCourseGroup.courses.map(
                  course => course.properties.maxSlopeDegMap,
                ),
              ),
            )}
          />
          <StatCard
            title="区間"
            value={
              selectedFinalizedCourseGroup.courses
                .map(course => course.sectionName)
                .filter(Boolean)
                .join(" / ") || "--"
            }
          />
        </Grid>

        <ElevationProfile points={profilePoints} showSlope />

        {(selectedFinalizedCourse.properties.latestNote ||
          selectedFinalizedCourse.properties.note) && (
          <Text color="gray.700" lineHeight="1.7">
            {selectedFinalizedCourse.properties.latestNote ??
              selectedFinalizedCourse.properties.note}
          </Text>
        )}
      </Flex>
    );
  }

  if (finalizedCourseGroups.length > 0) {
    return (
      <Flex flexDirection="column" gap={6}>
        <Grid
          templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }}
          gap={4}
        >
          <StatCard
            title="総コース数"
            value={`${finalizedCourseGroups.length}`}
          />
          <StatCard
            title="最長滑走距離"
            value={formatMeters(
              Math.max(
                ...finalizedCourseGroups.map(group =>
                  group.courses.reduce(
                    (sum, course) =>
                      sum +
                      (course.properties.slopeDistMap ??
                        course.properties.distance ??
                        0),
                    0,
                  ),
                ),
              ),
            )}
          />
          <StatCard
            title="最大斜度"
            value={formatDegree(
              Math.max(
                ...finalizedCourseGroups.map(
                  group =>
                    maxNullable(
                      group.courses.map(
                        course => course.properties.maxSlopeDegMap,
                      ),
                    ) ?? 0,
                ),
              ),
            )}
          />
          <StatCard
            title="データ"
            value={finalizedMapData?.courses?.fileName ?? "--"}
          />
        </Grid>

        <Box as="section">
          <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
            コース一覧
          </Heading>
          <Box
            mt={4}
            w="100%"
            overflowX="auto"
            borderRadius="xl"
            border="1px solid"
            borderColor="gray.200"
            bg="white"
          >
            <Table.Root size="md">
              <Table.Header>
                <Table.Row bg="gray.100">
                  <Table.ColumnHeader px={6} py={4}>
                    コース名
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    難易度
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    距離
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    状況
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    圧雪
                  </Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {finalizedCourseGroups.map(group => {
                  const representative = group.courses[0];
                  const isSelected =
                    selectedFinalizedFeature?.kind === "course" &&
                    selectedFinalizedFeature.id === group.id;
                  return (
                    <Table.Row
                      key={group.id}
                      cursor="pointer"
                      bg={isSelected ? "blue.50" : "white"}
                      borderColor="gray.200"
                      _hover={{ bg: isSelected ? "blue.100" : "gray.50" }}
                      onClick={() =>
                        onSelectedFinalizedFeatureChange({
                          kind: "course",
                          id: group.id,
                        })
                      }
                    >
                      <Table.Cell
                        px={6}
                        py={4}
                        fontWeight="800"
                        whiteSpace="nowrap"
                      >
                        {group.displayName}
                        {group.courses.length > 1 && (
                          <Text as="span" ml={2} color="gray.500" fontSize="xs">
                            {group.courses
                              .map(course => course.sectionName)
                              .filter(Boolean)
                              .join(" / ")}
                          </Text>
                        )}
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        {
                          COURSE_DIFFICULTY_META[
                            getCourseDifficulty(
                              representative?.properties.level,
                            )
                          ].label
                        }
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        {formatMeters(
                          group.courses.reduce(
                            (sum, course) =>
                              sum +
                              (course.properties.slopeDistMap ??
                                course.properties.distance ??
                                0),
                            0,
                          ),
                        )}
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        {formatCourseStatus(representative?.properties.status)}
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        {formatPisteStatus(representative?.properties.piste)}
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
          </Box>
        </Box>
      </Flex>
    );
  }

  const handleSort = (key: "distance") => {
    setSortConfig(prev => ({
      key,
      direction: prev?.direction === "asc" ? "desc" : "asc",
    }));
  };

  return (
    <Flex flexDirection="column" gap={10}>
      <Box as="section">
        <Grid
          templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }}
          gap={4}
        >
          <StatCard title="総コース数" value={`${resort.numberOfCourses}`} />
          <StatCard
            title="最長滑走距離"
            value={`${resort.longestCourse?.toLocaleString() || "--"}m`}
          />
          <StatCard
            title="最大斜度"
            value={`${resort.steepestSlope || resort.angleMax || "--"}°`}
          />
          <StatCard title="標高差" value={`${resort.verticalDrop}m`} />
        </Grid>
      </Box>
      <Box as="section">
        <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
          レベル別割合
        </Heading>
        <Flex
          mt={5}
          h={6}
          w="100%"
          overflow="hidden"
          borderRadius="full"
          bg="gray.100"
          border="1px solid"
          borderColor="gray.200"
          fontSize="xs"
          fontWeight="700"
          color="white"
        >
          <Flex
            w={`${Math.max(resort.beginnersCoursesPercent, 5)}%`}
            bg="green.500"
            alignItems="center"
            justifyContent="center"
            display={resort.beginnersCoursesPercent > 0 ? "flex" : "none"}
          >
            {resort.beginnersCoursesPercent}%
          </Flex>
          <Flex
            w={`${Math.max(resort.intermediateCoursesPercent, 5)}%`}
            bg="blue.500"
            alignItems="center"
            justifyContent="center"
            display={resort.intermediateCoursesPercent > 0 ? "flex" : "none"}
          >
            {resort.intermediateCoursesPercent}%
          </Flex>
          <Flex
            w={`${Math.max(resort.advancedCoursesPercent, 5)}%`}
            bg="red.500"
            alignItems="center"
            justifyContent="center"
            display={resort.advancedCoursesPercent > 0 ? "flex" : "none"}
          >
            {resort.advancedCoursesPercent}%
          </Flex>
        </Flex>
        <Flex
          justifyContent="center"
          gap={6}
          mt={3}
          fontSize="sm"
          color="gray.600"
        >
          <Flex alignItems="center" gap={2}>
            <Box w={3} h={3} borderRadius="full" bg="green.500" /> 初級
          </Flex>
          <Flex alignItems="center" gap={2}>
            <Box w={3} h={3} borderRadius="full" bg="blue.500" /> 中級
          </Flex>
          <Flex alignItems="center" gap={2}>
            <Box w={3} h={3} borderRadius="full" bg="red.500" /> 上級
          </Flex>
        </Flex>
      </Box>
      <Box as="section">
        <Flex
          flexDirection={{ base: "column", md: "row" }}
          gap={4}
          alignItems={{ md: "center" }}
          justifyContent={{ md: "space-between" }}
        >
          <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
            コース一覧
          </Heading>
          <NativeSelect.Root
            w={{ base: "100%", md: "200px" }}
            size="md"
            variant="outline"
          >
            <NativeSelect.Field
              value={difficultyFilter}
              onChange={e => setDifficultyFilter(e.target.value)}
              bg="white"
              color="gray.800"
              borderColor="gray.200"
              _focus={{ borderColor: "brand.500" }}
            >
              {difficultyOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt === "全て" ? "すべての難易度" : opt}
                </option>
              ))}
            </NativeSelect.Field>
          </NativeSelect.Root>
        </Flex>
        <Box
          mt={4}
          w="100%"
          overflowX="auto"
          borderRadius="xl"
          border="1px solid"
          borderColor="gray.200"
          bg="white"
        >
          <Table.Root size="md">
            <Table.Header>
              <Table.Row bg="gray.100">
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  コース名
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  難易度
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  <Button
                    onClick={() => handleSort("distance")}
                    variant="ghost"
                    p={0}
                    h="auto"
                    minW="auto"
                    color="gray.600"
                    _hover={{ color: "brand.600" }}
                  >
                    距離 (m){" "}
                    {sortConfig?.key === "distance" &&
                      (sortConfig.direction === "asc" ? "▲" : "▼")}
                  </Button>
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  スノボ
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {processedCourses.map(c => (
                <Table.Row
                  key={c.id}
                  borderColor="gray.200"
                  _hover={{ bg: "gray.50" }}
                >
                  <Table.Cell
                    px={6}
                    py={4}
                    fontWeight="700"
                    color="gray.800"
                    whiteSpace="nowrap"
                  >
                    {c.name}
                  </Table.Cell>
                  <Table.Cell px={6} py={4} whiteSpace="nowrap">
                    <Box
                      as="span"
                      px={2}
                      py={1}
                      borderRadius="md"
                      bg="gray.100"
                      color="gray.700"
                      fontSize="xs"
                      whiteSpace="nowrap"
                    >
                      {c.difficulty}
                    </Box>
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.700"
                    fontFamily="mono"
                    whiteSpace="nowrap"
                  >
                    {c.distance?.toLocaleString() || "--"}
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.700"
                    whiteSpace="nowrap"
                  >
                    {c.snowboard}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      </Box>
    </Flex>
  );
};

const LiftsTab = ({
  resort,
  finalizedMapData,
  selectedFinalizedFeature,
  onSelectedFinalizedFeatureChange,
}: {
  resort: Resort;
  finalizedMapData: FinalizedResortMapData | null;
  selectedFinalizedFeature: SelectedMapFeature | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
}) => {
  const finalizedLifts = finalizedMapData?.lifts?.features ?? [];
  const selectedFinalizedLift =
    selectedFinalizedFeature?.kind === "lift"
      ? (finalizedLifts.find(lift => lift.id === selectedFinalizedFeature.id) ??
        null)
      : null;
  const lifts = resort.lifts;
  const [typeFilter, setTypeFilter] = useState("全て");

  const typeOptions = useMemo(
    () => [
      "全て",
      ...Array.from(
        new Set(lifts.map(l => l.type).filter(Boolean) as string[]),
      ),
    ],
    [lifts],
  );

  const processedLifts = useMemo(() => {
    if (typeFilter === "全て") return lifts;
    return lifts.filter(l => l.type === typeFilter);
  }, [lifts, typeFilter]);

  if (selectedFinalizedLift) {
    const profilePoints = createElevationProfile(
      selectedFinalizedLift.coordinates,
    );

    return (
      <Flex flexDirection="column" gap={5}>
        <Button
          type="button"
          alignSelf="flex-start"
          variant="ghost"
          color="gray.700"
          fontWeight="800"
          px={2}
          onClick={() => onSelectedFinalizedFeatureChange(null)}
        >
          <ArrowLeft size={18} />
          リフト一覧へ戻る
        </Button>
        <Box>
          <Heading size="lg" color="gray.900">
            {selectedFinalizedLift.name}
          </Heading>
          <Text mt={1} color="gray.600" fontWeight="800">
            {selectedFinalizedLift.properties.type ?? "リフト"}
          </Text>
        </Box>

        <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }} gap={3}>
          <StatCard
            title="営業状況"
            value={formatLiftStatus(selectedFinalizedLift.properties.status)}
          />
          <StatCard
            title="速度"
            value={selectedFinalizedLift.properties.speed ?? "--"}
          />
          <StatCard
            title="距離"
            value={formatMeters(
              selectedFinalizedLift.properties.slopeDistMap ??
                selectedFinalizedLift.properties.distance,
            )}
          />
          <StatCard
            title="標高差"
            value={formatMeters(getLiftElevationDiff(selectedFinalizedLift))}
          />
          <StatCard
            title="定員"
            value={
              selectedFinalizedLift.properties.capacity == null
                ? "--"
                : `${selectedFinalizedLift.properties.capacity}名`
            }
          />
          <StatCard
            title="フード"
            value={selectedFinalizedLift.properties.hood ?? "--"}
          />
        </Grid>

        <ElevationProfile points={profilePoints} showSlope={false} />

        {(selectedFinalizedLift.properties.latestNote ||
          selectedFinalizedLift.properties.note) && (
          <Text color="gray.700" lineHeight="1.7">
            {selectedFinalizedLift.properties.latestNote ??
              selectedFinalizedLift.properties.note}
          </Text>
        )}
      </Flex>
    );
  }

  if (finalizedLifts.length > 0) {
    return (
      <Flex flexDirection="column" gap={6}>
        <Grid
          templateColumns={{ base: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }}
          gap={4}
        >
          <StatCard title="全リフト数" value={`${finalizedLifts.length}`} />
          <StatCard
            title="最長距離"
            value={formatMeters(
              Math.max(
                ...finalizedLifts.map(
                  lift =>
                    lift.properties.slopeDistMap ??
                    lift.properties.distance ??
                    0,
                ),
              ),
            )}
          />
          <StatCard
            title="最大高低差"
            value={formatMeters(
              Math.max(
                ...finalizedLifts.map(lift => getLiftElevationDiff(lift) ?? 0),
              ),
            )}
          />
          <StatCard
            title="データ"
            value={finalizedMapData?.lifts?.fileName ?? "--"}
          />
        </Grid>

        <Box as="section">
          <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
            リフト一覧
          </Heading>
          <Box
            mt={4}
            w="100%"
            overflowX="auto"
            borderRadius="xl"
            border="1px solid"
            borderColor="gray.200"
            bg="white"
          >
            <Table.Root size="md">
              <Table.Header>
                <Table.Row bg="gray.100">
                  <Table.ColumnHeader px={6} py={4}>
                    名称
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    タイプ
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    速度
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    距離
                  </Table.ColumnHeader>
                  <Table.ColumnHeader px={6} py={4}>
                    状況
                  </Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {finalizedLifts.map(lift => {
                  const isSelected =
                    selectedFinalizedFeature?.kind === "lift" &&
                    selectedFinalizedFeature.id === lift.id;
                  return (
                    <Table.Row
                      key={lift.id}
                      cursor="pointer"
                      bg={isSelected ? "blue.50" : "white"}
                      borderColor="gray.200"
                      _hover={{ bg: isSelected ? "blue.100" : "gray.50" }}
                      onClick={() =>
                        onSelectedFinalizedFeatureChange({
                          kind: "lift",
                          id: lift.id,
                        })
                      }
                    >
                      <Table.Cell
                        px={6}
                        py={4}
                        fontWeight="800"
                        whiteSpace="nowrap"
                      >
                        {lift.name}
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        {lift.properties.type ?? "--"}
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        {lift.properties.speed ?? "--"}
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        {formatMeters(
                          lift.properties.slopeDistMap ??
                            lift.properties.distance,
                        )}
                      </Table.Cell>
                      <Table.Cell px={6} py={4} whiteSpace="nowrap">
                        {formatLiftStatus(lift.properties.status)}
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
          </Box>
        </Box>
      </Flex>
    );
  }

  return (
    <Flex flexDirection="column" gap={10}>
      <Box as="section">
        <Grid
          templateColumns={{ base: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }}
          gap={4}
        >
          <StatCard title="全リフト数" value={`${resort.numberOfLifts}`} />
          <StatCard
            title="ゴンドラ・ロープウェイ"
            value={`${resort.gondolas}`}
          />
          <StatCard title="クワッドリフト" value={`${resort.quadLifts}`} />
          <StatCard title="ペアリフト" value={`${resort.pairLifts}`} />
        </Grid>
      </Box>
      <Box as="section">
        <Flex
          flexDirection={{ base: "column", md: "row" }}
          gap={4}
          alignItems={{ md: "center" }}
          justifyContent={{ md: "space-between" }}
        >
          <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
            リフト一覧
          </Heading>
          <NativeSelect.Root
            w={{ base: "100%", md: "200px" }}
            size="md"
            variant="outline"
          >
            <NativeSelect.Field
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              bg="white"
              color="gray.800"
              borderColor="gray.200"
              _focus={{ borderColor: "brand.500" }}
            >
              {typeOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt === "全て" ? "すべてのタイプ" : opt}
                </option>
              ))}
            </NativeSelect.Field>
          </NativeSelect.Root>
        </Flex>
        <Box
          mt={4}
          w="100%"
          overflowX="auto"
          borderRadius="xl"
          border="1px solid"
          borderColor="gray.200"
          bg="white"
        >
          <Table.Root size="md">
            <Table.Header>
              <Table.Row bg="gray.100">
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  名称
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  タイプ
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  距離 (m)
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  フード有無
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {processedLifts.map(l => (
                <Table.Row
                  key={l.id}
                  borderColor="gray.200"
                  _hover={{ bg: "gray.50" }}
                >
                  <Table.Cell
                    px={6}
                    py={4}
                    fontWeight="700"
                    color="gray.800"
                    whiteSpace="nowrap"
                  >
                    {l.name}
                  </Table.Cell>
                  <Table.Cell px={6} py={4} whiteSpace="nowrap">
                    <Box
                      as="span"
                      px={2}
                      py={1}
                      borderRadius="md"
                      bg="gray.100"
                      color="gray.700"
                      fontSize="xs"
                      whiteSpace="nowrap"
                    >
                      {l.type || "--"}
                    </Box>
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.700"
                    fontFamily="mono"
                    whiteSpace="nowrap"
                  >
                    {l.distance?.toLocaleString() || "--"}
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.700"
                    whiteSpace="nowrap"
                  >
                    {l.hood || "--"}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      </Box>
    </Flex>
  );
};

const TicketsTab = ({ resort }: { resort: Resort }) => {
  const tickets = resort.tickets;

  return (
    <Flex flexDirection="column" gap={10}>
      <Box as="section">
        <Heading size="lg" fontFamily="var(--font-heading)" color="gray.900">
          リフト券
        </Heading>
        <Box
          mt={4}
          w="100%"
          overflowX="auto"
          borderRadius="xl"
          border="1px solid"
          borderColor="gray.200"
          bg="white"
        >
          <Table.Root size="md">
            <Table.Header>
              <Table.Row bg="gray.100">
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  券種
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  大人
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  子供
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  px={6}
                  py={4}
                  color="gray.600"
                  fontWeight="700"
                  fontSize="sm"
                  whiteSpace="nowrap"
                >
                  シニア
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {tickets.map(t => (
                <Table.Row
                  key={t.id}
                  borderColor="gray.200"
                  _hover={{ bg: "gray.50" }}
                >
                  <Table.Cell
                    px={6}
                    py={4}
                    fontWeight="700"
                    color="gray.800"
                    whiteSpace="nowrap"
                  >
                    {t.name}
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.800"
                    fontFamily="mono"
                    fontWeight="700"
                    whiteSpace="nowrap"
                  >
                    {t.priceAdult ? `¥${t.priceAdult.toLocaleString()}` : "-"}
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.800"
                    fontFamily="mono"
                    fontWeight="700"
                    whiteSpace="nowrap"
                  >
                    {t.priceChild ? `¥${t.priceChild.toLocaleString()}` : "-"}
                  </Table.Cell>
                  <Table.Cell
                    px={6}
                    py={4}
                    color="gray.800"
                    fontFamily="mono"
                    fontWeight="700"
                    whiteSpace="nowrap"
                  >
                    {t.priceSenior ? `¥${t.priceSenior.toLocaleString()}` : "-"}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      </Box>
    </Flex>
  );
};

const WeatherTab = ({ resort }: { resort: Resort }) => {
  // --- Data Transformation Logic ---

  const snowDepthsFormatted: SnowDepthsT | undefined = useMemo(() => {
    const records = resort.snowDepths;
    if (!records || records.length === 0) return undefined;

    const seasons: Record<number, (number | null)[][]> = {};

    records.forEach(r => {
      const d = new Date(r.date);
      const m = d.getMonth() + 1;
      const day = d.getDate();
      let seasonYear = d.getFullYear();
      // December belongs to the next year's season grouping for visualization
      if (m === 12) seasonYear += 1;

      if (!seasons[seasonYear]) {
        // 5 months (Dec, Jan, Feb, Mar, Apr), ~32 days max
        seasons[seasonYear] = Array(5)
          .fill(null)
          .map(() => Array(32).fill(null));
      }

      // Map month to index: 1->0, 2->1, 3->2, 4->3, 12->4
      let mIdx = -1;
      if (m === 1) mIdx = 0;
      else if (m === 2) mIdx = 1;
      else if (m === 3) mIdx = 2;
      else if (m === 4) mIdx = 3;
      else if (m === 12) mIdx = 4;

      if (mIdx !== -1) {
        seasons[seasonYear][mIdx][day - 1] = r.depth;
      }
    });

    const years = Object.keys(seasons).map(Number);
    return {
      firstYear: Math.min(...years) || new Date().getFullYear(),
      data: Object.values(seasons),
    };
  }, [resort.snowDepths]);

  const snowForecastLinks = useMemo(() => {
    const links: Array<{
      id: string;
      displayName: string | null;
      url: string;
    }> = [];
    const seen = new Set<string>();
    const addSnowForecastLink = (
      id: string | null | undefined,
      displayName?: string | null,
    ) => {
      if (!id) return;
      if (seen.has(id)) {
        const existing = links.find(link => link.id === id);
        if (existing && displayName) existing.displayName = displayName;
        return;
      }
      seen.add(id);
      links.push({
        id,
        displayName: displayName || id,
        url: `https://ja.snow-forecast.com/resorts/${id}/6day/mid`,
      });
    };

    const merged = resort.weatherIds;

    for (const entry of merged?.snowForecast ?? []) {
      addSnowForecastLink(
        entry.snowForecastId,
        entry.displayName || entry.snowForecastName || null,
      );
    }
    addSnowForecastLink(merged?.SnowForecastId, merged?.SnowForecastName);

    return links;
  }, [resort.weatherIds]);

  const tenkiJpLinks = useMemo(() => {
    const mergedEntry = resort.weatherIds;

    if (!mergedEntry?.tenkijp || mergedEntry.tenkijp.length === 0) return [];

    return mergedEntry.tenkijp.map(t => ({
      id: t.tenkijpId,
      displayName: t.displayName || t.tenkijpName || null,
      url: `https://tenki.jp/season/ski/${t.tenkijpId}/`,
    }));
  }, [resort.weatherIds]);

  const weathernewsSpotId = resort.weatherIds?.weathernewsSpotId ?? null;

  return (
    <Flex flexDirection="column" gap={10}>
      <Box as="section">
        <Heading
          size="md"
          mb={4}
          mt={4}
          fontFamily="var(--font-heading)"
          color="gray.900"
        >
          リンク一覧
        </Heading>
        <Flex flexWrap="wrap" alignItems="center" gap={3} mb={8}>
          {snowForecastLinks.length === 1 && (
            <Link
              href={snowForecastLinks[0].url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => {
                if (e.detail > 0) e.currentTarget.blur();
              }}
              display="inline-flex"
              alignItems="center"
              gap={2}
              px={3}
              py={2}
              borderRadius="full"
              bg="red.50"
              color="red.700"
              fontSize="sm"
              fontWeight="700"
              _hover={{ bg: "red.100", textDecoration: "none" }}
            >
              Snow Forecast
            </Link>
          )}
          {snowForecastLinks.length > 1 &&
            snowForecastLinks.map(link => (
              <Link
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => {
                  if (e.detail > 0) e.currentTarget.blur();
                }}
                display="inline-flex"
                alignItems="center"
                gap={2}
                px={3}
                py={2}
                borderRadius="full"
                bg="red.50"
                color="red.700"
                fontSize="sm"
                fontWeight="700"
                _hover={{ bg: "red.100", textDecoration: "none" }}
              >
                {`Snow Forecast ${link.displayName}`}
              </Link>
            ))}
          {tenkiJpLinks.length === 1 && (
            <Link
              href={tenkiJpLinks[0].url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => {
                if (e.detail > 0) e.currentTarget.blur();
              }}
              display="inline-flex"
              alignItems="center"
              gap={2}
              px={3}
              py={2}
              borderRadius="full"
              bg="brand.50"
              color="brand.700"
              fontSize="sm"
              fontWeight="700"
              _hover={{ bg: "brand.100", textDecoration: "none" }}
            >
              tenki.jp
            </Link>
          )}

          {tenkiJpLinks.length > 1 &&
            tenkiJpLinks.map(link => (
              <Link
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => {
                  if (e.detail > 0) e.currentTarget.blur();
                }}
                display="inline-flex"
                alignItems="center"
                gap={2}
                px={3}
                py={2}
                borderRadius="full"
                bg="brand.50"
                color="brand.700"
                fontSize="sm"
                fontWeight="700"
                _hover={{ bg: "brand.100", textDecoration: "none" }}
              >
                {`tenki.jp ${link.displayName}`}
              </Link>
            ))}

          {/* Weathernews (conditional) + Windy (always when coords exist) */}
          {(() => {
            const weathernewsUrl = weathernewsSpotId
              ? `https://weathernews.jp/ski/spot/${weathernewsSpotId}/`
              : null;

            const lat = resort.latitude;
            const lon = resort.longitude;
            const hasCoords =
              typeof lat === "number" && typeof lon === "number";
            const windyUrl = hasCoords
              ? `https://www.windy.com/${lat}/${lon}?${lat},${lon},14,i:pressure,p:cities`
              : null;

            return (
              <>
                {weathernewsUrl && (
                  <Link
                    key="weathernews"
                    href={weathernewsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => {
                      if (e.detail > 0) e.currentTarget.blur();
                    }}
                    display="inline-flex"
                    alignItems="center"
                    gap={2}
                    px={3}
                    py={2}
                    borderRadius="full"
                    bg="blue.50"
                    color="blue.800"
                    fontSize="sm"
                    fontWeight="700"
                    _hover={{ bg: "blue.100", textDecoration: "none" }}
                  >
                    ウェザーニュース
                  </Link>
                )}

                {windyUrl && (
                  <Link
                    key="windy"
                    href={windyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => {
                      if (e.detail > 0) e.currentTarget.blur();
                    }}
                    display="inline-flex"
                    alignItems="center"
                    gap={2}
                    px={3}
                    py={2}
                    borderRadius="full"
                    bg="red.50"
                    color="red.700"
                    fontSize="sm"
                    fontWeight="700"
                    _hover={{ bg: "red.100", textDecoration: "none" }}
                  >
                    Windy
                  </Link>
                )}
              </>
            );
          })()}
        </Flex>
        {snowForecastLinks.length > 0 &&
          snowForecastLinks.map((link, index) => (
            <Box key={link.id}>
              <Heading
                size="md"
                mb={6}
                mt={index === 0 ? 0 : 8}
                fontFamily="var(--font-heading)"
                color="gray.900"
              >
                {snowForecastLinks.length === 1
                  ? "Snow Forecast 予報"
                  : `Snow Forecast 予報 (${link.displayName})`}
              </Heading>
              <SnowForecastEmbed
                snowForecastSlug={link.id}
                resortName={resort.nameJa}
              />
            </Box>
          ))}
      </Box>

      {snowDepthsFormatted && (
        <Box as="section">
          <Heading
            size="lg"
            mb={6}
            mt={4}
            fontFamily="var(--font-heading)"
            color="gray.900"
          >
            積雪量データ
          </Heading>
          <SnowDepthLineChart snowDepths={snowDepthsFormatted} />
        </Box>
      )}
    </Flex>
  );
};

const StatCard = ({
  title,
  value,
  valueColor = "gray.900",
}: {
  title: string;
  value: string | number;
  valueColor?: string;
}) => (
  <Box
    p={{ base: 2, sm: 3, md: 4 }}
    minH={{ base: "64px", md: "auto" }}
    borderRadius={{ base: "lg", md: "xl" }}
    bg="white"
    border="1px solid"
    borderColor="gray.200"
    boxShadow="sm"
    transition="all 0.3s ease"
    _hover={{
      transform: "translateY(-2px)",
      borderColor: "brand.500",
      boxShadow: "md",
    }}
  >
    <Text
      fontSize={{ base: "10px", sm: "xs" }}
      color="gray.500"
      fontWeight="700"
      whiteSpace="nowrap"
      overflow="hidden"
      textOverflow="ellipsis"
    >
      {title}
    </Text>
    <Text
      fontWeight="800"
      mt={{ base: 0.5, md: 1 }}
      fontSize={{ base: "0.95rem", sm: "lg", md: "2xl" }}
      color={valueColor}
      fontFamily="var(--font-heading)"
      lineHeight="1.2"
    >
      {value}
    </Text>
  </Box>
);
