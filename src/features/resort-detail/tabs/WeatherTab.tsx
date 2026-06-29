"use client";

import { Box, Flex, Heading, Link } from "@chakra-ui/react";
import { useMemo } from "react";
import {
  SnowDepthLineChart,
  SnowForecastEmbed,
} from "@/features/weather/WeatherChart";
import type { SnowDepthsT } from "@/types/weathers";
import type { Resort } from "../types";

export const WeatherTab = ({ resort }: { resort: Resort }) => {
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
