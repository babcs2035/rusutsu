"use client";

import {
  Box,
  Button,
  Flex,
  Heading,
  Link,
  Portal,
  Spinner,
  Table,
  Text,
  useBreakpointValue,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import type {
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";
import type { SkiResortDetail } from "@/types/skiResorts";
import { LoadingSpinner } from "./LoadingSpinner";

type Resort = SkiResortDetail;
type Elevation = "top" | "mid" | "bot";
type WeatherLink = {
  kind: "snowForecast" | "tenkiJp" | "weathernews" | "windy";
  id: string;
  label: string;
  url: string | null;
  bg: string;
  hoverBg: string;
  color: string;
};
type SnowForecastLink = {
  id: string;
  displayName: string;
  url: string;
};

type Props = {
  resorts: Resort[];
  isLoading: boolean;
  onClose: () => void;
  presentation?: "sheet" | "inline";
  canScrollContent?: boolean;
  onContentScrollIntent?: () => void;
};

const TABS = ["概要", "天候"] as const;
const BOTTOM_SHEET_EXPANDED_SNAP_POINT = 0.94;
const BOTTOM_SHEET_SNAP_POINTS = [
  0.12,
  0.52,
  BOTTOM_SHEET_EXPANDED_SNAP_POINT,
] as const;
const BOTTOM_SHEET_INITIAL_SNAP_POINT = BOTTOM_SHEET_SNAP_POINTS[1];
const BOTTOM_SHEET_MAP_PEEK_HEIGHT = "6vh";
const isBottomSheetExpanded = (snapPoint: number | string | null) =>
  typeof snapPoint === "number" &&
  Math.abs(snapPoint - BOTTOM_SHEET_EXPANDED_SNAP_POINT) < 0.001;
const ELEVATION_OPTIONS: Array<{ label: string; value: Elevation }> = [
  { label: "山頂", value: "top" },
  { label: "中腹", value: "mid" },
  { label: "山麓", value: "bot" },
];
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
  zIndex: 100001,
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
  margin: "1rem auto",
};
const MotionBox = motion.create(Box);
const DESKTOP_WEATHER_LINK_WIDTH = "116px";
const DESKTOP_WEATHER_RESORT_INFO_WIDTH = "180px";
const WEATHER_PANEL_PADDING_WIDTH = "16px";
const WEATHER_PANEL_COLUMN_GAP = "8px";
const SNOW_FORECAST_SOURCE_WIDTH = 750;
const SNOW_FORECAST_SOURCE_HEIGHT = 250;
const SNOW_FORECAST_ELEVATION_CONTROLS_WIDTH = 44;
const SNOW_FORECAST_FEED_VIEWPORT_WIDTH = 430;
const SNOW_FORECAST_FEED_TOTAL_WIDTH = `${
  SNOW_FORECAST_ELEVATION_CONTROLS_WIDTH + SNOW_FORECAST_FEED_VIEWPORT_WIDTH
}px`;
const WEATHER_PANEL_DESKTOP_WIDTH = `calc(${DESKTOP_WEATHER_RESORT_INFO_WIDTH} + ${WEATHER_PANEL_COLUMN_GAP} + ${SNOW_FORECAST_FEED_TOTAL_WIDTH} + ${WEATHER_PANEL_PADDING_WIDTH})`;
const SNOW_FORECAST_FEED_ZOOM = 0.92;
const SNOW_FORECAST_FEED_VIEWPORT_HEIGHT = 170;
const MOBILE_SNOW_FORECAST_FEED_VIEWPORT_HEIGHT = 143;
const MOBILE_SNOW_FORECAST_FEED_CROP_TOP = 35;
const MOBILE_SNOW_FORECAST_FEED_CROP_RIGHT = 290;
const MOBILE_SNOW_FORECAST_FEED_CROP_HEIGHT = 143;
const MOBILE_SNOW_FORECAST_FEED_CROP_LEFT = 40;
const DESKTOP_SNOW_FORECAST_FEED_INITIAL_SCROLL_X = 20;
const DESKTOP_SNOW_FORECAST_FEED_INITIAL_SCROLL_Y = 10;
const SNOW_FORECAST_FEED_INITIAL_SCROLL_Y_RATIO = 0.58;
const MOBILE_SNOW_FORECAST_CROPPED_FEED_WIDTH =
  (SNOW_FORECAST_SOURCE_WIDTH -
    MOBILE_SNOW_FORECAST_FEED_CROP_LEFT -
    MOBILE_SNOW_FORECAST_FEED_CROP_RIGHT) *
  SNOW_FORECAST_FEED_ZOOM;
const MOBILE_SNOW_FORECAST_CROPPED_FEED_HEIGHT =
  MOBILE_SNOW_FORECAST_FEED_CROP_HEIGHT * SNOW_FORECAST_FEED_ZOOM;
const MOBILE_SNOW_FORECAST_FEED_TRANSFORM = `translate(-${MOBILE_SNOW_FORECAST_FEED_CROP_LEFT}px, -${MOBILE_SNOW_FORECAST_FEED_CROP_TOP}px) scale(${SNOW_FORECAST_FEED_ZOOM})`;

const WEATHER_LINK_TOP_MODE_STYLES = {
  flexDirection: "row",
  alignItems: "center",
  flexWrap: "wrap",
  overflowX: "visible",
  paddingBottom: 0,
  "& .weather-link": {
    width: "max-content",
  },
} as const;

export const SkiResortCompareView = ({
  resorts,
  isLoading,
  onClose,
  presentation = "sheet",
  canScrollContent,
  onContentScrollIntent,
}: Props) => {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("概要");
  const [sheetSnapPoint, setSheetSnapPoint] = useState<number | string | null>(
    BOTTOM_SHEET_INITIAL_SNAP_POINT,
  );
  const sheetContentTouchStartYRef = useRef<number | null>(null);
  const isSidePanel =
    useBreakpointValue({ base: false, md: true }, { ssr: false }) ?? false;
  const isSheetContentScrollable =
    canScrollContent ?? (isSidePanel || isBottomSheetExpanded(sheetSnapPoint));
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
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const expandSheetFromContentScroll = useCallback(() => {
    if (isSheetContentScrollable) return;

    if (onContentScrollIntent) {
      onContentScrollIntent();
      return;
    }

    setSheetSnapPoint(BOTTOM_SHEET_EXPANDED_SNAP_POINT);
  }, [isSheetContentScrollable, onContentScrollIntent]);
  const handleCompareContentWheelCapture = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (isSheetContentScrollable || event.deltaY <= 0) return;

      event.preventDefault();
      expandSheetFromContentScroll();
    },
    [expandSheetFromContentScroll, isSheetContentScrollable],
  );
  const handleCompareContentTouchStartCapture = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      sheetContentTouchStartYRef.current = event.touches[0]?.clientY ?? null;
    },
    [],
  );
  const handleCompareContentTouchMoveCapture = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (isSheetContentScrollable) return;

      const startY = sheetContentTouchStartYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (startY == null || currentY == null || startY - currentY < 8) return;

      event.preventDefault();
      expandSheetFromContentScroll();
    },
    [expandSheetFromContentScroll, isSheetContentScrollable],
  );

  const comparePanelContent = (
    <>
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
        minW="auto"
        p={0}
        aria-label="比較画面を閉じる"
      >
        ✕
      </Button>

      <Box
        px={{ base: 4, md: 8 }}
        pt={{ base: 6, md: 8 }}
        pb={5}
        borderBottom="1px solid"
        borderColor="gray.200"
      >
        <Heading size="2xl" color="gray.900" fontFamily="var(--font-heading)">
          スキー場比較
        </Heading>
        <Text mt={2} fontSize="sm" color="gray.500" fontWeight="700">
          {resorts.length} 件を比較中
        </Text>
      </Box>

      <Flex
        as="nav"
        borderBottom="1px solid"
        borderColor="gray.100"
        bg="rgba(255, 255, 255, 0.95)"
        backdropFilter="blur(16px)"
      >
        {TABS.map(tab => (
          <Button
            key={tab}
            onClick={() => setActiveTab(tab)}
            flex="1"
            py={4}
            textAlign="center"
            fontSize={{ base: "sm", md: "md" }}
            fontWeight="700"
            bg="transparent"
            borderRadius={0}
            borderBottom={activeTab === tab ? "2px solid" : "none"}
            borderColor={activeTab === tab ? "brand.500" : "transparent"}
            color={activeTab === tab ? "brand.600" : "gray.500"}
            _hover={{ bg: "gray.50", color: "brand.600" }}
          >
            {tab}
          </Button>
        ))}
      </Flex>

      <Box
        flexGrow={1}
        overflowY={isSheetContentScrollable ? "auto" : "hidden"}
        className="custom-scroll"
        onTouchMoveCapture={handleCompareContentTouchMoveCapture}
        onTouchStartCapture={handleCompareContentTouchStartCapture}
        onWheelCapture={handleCompareContentWheelCapture}
      >
        {isLoading ? (
          <Flex minH="360px" alignItems="center" justifyContent="center">
            <LoadingSpinner text="比較データを読み込み中..." />
          </Flex>
        ) : (
          <Box px={{ base: 2, md: 8 }} py={{ base: 4, md: 8 }} color="gray.800">
            {activeTab === "概要" && <CompareOverviewTab resorts={resorts} />}
            {activeTab === "天候" && (
              <CompareWeatherTab resorts={resorts} isSidePanel={isSidePanel} />
            )}
          </Box>
        )}
      </Box>
    </>
  );

  if (presentation === "inline") {
    return (
      <Box
        position="relative"
        display="flex"
        h="100%"
        minH={0}
        flexDirection="column"
        overflow="hidden"
        bg="white"
      >
        {comparePanelContent}
      </Box>
    );
  }

  return (
    <>
      {isSidePanel && (
        <Portal>
          <Flex
            position="fixed"
            inset={0}
            zIndex={100001}
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
              data-ski-resort-compare-panel="true"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ type: "tween", duration: 0.18, ease: "easeOut" }}
              position="relative"
              zIndex={10}
              display="flex"
              h="100%"
              w="min(800px, 70vw)"
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
              {comparePanelContent}
            </MotionBox>
          </Flex>
        </Portal>
      )}
      {!isSidePanel && (
        <Box>
          {isBottomSheetExpanded(sheetSnapPoint) && (
            <Box
              as="button"
              position="fixed"
              top={0}
              left={0}
              right={0}
              zIndex={100002}
              h={BOTTOM_SHEET_MAP_PEEK_HEIGHT}
              bg="transparent"
              aria-label="地図を表示"
              onClick={() => setSheetSnapPoint(BOTTOM_SHEET_INITIAL_SNAP_POINT)}
            />
          )}
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
            snapToSequentialPoint
          >
            <Drawer.Portal>
              <Drawer.Content
                data-ski-resort-compare-panel="true"
                style={BOTTOM_SHEET_CONTENT_STYLE}
              >
                <Drawer.Title style={VISUALLY_HIDDEN_STYLE}>
                  スキー場比較
                </Drawer.Title>
                <Drawer.Handle style={BOTTOM_SHEET_HANDLE_STYLE} />
                <Box
                  position="relative"
                  display="flex"
                  h="calc(100vh - var(--snap-point-height, 0px) - 38px)"
                  flexDirection="column"
                  overflow="hidden"
                >
                  {comparePanelContent}
                </Box>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>
        </Box>
      )}
    </>
  );
};

