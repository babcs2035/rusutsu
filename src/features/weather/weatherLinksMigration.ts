import { z } from "zod";
import type { ResortLink } from "@/features/lift/types";
import { parseLinksDocument } from "@/features/links/model";
import {
  parseWeatherLinkId,
  WEATHER_LINK_KEYS,
  type WeatherLinkKey,
  weatherLinkUrl,
} from "./weatherLinks";

const legacySchema = z.array(
  z.object({
    skiResortId: z.string().regex(/^[a-z0-9-]+$/u),
    tenkijp: z
      .array(
        z.object({
          tenkijpId: z.string().min(1),
          tenkijpName: z.string().nullish(),
          displayName: z.string().nullish(),
        }),
      )
      .optional(),
    snowForecast: z
      .array(
        z.object({
          snowForecastId: z.string().min(1),
          snowForecastName: z.string().nullish(),
          displayName: z.string().nullish(),
        }),
      )
      .optional(),
    weathernewsSpotId: z.string().nullish(),
    weathernewsSpotName: z.string().nullish(),
    SnowForecastId: z.string().nullish(),
    SnowForecastName: z.string().nullish(),
    snowForecastId: z.string().nullish(),
    snowForecastName: z.string().nullish(),
  }),
);

export function prepareWeatherLinksMigration(content: string, legacy: unknown) {
  const map = parseLinksDocument(content);
  const entries = legacySchema.parse(legacy);
  const seen = new Set<string>();
  let addedFields = 0;
  let addedLinks = 0;
  let preservedFields = 0;
  for (const entry of entries) {
    if (seen.has(entry.skiResortId))
      throw new Error(`Duplicate weather resort: ${entry.skiResortId}`);
    seen.add(entry.skiResortId);
    const link = (
      key: WeatherLinkKey,
      id: string,
      name?: string | null,
    ): ResortLink => {
      const url = weatherLinkUrl(key, id);
      if (parseWeatherLinkId(key, url) !== id)
        throw new Error(`Invalid weather ID: ${entry.skiResortId}/${key}`);
      return { url, ...(name ? { description: name } : {}) };
    };
    const snowForecast = (entry.snowForecast ?? []).map(item =>
      link(
        "snowForecastUrls",
        item.snowForecastId,
        item.displayName || item.snowForecastName,
      ),
    );
    const legacyId = entry.SnowForecastId ?? entry.snowForecastId;
    if (legacyId)
      snowForecast.push(
        link(
          "snowForecastUrls",
          legacyId,
          entry.SnowForecastName ?? entry.snowForecastName,
        ),
      );
    const unique = (items: ResortLink[]) =>
      items.filter(
        (item, index) =>
          items.findIndex(other => other.url === item.url) === index,
      );
    const fields: Record<WeatherLinkKey, ResortLink[]> = {
      tenkijpUrls: unique(
        (entry.tenkijp ?? []).map(item =>
          link(
            "tenkijpUrls",
            item.tenkijpId,
            item.displayName || item.tenkijpName,
          ),
        ),
      ),
      snowForecastUrls: unique(snowForecast),
      weathernewsUrls: entry.weathernewsSpotId
        ? [
            link(
              "weathernewsUrls",
              entry.weathernewsSpotId,
              entry.weathernewsSpotName,
            ),
          ]
        : [],
    };
    map[entry.skiResortId] ??= {};
    const current = map[entry.skiResortId];
    for (const key of WEATHER_LINK_KEYS) {
      // 空配列も管理者の選択。再実行で初期値を復活させない。
      if (Object.hasOwn(current, key)) {
        preservedFields++;
        continue;
      }
      current[key] = fields[key];
      addedFields++;
      addedLinks += fields[key].length;
    }
  }
  return {
    content: addedFields ? `${JSON.stringify(map, null, 2)}\n` : content,
    resorts: entries.length,
    addedFields,
    addedLinks,
    preservedFields,
  };
}
