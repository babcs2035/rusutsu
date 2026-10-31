import type { ResortLink } from "@/features/lift/types";

export const WEATHER_LINK_KEYS = [
  "tenkijpUrls",
  "snowForecastUrls",
  "weathernewsUrls",
] as const;
export type WeatherLinkKey = (typeof WEATHER_LINK_KEYS)[number];

const HOSTS: Record<WeatherLinkKey, readonly string[]> = {
  tenkijpUrls: ["tenki.jp", "www.tenki.jp"],
  snowForecastUrls: [
    "snow-forecast.com",
    "www.snow-forecast.com",
    "ja.snow-forecast.com",
  ],
  weathernewsUrls: ["weathernews.jp", "www.weathernews.jp"],
};

/** リンク先の地点だけを読む。標高は予報ウィジェットの選択に従う。 */
export function parseWeatherLinkId(
  key: WeatherLinkKey,
  value: string,
): string | null {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      !HOSTS[key].includes(url.hostname)
    )
      return null;
    const patterns: Record<WeatherLinkKey, RegExp> = {
      tenkijpUrls: /^\/season\/ski\/(\d+\/\d+\/\d+)(?:\/(?:index\.html)?)?$/u,
      snowForecastUrls:
        /^\/resorts\/([A-Za-z0-9_-]+)(?:\/(?:6day\/(?:top|mid|bot)|forecasts\/feed\/(?:top|mid|bot)\/m))?\/?$/u,
      weathernewsUrls: /^\/ski\/spot\/(\d+)(?:\/(?:index\.html)?)?$/u,
    };
    return patterns[key].exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function weatherLinkUrl(key: WeatherLinkKey, id: string): string {
  switch (key) {
    case "tenkijpUrls":
      return `https://tenki.jp/season/ski/${id}/`;
    case "snowForecastUrls":
      return `https://ja.snow-forecast.com/resorts/${id}/6day/mid`;
    case "weathernewsUrls":
      return `https://weathernews.jp/ski/spot/${id}/`;
  }
}

const readLinks = (value: unknown): ResortLink[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item === "string") return [{ url: item }];
    if (!item || typeof item !== "object" || typeof item.url !== "string")
      return [];
    return [
      {
        url: item.url,
        ...(typeof item.description === "string"
          ? { description: item.description }
          : {}),
      },
    ];
  });
};

export function weatherLinksMapFromDocument(
  content: string | null,
): Record<string, Record<string, unknown>> {
  if (content === null) return {};
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, entry]) =>
          entry && typeof entry === "object" && !Array.isArray(entry),
      ),
    );
  } catch {
    return {};
  }
}

export type ResortWeatherIds = {
  tenkijp: Array<{
    tenkijpId: string;
    tenkijpName: string | null;
    displayName: string | null;
  }>;
  snowForecast: Array<{
    snowForecastId: string;
    snowForecastName: string | null;
    displayName: string | null;
  }>;
  weathernews: Array<{
    weathernewsSpotId: string;
    displayName: string | null;
  }>;
  weathernewsSpotId: string | null;
  SnowForecastId: null;
  SnowForecastName: null;
};

/** 未設定と、管理者が明示的に空にした設定を区別する。 */
export function weatherIdsFromLinks(
  entry: Record<string, unknown> | undefined,
): ResortWeatherIds | null {
  if (!entry || !WEATHER_LINK_KEYS.some(key => Object.hasOwn(entry, key)))
    return null;
  const entries = (key: WeatherLinkKey) => {
    const seen = new Set<string>();
    return readLinks(entry[key]).flatMap(link => {
      const id = parseWeatherLinkId(key, link.url);
      if (!id || seen.has(id)) return [];
      seen.add(id);
      return [{ id, name: link.description || null }];
    });
  };
  return {
    tenkijp: entries("tenkijpUrls").map(({ id, name }) => ({
      tenkijpId: id,
      tenkijpName: name,
      displayName: name,
    })),
    snowForecast: entries("snowForecastUrls").map(({ id, name }) => ({
      snowForecastId: id,
      snowForecastName: name,
      displayName: name,
    })),
    weathernews: entries("weathernewsUrls").map(({ id, name }) => ({
      weathernewsSpotId: id,
      displayName: name,
    })),
    weathernewsSpotId: entries("weathernewsUrls")[0]?.id ?? null,
    SnowForecastId: null,
    SnowForecastName: null,
  };
}

export function resolveResortWeatherIds(
  links: Record<string, Record<string, unknown>>,
  resortId: string,
  sourceIds: readonly string[] = [],
): ResortWeatherIds | null {
  const own = weatherIdsFromLinks(links[resortId]);
  if (own) return own;
  const sources = sourceIds.flatMap(id => {
    const entry = weatherIdsFromLinks(links[id]);
    return entry ? [entry] : [];
  });
  if (!sources.length) return null;
  const tenkijp = sources.flatMap(entry => entry.tenkijp);
  const snowForecast = sources.flatMap(entry => entry.snowForecast);
  const weathernews = sources.flatMap(entry => entry.weathernews);
  return {
    tenkijp: tenkijp.filter(
      (entry, index) =>
        tenkijp.findIndex(item => item.tenkijpId === entry.tenkijpId) === index,
    ),
    snowForecast: snowForecast.filter(
      (entry, index) =>
        snowForecast.findIndex(
          item => item.snowForecastId === entry.snowForecastId,
        ) === index,
    ),
    weathernews: weathernews.filter(
      (entry, index) =>
        weathernews.findIndex(
          item => item.weathernewsSpotId === entry.weathernewsSpotId,
        ) === index,
    ),
    weathernewsSpotId: weathernews[0]?.weathernewsSpotId ?? null,
    SnowForecastId: null,
    SnowForecastName: null,
  };
}

export function getWeathernewsLinks(
  weatherIds:
    | {
        weathernews?: Array<{
          weathernewsSpotId: string;
          displayName: string | null;
        }>;
        weathernewsSpotId?: string | null;
      }
    | null
    | undefined,
): Array<{ id: string; displayName: string; url: string }> {
  if (!weatherIds) return [];
  const entries =
    weatherIds.weathernews ??
    (weatherIds.weathernewsSpotId
      ? [{ weathernewsSpotId: weatherIds.weathernewsSpotId, displayName: null }]
      : []);
  return entries.map(({ weathernewsSpotId, displayName }) => ({
    id: weathernewsSpotId,
    displayName: displayName || weathernewsSpotId,
    url: weatherLinkUrl("weathernewsUrls", weathernewsSpotId),
  }));
}