const CompareOverviewTab = ({ resorts }: { resorts: Resort[] }) => (
  <Box
    w="100%"
    overflowX="auto"
    borderRadius="xl"
    border="1px solid"
    borderColor="gray.200"
    bg="white"
    boxShadow="sm"
  >
    <Table.Root size="md" minW="760px">
      <Table.Header>
        <Table.Row bg="gray.100">
          <Table.ColumnHeader px={6} py={4} color="gray.600" fontWeight="700">
            スキー場
          </Table.ColumnHeader>
          <Table.ColumnHeader px={6} py={4} color="gray.600" fontWeight="700">
            コース数
          </Table.ColumnHeader>
          <Table.ColumnHeader px={6} py={4} color="gray.600" fontWeight="700">
            リフト数
          </Table.ColumnHeader>
          <Table.ColumnHeader px={6} py={4} color="gray.600" fontWeight="700">
            最高標高
          </Table.ColumnHeader>
          <Table.ColumnHeader px={6} py={4} color="gray.600" fontWeight="700">
            最低標高
          </Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {resorts.map(resort => (
          <Table.Row key={resort.id} borderColor="gray.200">
            <Table.Cell px={6} py={4} minW="220px">
              <Text
                color="gray.900"
                fontWeight="800"
                fontFamily="var(--font-heading)"
              >
                {resort.nameJa}
              </Text>
              <Text mt={1} fontSize="xs" color="gray.500" fontWeight="700">
                {resort.prefecture} • {resort.town}
              </Text>
            </Table.Cell>
            <OverviewTableValue value={`${resort.numberOfCourses}`} />
            <OverviewTableValue value={`${resort.numberOfLifts}`} />
            <OverviewTableValue
              value={`${resort.topElevation.toLocaleString()} m`}
            />
            <OverviewTableValue
              value={`${resort.baseElevation.toLocaleString()} m`}
            />
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  </Box>
);

const OverviewTableValue = ({ value }: { value: string }) => (
  <Table.Cell
    px={6}
    py={4}
    color="gray.900"
    fontWeight="800"
    fontFamily="var(--font-heading)"
    whiteSpace="nowrap"
  >
    {value}
  </Table.Cell>
);

const CompareWeatherTab = ({
  resorts,
  isSidePanel,
}: {
  resorts: Resort[];
  isSidePanel: boolean;
}) => {
  const measureRef = useRef<HTMLHeadingElement | null>(null);
  const [infoWidth, setInfoWidth] = useState<number | null>(null);

  useEffect(() => {
    const probe = measureRef.current;
    if (!probe) return;

    let maxNameWidth = 0;
    for (const resort of resorts) {
      probe.textContent = resort.nameJa;
      maxNameWidth = Math.max(
        maxNameWidth,
        Math.ceil(probe.getBoundingClientRect().width),
      );
    }
    probe.textContent = "";

    const linkWidth = Number.parseInt(DESKTOP_WEATHER_LINK_WIDTH, 10) || 0;
    const baseWidth = Math.max(maxNameWidth, linkWidth);
    const nextWidth = isSidePanel
      ? Math.min(
          baseWidth,
          Number.parseInt(DESKTOP_WEATHER_RESORT_INFO_WIDTH, 10),
        )
      : baseWidth;

    setInfoWidth(nextWidth > 0 ? nextWidth : null);
  }, [isSidePanel, resorts]);

  return (
    <Box
      display="grid"
      gridTemplateColumns={{
        base: "minmax(0, 1fr)",
        md: "minmax(0, 1fr)",
      }}
      gap={{ base: 1, md: 3 }}
      overflowX="auto"
      pb={0}
    >
      <Heading
        ref={measureRef}
        as="span"
        size="sm"
        fontFamily="var(--font-heading)"
        fontWeight="800"
        position="absolute"
        visibility="hidden"
        whiteSpace="nowrap"
        pointerEvents="none"
      />
      {resorts.map(resort => (
        <ResortWeatherPanel
          key={resort.id}
          resort={resort}
          infoWidth={infoWidth}
          isSidePanel={isSidePanel}
        />
      ))}
    </Box>
  );
};

const ResortWeatherPanel = ({
  resort,
  infoWidth,
  isSidePanel,
}: {
  resort: Resort;
  infoWidth: number | null;
  isSidePanel: boolean;
}) => {
  const [snowForecastElevation, setSnowForecastElevation] =
    useState<Elevation>("mid");
  const [selectedSnowForecastId, setSelectedSnowForecastId] = useState<
    string | null
  >(null);
  const snowForecastLinks = useMemo(
    () => getSnowForecastLinks(resort, snowForecastElevation),
    [resort, snowForecastElevation],
  );
  const selectedSnowForecast =
    snowForecastLinks.find(link => link.id === selectedSnowForecastId) ??
    snowForecastLinks[0] ??
    null;
  const links = useWeatherLinks(resort, snowForecastElevation);
  const availableLinks = links.filter(
    (link): link is WeatherLink & { url: string } => Boolean(link.url),
  );

  useEffect(() => {
    if (snowForecastLinks.length === 0) {
      if (selectedSnowForecastId !== null) setSelectedSnowForecastId(null);
      return;
    }

    if (!snowForecastLinks.some(link => link.id === selectedSnowForecastId)) {
      setSelectedSnowForecastId(snowForecastLinks[0].id);
    }
  }, [selectedSnowForecastId, snowForecastLinks]);

  return (
    <Flex
      border="1px solid"
      borderColor="gray.200"
      borderRadius="xl"
      bg="white"
      overflow="hidden"
      boxShadow="sm"
      px={2}
      pt={2}
      pb={{ base: 1, md: 2 }}
      gap={2}
      w="100%"
      style={
        infoWidth
          ? ({
              "--weather-info-width": `${infoWidth}px`,
            } as React.CSSProperties)
          : undefined
      }
      css={{
        containerType: "inline-size",
        "& .weather-panel-content": {
          flexDirection: "row",
        },
        "& .weather-info": {
          flex: isSidePanel ? "0 0 auto" : "1 1 auto",
          width: isSidePanel
            ? "var(--weather-info-width, max-content)"
            : "auto",
          maxWidth: isSidePanel ? DESKTOP_WEATHER_RESORT_INFO_WIDTH : "none",
          minWidth: isSidePanel ? 0 : "var(--weather-info-width, 0px)",
        },
        "& .weather-feed": {
          flex: `0 0 ${SNOW_FORECAST_FEED_TOTAL_WIDTH}`,
          width: SNOW_FORECAST_FEED_TOTAL_WIDTH,
          maxWidth: "100%",
        },
        "& .weather-links": {
          flexDirection: "column",
          alignItems: "flex-start",
          overflowX: "visible",
          flexWrap: "nowrap",
          paddingBottom: 0,
        },
        "& .weather-link": {
          width: DESKTOP_WEATHER_LINK_WIDTH,
        },
        [`@container (max-width: ${WEATHER_PANEL_DESKTOP_WIDTH})`]: {
          "& .weather-panel-content": {
            flexDirection: "column",
          },
          "& .weather-info": {
            flex: "0 0 auto",
            maxWidth: "none",
            minWidth: 0,
            width: "100%",
          },
          "& .weather-feed": {
            flex: "1 1 auto",
            width: "100%",
          },
          "& .weather-links": {
            ...WEATHER_LINK_TOP_MODE_STYLES,
          },
          "& .snow-forecast-viewport": {
            height: `${MOBILE_SNOW_FORECAST_FEED_VIEWPORT_HEIGHT}px`,
          },
          "& .snow-forecast-desktop-elevation-controls": {
            display: "none",
          },
          "& .snow-forecast-feed-crop": {
            height: `${MOBILE_SNOW_FORECAST_CROPPED_FEED_HEIGHT}px`,
            width: `${MOBILE_SNOW_FORECAST_CROPPED_FEED_WIDTH}px`,
          },
          "& .snow-forecast-feed-transform": {
            transform: MOBILE_SNOW_FORECAST_FEED_TRANSFORM,
          },
          "& .snow-forecast-mobile-footer": {
            display: "flex",
          },
          "& .snow-forecast-desktop-source": {
            display: "none",
          },
        },
      }}
      alignItems="stretch"
    >
      <Flex
        className="weather-panel-content"
        gap={2}
        alignItems="stretch"
        w="100%"
        minW={0}
      >
        <Box className="weather-info" flexShrink={0}>
          <Heading
            size="sm"
            color="gray.900"
            fontFamily="var(--font-heading)"
            lineHeight="1.3"
            mb={2}
          >
            {resort.nameJa}
          </Heading>

          {availableLinks.length > 0 && (
            <Flex
              className="weather-links"
              gap={1}
              css={{ WebkitOverflowScrolling: "touch" }}
            >
              {availableLinks.map(link => (
                <WeatherLinkButton
                  key={`${link.kind}-${link.id}`}
                  link={link}
                />
              ))}
            </Flex>
          )}
        </Box>

        <Box className="weather-feed" minW={0}>
          {selectedSnowForecast ? (
            <CompactSnowForecastEmbed
              snowForecastLinks={snowForecastLinks}
              selectedSnowForecastId={selectedSnowForecast.id}
              onSnowForecastChange={setSelectedSnowForecastId}
              resortName={resort.nameJa}
              elevation={snowForecastElevation}
              onElevationChange={setSnowForecastElevation}
            />
          ) : (
            <Flex
              minH="50px"
              alignItems="center"
              justifyContent="center"
              border="1px solid"
              borderColor="gray.200"
              borderRadius="xl"
              bg="gray.50"
            >
              <Text fontSize="sm" color="gray.500">
                Snow Forecast の予報リンクが見つかりませんでした。
              </Text>
            </Flex>
          )}
        </Box>
      </Flex>
    </Flex>
  );
};

const WeatherLinkButton = ({
  link,
}: {
  link: WeatherLink & { url: string };
}) => (
  <Link
    href={link.url}
    target="_blank"
    rel="noopener noreferrer"
    className="weather-link"
    display="flex"
    flex="0 0 auto"
    alignItems="center"
    justifyContent="center"
    minH={7}
    px={2}
    borderRadius="md"
    bg={link.bg}
    color={link.color}
    fontSize="xs"
    fontWeight="800"
    textAlign="center"
    _hover={{ bg: link.hoverBg, textDecoration: "none" }}
  >
    {link.label}
  </Link>
);

const CompactSnowForecastEmbed = ({
  snowForecastLinks,
  selectedSnowForecastId,
  onSnowForecastChange,
  resortName,
  elevation,
  onElevationChange,
}: {
  snowForecastLinks: SnowForecastLink[];
  selectedSnowForecastId: string;
  onSnowForecastChange: (id: string) => void;
  resortName: string;
  elevation: Elevation;
  onElevationChange: (elevation: Elevation) => void;
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isFeedLoading, setIsFeedLoading] = useState(true);
  const selectedSnowForecast =
    snowForecastLinks.find(link => link.id === selectedSnowForecastId) ??
    snowForecastLinks[0];
  const feedUrl = `https://ja.snow-forecast.com/resorts/${selectedSnowForecast.id}/forecasts/feed/${elevation}/m`;
  const detailUrl = selectedSnowForecast.url;
  const sourceWidth = SNOW_FORECAST_SOURCE_WIDTH;
  const sourceHeight = SNOW_FORECAST_SOURCE_HEIGHT;
  const scaledFeedWidth = sourceWidth * SNOW_FORECAST_FEED_ZOOM;
  const scaledFeedHeight = sourceHeight * SNOW_FORECAST_FEED_ZOOM;
  const mobileCroppedFeedWidth = MOBILE_SNOW_FORECAST_CROPPED_FEED_WIDTH;
  const mobileCroppedFeedHeight = MOBILE_SNOW_FORECAST_CROPPED_FEED_HEIGHT;

  const resetFeedScroll = useCallback(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    requestAnimationFrame(() => {
      const maxScrollX =
        scrollContainer.scrollWidth - scrollContainer.clientWidth;
      const maxScrollY =
        scrollContainer.scrollHeight - scrollContainer.clientHeight;
      const shouldApplyInitialScrollX =
        window.matchMedia("(min-width: 48em)").matches;

      scrollContainer.scrollLeft = shouldApplyInitialScrollX
        ? Math.min(DESKTOP_SNOW_FORECAST_FEED_INITIAL_SCROLL_X, maxScrollX)
        : 0;
      scrollContainer.scrollTop = shouldApplyInitialScrollX
        ? Math.min(DESKTOP_SNOW_FORECAST_FEED_INITIAL_SCROLL_Y, maxScrollY)
        : maxScrollY * SNOW_FORECAST_FEED_INITIAL_SCROLL_Y_RATIO;
    });
  }, []);

  useEffect(() => {
    resetFeedScroll();
  }, [resetFeedScroll]);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    let animationFrameId: number | null = null;
    const scheduleResetFeedScroll = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(() => {
        animationFrameId = null;
        resetFeedScroll();
      });
    };

    const mediaQuery = window.matchMedia("(min-width: 48em)");
    mediaQuery.addEventListener("change", scheduleResetFeedScroll);

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleResetFeedScroll);
      return () => {
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
        }
        mediaQuery.removeEventListener("change", scheduleResetFeedScroll);
        window.removeEventListener("resize", scheduleResetFeedScroll);
      };
    }

    const resizeObserver = new ResizeObserver(scheduleResetFeedScroll);
    resizeObserver.observe(scrollContainer);

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      mediaQuery.removeEventListener("change", scheduleResetFeedScroll);
      resizeObserver.disconnect();
    };
  }, [resetFeedScroll]);

  useEffect(() => {
    if (feedUrl) setIsFeedLoading(true);
  }, [feedUrl]);

  return (
    <Box w="100%" maxW="100%">
      <Flex
        flexDirection="column"
        border="1px solid"
        borderColor="gray.200"
        borderRadius="lg"
        overflow="hidden"
        bg="white"
        w="100%"
        maxW={SNOW_FORECAST_FEED_TOTAL_WIDTH}
        minW={0}
      >
        {snowForecastLinks.length > 1 && (
          <Flex
            flexWrap="wrap"
            gap={0.5}
            p={1}
            bg="gray.50"
            borderBottom="1px solid"
            borderColor="gray.200"
          >
            {snowForecastLinks.map(link => (
              <Button
                key={link.id}
                onClick={() => {
                  onSnowForecastChange(link.id);
                  resetFeedScroll();
                }}
                flex="1 1 auto"
                minW="max-content"
                h="auto"
                minH="unset"
                px={2}
                borderRadius="md"
                bg={
                  selectedSnowForecast.id === link.id ? "white" : "transparent"
                }
                color={
                  selectedSnowForecast.id === link.id ? "red.700" : "gray.500"
                }
                border="1px solid"
                borderColor={
                  selectedSnowForecast.id === link.id
                    ? "gray.200"
                    : "transparent"
                }
                boxShadow={selectedSnowForecast.id === link.id ? "sm" : "none"}
                fontSize="xs"
                fontWeight="800"
                _hover={{ bg: "white", color: "red.700" }}
              >
                {link.displayName}
              </Button>
            ))}
          </Flex>
        )}

        <Flex
          className="snow-forecast-viewport"
          h={{
            base: `${MOBILE_SNOW_FORECAST_FEED_VIEWPORT_HEIGHT}px`,
            md: `${SNOW_FORECAST_FEED_VIEWPORT_HEIGHT}px`,
          }}
          w="100%"
          minW={0}
        >
          <Flex
            className="snow-forecast-desktop-elevation-controls"
            display={{ base: "none", md: "flex" }}
            w={`${SNOW_FORECAST_ELEVATION_CONTROLS_WIDTH}px`}
            flexShrink={0}
            flexDirection="column"
            gap={0.5}
            p={1}
            bg="gray.50"
            borderRight="1px solid"
            borderColor="gray.200"
          >
            {ELEVATION_OPTIONS.map(option => (
              <Button
                key={option.value}
                onClick={() => {
                  onElevationChange(option.value);
                  resetFeedScroll();
                }}
                flex="1"
                minH={0}
                minW="auto"
                px={1}
                borderRadius="md"
                bg={elevation === option.value ? "white" : "transparent"}
                color={elevation === option.value ? "brand.600" : "gray.500"}
                border="1px solid"
                borderColor={
                  elevation === option.value ? "gray.200" : "transparent"
                }
                boxShadow={elevation === option.value ? "sm" : "none"}
                fontSize="xs"
                fontWeight="800"
                _hover={{ bg: "white", color: "brand.600" }}
              >
                {option.label}
              </Button>
            ))}
          </Flex>

          <Box
            ref={scrollRef}
            position="relative"
            flex="1"
            minW={0}
            h="100%"
            overflow="auto"
            css={{ WebkitOverflowScrolling: "touch" }}
          >
            {isFeedLoading && (
              <Flex
                position="absolute"
                inset={0}
                zIndex={1}
                alignItems="center"
                justifyContent="center"
                gap={2}
                bg="rgba(255, 255, 255, 0.9)"
                color="gray.600"
                fontSize="xs"
                fontWeight="800"
                aria-live="polite"
                aria-busy="true"
              >
                <Spinner size="sm" color="brand.500" borderWidth="2px" />
                <Text>予報を読み込み中...</Text>
              </Flex>
            )}

            <Box
              className="snow-forecast-feed-crop"
              h={{
                base: `${mobileCroppedFeedHeight}px`,
                md: `${scaledFeedHeight}px`,
              }}
              w={{
                base: `${mobileCroppedFeedWidth}px`,
                md: `${scaledFeedWidth}px`,
              }}
              overflow="hidden"
            >
              <Box
                className="snow-forecast-feed-transform"
                h={`${sourceHeight}px`}
                w={`${sourceWidth}px`}
                transform={{
                  base: MOBILE_SNOW_FORECAST_FEED_TRANSFORM,
                  md: `scale(${SNOW_FORECAST_FEED_ZOOM})`,
                }}
                transformOrigin="top left"
              >
                <iframe
                  title={`${resortName} Snow-Forecast compact`}
                  src={feedUrl}
                  width={sourceWidth}
                  height={sourceHeight}
                  scrolling="auto"
                  loading="lazy"
                  onLoad={() => {
                    setIsFeedLoading(false);
                    resetFeedScroll();
                  }}
                  style={{
                    border: "none",
                    display: "block",
                  }}
                />
              </Box>
            </Box>
          </Box>
        </Flex>

        <Flex
          className="snow-forecast-mobile-footer"
          display={{ base: "flex", md: "none" }}
          alignItems="center"
          gap={2}
          p={1}
          bg="gray.50"
          borderTop="1px solid"
          borderColor="gray.200"
        >
          <Flex flex="0 0 auto" gap={0}>
            {ELEVATION_OPTIONS.map(option => (
              <Button
                key={option.value}
                onClick={() => {
                  onElevationChange(option.value);
                  resetFeedScroll();
                }}
                minW="max-content"
                h="auto"
                minH="unset"
                px={2}
                py={1}
                borderRadius="md"
                bg={elevation === option.value ? "white" : "transparent"}
                color={elevation === option.value ? "brand.600" : "gray.500"}
                border="1px solid"
                borderColor={
                  elevation === option.value ? "gray.200" : "transparent"
                }
                boxShadow={elevation === option.value ? "sm" : "none"}
                fontSize="xs"
                fontWeight="800"
                _hover={{ bg: "white", color: "brand.600" }}
              >
                {option.label}
              </Button>
            ))}
          </Flex>

          <Box alignSelf="stretch" w="1px" bg="gray.200" />

          <Text
            flex="1"
            minW={0}
            fontSize="xs"
            color="gray.500"
            fontWeight="700"
            textAlign="right"
            lineHeight="1.35"
          >
            この詳細は{" "}
            <Link
              href={detailUrl}
              target="_blank"
              rel="noopener noreferrer"
              color="brand.600"
              textDecoration="underline"
              _hover={{ color: "brand.700" }}
            >
              Snow Forecast
            </Link>
            から
          </Text>
        </Flex>
      </Flex>

      <Text
        className="snow-forecast-desktop-source"
        display={{ base: "none", md: "block" }}
        mt={1.5}
        w="100%"
        maxW={SNOW_FORECAST_FEED_TOTAL_WIDTH}
        fontSize="xs"
        color="gray.500"
        fontWeight="700"
        textAlign="center"
      >
        この詳細は{" "}
        <Link
          href={detailUrl}
          target="_blank"
          rel="noopener noreferrer"
          color="brand.600"
          textDecoration="underline"
          _hover={{ color: "brand.700" }}
        >
          Snow Forecast
        </Link>
        から
      </Text>
    </Box>
  );
};

