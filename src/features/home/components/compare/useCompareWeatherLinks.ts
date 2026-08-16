import { useMemo } from "react";
import type { Elevation, Resort, SnowForecastLink, WeatherLink } from "./types";

export function useWeatherLinks(
  resort: Resort,
  snowForecastElevation: Elevation,
) {
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
        bg: "bg-red-50",
        hoverBg: "hover:bg-red-100",
        color: "text-red-700",
      })),
      ...tenkiJpLinks.map(link => ({
        kind: "tenkiJp" as const,
        id: link.id,
        label:
          tenkiJpLinks.length === 1
            ? "tenki.jp"
            : `tenki.jp ${link.displayName}`,
        url: link.url,
        // brand.* は旧 Chakra テーマで blue パレットのエイリアスだった
        bg: "bg-blue-50",
        hoverBg: "hover:bg-blue-100",
        color: "text-blue-700",
      })),
      {
        kind: "weathernews" as const,
        id: weathernewsSpotId ?? "weathernews",
        label: "ウェザーニュース",
        url: weathernewsSpotId
          ? `https://weathernews.jp/ski/spot/${weathernewsSpotId}/`
          : null,
        bg: "bg-blue-50",
        hoverBg: "hover:bg-blue-100",
        color: "text-blue-800",
      },
      {
        kind: "windy" as const,
        id: `${resort.latitude},${resort.longitude}`,
        label: "Windy",
        url: hasCoords
          ? `https://www.windy.com/${resort.latitude}/${resort.longitude}?${resort.latitude},${resort.longitude},14,i:pressure,p:cities`
          : null,
        bg: "bg-orange-50",
        hoverBg: "hover:bg-orange-100",
        color: "text-orange-700",
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

export function getSnowForecastLinks(
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
