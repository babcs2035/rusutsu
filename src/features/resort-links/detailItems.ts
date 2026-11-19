import {
  getSnowForecastLinks,
  getTenkiJpLinks,
  type WeatherLinkResort,
} from "@/features/weather/useWeatherLinks";
import { getWeathernewsLinks } from "@/features/weather/weatherLinks";
import {
  linkItem as item,
  type LiftTicketLinkSource,
  liftTicketLinkItems,
} from "./liftTicketLinks";
import type { ResortLinkItem } from "./model";

/**
 * 詳細データがすでに持っているURL（営業状況の取得元・リフト券の出典・雪マジ）を、リンク一覧の形にする。
 * これらは持ち主が別にいるので、リンクのテーブルにはコピーしていない。
 */
type DetailLinkSource = {
  latitude?: number | null;
  longitude?: number | null;
  operationStatus?: {
    courseSourceUrls: string[];
    liftSourceUrls: string[];
  } | null;
  currentConditions?: Array<{
    weather?: { sourceUrls: string[] } | null;
    news?: { sourceUrls: string[] } | null;
  }>;
  /** 新しいシーズンが先頭 */
  liftTickets?: LiftTicketLinkSource[];
  yukiMagi?: { url?: string | null } | null;
  weatherIds?: WeatherLinkResort["weatherIds"];
};

/** 天気タブと同じ天気サイトのリンク。リンク集でも天気タブと同じ地点だけを出す */
export const DETAIL_WEATHER_TYPES = new Set([
  "snowForecast",
  "tenkijp",
  "weathernews",
  "windy",
]);

const weatherItems = (
  type: string,
  links: Array<{ displayName: string; url: string }>,
): ResortLinkItem[] =>
  links.flatMap((link, index) =>
    item(
      type,
      type,
      link.url,
      index,
      links.length > 1 ? link.displayName : null,
    ),
  );

export const detailLinkItems = (resort: DetailLinkSource): ResortLinkItem[] => {
  const conditions = resort.currentConditions ?? [];
  return [
    ...(resort.operationStatus?.courseSourceUrls ?? []).flatMap((url, i) =>
      item("courseStatus", "official", url, i),
    ),
    ...(resort.operationStatus?.liftSourceUrls ?? []).flatMap((url, i) =>
      item("liftStatus", "official", url, i),
    ),
    ...conditions.flatMap(c =>
      (c.weather?.sourceUrls ?? []).flatMap((url, i) =>
        item("officialSnowReport", "official", url, i),
      ),
    ),
    ...conditions.flatMap(c =>
      (c.news?.sourceUrls ?? []).flatMap((url, i) =>
        item("news", "official", url, i),
      ),
    ),
    // リフト券は最新のシーズンだけを見る
    ...liftTicketLinkItems(resort.liftTickets?.[0]),
    ...item("yukiMagi", "yukiMagi", resort.yukiMagi?.url),
    ...weatherItems(
      "snowForecast",
      getSnowForecastLinks({
        weatherIds: resort.weatherIds ?? null,
        latitude: resort.latitude ?? null,
        longitude: resort.longitude ?? null,
      } as WeatherLinkResort),
    ),
    ...weatherItems(
      "tenkijp",
      getTenkiJpLinks({ weatherIds: resort.weatherIds } as WeatherLinkResort),
    ),
    ...weatherItems("weathernews", getWeathernewsLinks(resort.weatherIds)),
    ...(typeof resort.latitude === "number" &&
    typeof resort.longitude === "number"
      ? item(
          "windy",
          "windy",
          // 天気タブのリンクと同じURL
          `https://www.windy.com/${resort.latitude}/${resort.longitude}?${resort.latitude},${resort.longitude},14,i:pressure,p:cities`,
        )
      : []),
  ];
};
