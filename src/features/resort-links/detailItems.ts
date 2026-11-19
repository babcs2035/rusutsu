import {
  getSnowForecastLinks,
  getTenkiJpLinks,
  type WeatherLinkResort,
} from "@/features/weather/useWeatherLinks";
import { getWeathernewsLinks } from "@/features/weather/weatherLinks";
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
  liftTickets?: Array<{
    main_links?: {
      lift_price_url?: string | null;
      lift_purchase_url?: string | null;
      rental_price_url?: string | null;
      rental_purchase_url?: string | null;
    } | null;
    sources?: Array<{ id: string; url?: string | null }>;
    channels?: Array<{ url?: string | null }>;
  }>;
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

const item = (
  type: string,
  source: string,
  url: string | null | undefined,
  sortOrder = 0,
  label: string | null = null,
): ResortLinkItem[] =>
  url && /^https?:\/\//u.test(url)
    ? [{ type, source, category: null, label, url, note: null, sortOrder }]
    : [];

export const detailLinkItems = (resort: DetailLinkSource): ResortLinkItem[] => {
  const conditions = resort.currentConditions ?? [];
  // リフト券は最新のシーズンだけを見る。主なリンク（main_links）が未設定のデータでは、
  // 料金の出典の先頭と、URLのある販売経路で代える
  const ticket = resort.liftTickets?.[0];
  const ticketLinks = ticket
    ? {
        price: ticket.main_links?.lift_price_url ?? ticket.sources?.[0]?.url,
        purchase:
          ticket.main_links?.lift_purchase_url ??
          ticket.channels?.find(channel => channel.url)?.url,
        rentalPrice: ticket.main_links?.rental_price_url,
        rentalPurchase: ticket.main_links?.rental_purchase_url,
      }
    : null;
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
    ...item("liftTicketPrice", "official", ticketLinks?.price),
    ...item("webPurchase", "official", ticketLinks?.purchase),
    ...item("rentalPrice", "official", ticketLinks?.rentalPrice),
    ...item("rentalPrice", "official", ticketLinks?.rentalPurchase, 1, "予約"),
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
