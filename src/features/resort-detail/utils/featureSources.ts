import {
  type FinalizedLiftFeature,
  parseFinalizedCourseName,
} from "@/lib/finalizedResortGeojsonShared";
import type { FinalizedCourseGroup } from "../types";
import { sourceUrls } from "./currentConditions";

export type FeatureSourceMatch = {
  mapName: string;
  officialNames: string[];
};

export type FeatureStatusSource = {
  urls: string[];
  update: string | null;
  matches: FeatureSourceMatch[];
};

function matchingNames(feature: {
  latestStatusName?: string | null;
  statusMappingNames?: string[];
}) {
  // Prefer the row actually fetched, rather than an old alias in the mapping.
  return feature.latestStatusName
    ? [feature.latestStatusName]
    : [...new Set(feature.statusMappingNames ?? [])];
}

export function courseStatusSources(
  group: FinalizedCourseGroup,
  fallback: string[],
) {
  const sources = new Map<string, FeatureStatusSource>();
  for (const course of group.courses) {
    const urls = sourceUrls(course.sourceUrls);
    const originalSection = course.name
      ? parseFinalizedCourseName(course.name).sectionName
      : null;
    const section = originalSection ?? course.sectionName;
    const source = {
      urls: urls.length ? urls : sourceUrls(fallback),
      update: course.properties.update,
      matches: [
        {
          mapName: section
            ? `${group.displayName}（${section}）`
            : group.displayName,
          officialNames: matchingNames(course),
        },
      ],
    };
    const key = JSON.stringify([source.urls, source.update]);
    const previous = sources.get(key);
    const matches = [...(previous?.matches ?? []), ...source.matches];
    // Repeated geometry segments must not repeat the same correspondence.
    const unique = new Map(
      matches.map(match => [JSON.stringify(match), match]),
    );
    sources.set(key, { ...source, matches: [...unique.values()] });
  }
  return [...sources.values()];
}

export function liftStatusSources(
  lift: FinalizedLiftFeature,
  urls: string[],
): FeatureStatusSource[] {
  return [
    {
      urls: sourceUrls(urls),
      update: lift.properties.update,
      matches: [{ mapName: lift.name, officialNames: matchingNames(lift) }],
    },
  ];
}

/**
 * Scroll-to-Text Fragment で、出典ページ内の該当名称の箇所へ直接飛ばす。
 * 対応していないブラウザや名称が見つからない場合は、普通にページが開くだけ。
 */
export function withTextFragment(url: string, texts: string[]) {
  const terms = [...new Set(texts.map(text => text.trim()).filter(Boolean))];
  if (!terms.length) return url;
  // "-" "," "&" は構文に使われるので、名称の中にあれば必ずエスケープする
  const encode = (text: string) =>
    encodeURIComponent(text).replace(
      /[-,&]/g,
      char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  const directive = `:~:${terms.map(term => `text=${encode(term)}`).join("&")}`;
  return url.includes("#") ? `${url}${directive}` : `${url}#${directive}`;
}
