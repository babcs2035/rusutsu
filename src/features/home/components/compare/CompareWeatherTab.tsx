"use client";

import { Box, Flex, Heading, Link, Text } from "@chakra-ui/react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CompactSnowForecastEmbed } from "./CompactSnowForecastEmbed";
import {
  DESKTOP_WEATHER_LINK_WIDTH,
  DESKTOP_WEATHER_RESORT_INFO_WIDTH,
  MOBILE_SNOW_FORECAST_CROPPED_FEED_HEIGHT,
  MOBILE_SNOW_FORECAST_CROPPED_FEED_WIDTH,
  MOBILE_SNOW_FORECAST_FEED_TRANSFORM,
  MOBILE_SNOW_FORECAST_FEED_VIEWPORT_HEIGHT,
  SNOW_FORECAST_FEED_TOTAL_WIDTH,
  WEATHER_LINK_TOP_MODE_STYLES,
  WEATHER_PANEL_DESKTOP_WIDTH,
} from "./constants";
import type { Elevation, Resort, WeatherLink } from "./types";
import {
  getSnowForecastLinks,
  useWeatherLinks,
} from "./useCompareWeatherLinks";

export const CompareWeatherTab = ({
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
