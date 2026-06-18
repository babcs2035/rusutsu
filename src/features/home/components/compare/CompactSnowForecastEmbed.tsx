"use client";

import { Box, Button, Flex, Link, Spinner, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DESKTOP_SNOW_FORECAST_FEED_INITIAL_SCROLL_X,
  DESKTOP_SNOW_FORECAST_FEED_INITIAL_SCROLL_Y,
  ELEVATION_OPTIONS,
  MOBILE_SNOW_FORECAST_CROPPED_FEED_HEIGHT,
  MOBILE_SNOW_FORECAST_CROPPED_FEED_WIDTH,
  MOBILE_SNOW_FORECAST_FEED_TRANSFORM,
  MOBILE_SNOW_FORECAST_FEED_VIEWPORT_HEIGHT,
  SNOW_FORECAST_ELEVATION_CONTROLS_WIDTH,
  SNOW_FORECAST_FEED_INITIAL_SCROLL_Y_RATIO,
  SNOW_FORECAST_FEED_TOTAL_WIDTH,
  SNOW_FORECAST_FEED_VIEWPORT_HEIGHT,
  SNOW_FORECAST_FEED_ZOOM,
  SNOW_FORECAST_SOURCE_HEIGHT,
  SNOW_FORECAST_SOURCE_WIDTH,
} from "./constants";
import type { Elevation, SnowForecastLink } from "./types";

export const CompactSnowForecastEmbed = ({
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
