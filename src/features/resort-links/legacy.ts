import type { ResortLinks } from "@/features/lift/types";
import type { ResortLinkItem } from "./model";

/**
 * 旧来のリンク文書（SkiResortLinks.json）の項目を、リンク一覧の種類へ対応づける。
 * source は、公式のページ・アカウントなら "official"、外部サイトならそのサイトの名前。
 */
const LEGACY_LINK_TYPES: Record<
  keyof ResortLinks,
  { type: string; source: string }
> = {
  officialSiteUrls: { type: "officialTop", source: "official" },
  newsUrls: { type: "news", source: "official" },
  mapUrls: { type: "trailMap", source: "official" },
  mapPageUrls: { type: "trailMapPage", source: "official" },
  googleMapsUrls: { type: "googleMaps", source: "googleMaps" },
  skiSchoolUrls: { type: "skiSchool", source: "official" },
  snowboardSchoolUrls: { type: "snowboardSchool", source: "official" },
  skiResortInfoUrls: { type: "skiResortInfo", source: "skiResortInfo" },
  espeYukiUrls: { type: "espeYuki", source: "espeYuki" },
  gelandePlusTubeUrls: { type: "gelandePlusTube", source: "gelandePlusTube" },
  youtubeUrls: { type: "officialYoutube", source: "official" },
  lineUrls: { type: "line", source: "official" },
  xUrls: { type: "x", source: "official" },
  threadsUrls: { type: "threads", source: "official" },
  instagramUrls: { type: "instagram", source: "official" },
  facebookUrls: { type: "facebook", source: "official" },
  tenkijpUrls: { type: "tenkijp", source: "tenkijp" },
  snowForecastUrls: { type: "snowForecast", source: "snowForecast" },
  weathernewsUrls: { type: "weathernews", source: "weathernews" },
};

/** 説明欄が点検用のメモ（掲載状況・年度など）で、画面の名前に使えない項目 */
const NOTE_ONLY_DESCRIPTIONS = new Set<keyof ResortLinks>([
  "mapUrls",
  "mapPageUrls",
]);

export const legacyLinkItems = (
  links: Partial<ResortLinks> | undefined,
): ResortLinkItem[] =>
  Object.entries(LEGACY_LINK_TYPES).flatMap(([key, { type, source }]) =>
    (links?.[key as keyof ResortLinks] ?? []).flatMap((link, index) =>
      /^https?:\/\//u.test(link.url)
        ? [
            {
              type,
              source,
              category: null,
              label: NOTE_ONLY_DESCRIPTIONS.has(key as keyof ResortLinks)
                ? null
                : link.description?.trim() || null,
              url: link.url,
              note: null,
              sortOrder: index,
            },
          ]
        : [],
    ),
  );