function useWeatherLinks(resort: Resort, snowForecastElevation: Elevation) {
  return useMemo(() => {
    const snowForecastLinks = getSnowForecastLinks(
      resort,
      snowForecastElevation,
    );
    const tenkiJpLinks = getTenkiJpLinks(resort);
    const weathernewsSpotId = resort.weatherIds?.weathernewsSpotId;
    const hasCoords =
      typeof resort.latitude === "number" &&
      typeof resort.longitude === "number";

    const links: Array<WeatherLink | null> = [
      ...snowForecastLinks.map(link => ({
        kind: "snowForecast" as const,
        id: link.id,
        label:
          snowForecastLinks.length === 1
            ? "Snow Forecast"
            : `Snow Forecast ${link.displayName}`,
        url: link.url,
        bg: "red.50",
        hoverBg: "red.100",
        color: "red.700",
      })),
      ...tenkiJpLinks.map(link => ({
        kind: "tenkiJp" as const,
        id: link.id,
        label:
          tenkiJpLinks.length === 1
            ? "tenki.jp"
            : `tenki.jp ${link.displayName}`,
        url: link.url,
        bg: "brand.50",
        hoverBg: "brand.100",
        color: "brand.700",
      })),
      {
        kind: "weathernews" as const,
        id: weathernewsSpotId ?? "weathernews",
        label: "ウェザーニュース",
        url: weathernewsSpotId
          ? `https://weathernews.jp/ski/spot/${weathernewsSpotId}/`
          : null,
        bg: "blue.50",
        hoverBg: "blue.100",
        color: "blue.800",
      },
      {
        kind: "windy" as const,
        id: `${resort.latitude},${resort.longitude}`,
        label: "Windy",
        url: hasCoords
          ? `https://www.windy.com/${resort.latitude}/${resort.longitude}?${resort.latitude},${resort.longitude},14,i:pressure,p:cities`
          : null,
        bg: "orange.50",
        hoverBg: "orange.100",
        color: "orange.700",
      },
    ];

    return links.filter((link): link is WeatherLink => link !== null);
  }, [resort, snowForecastElevation]);
}

function getTenkiJpLinks(resort: Resort) {
  const tenkiJpEntries = resort.weatherIds?.tenkijp;

  if (!tenkiJpEntries || tenkiJpEntries.length === 0) return [];

  return tenkiJpEntries.map(entry => ({
    id: entry.tenkijpId,
    displayName: entry.displayName || entry.tenkijpName || entry.tenkijpId,
    url: `https://tenki.jp/season/ski/${entry.tenkijpId}/`,
  }));
}

function getSnowForecastLinks(
  resort: Resort,
  elevation: Elevation = "mid",
): SnowForecastLink[] {
  const links: SnowForecastLink[] = [];
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
      url: `https://ja.snow-forecast.com/resorts/${id}/6day/${elevation}`,
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
}
