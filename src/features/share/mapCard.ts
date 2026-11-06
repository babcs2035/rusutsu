import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";

export const SHARE_IMAGE_VERSION = "4";
export const SHARE_IMAGE_WIDTH = 1200;
export const SHARE_IMAGE_HEIGHT = 630;
export const SHARE_MAP_SIZES = {
  detail: { width: 1160, height: 458 },
  pair: { width: 1160, height: 211 },
  grid: { width: 572, height: 211 },
} as const;
export type ShareMapSize = keyof typeof SHARE_MAP_SIZES;

export const shareMapSize = (count: number, index = 0): ShareMapSize =>
  count === 1
    ? "detail"
    : count === 2 || (count === 3 && index === 2)
      ? "pair"
      : "grid";

/** 日々変わる営業情報を画像へ焼き込まず、地形の変更時だけ素材を作り直す。 */
export function shareMapData(
  data: FinalizedResortMapData | null,
): FinalizedResortMapData | null {
  if (!data) return null;
  return {
    courses: data.courses
      ? {
          ...data.courses,
          observedAt: null,
          sourceUrls: [],
          features: data.courses.features.map(feature => ({
            ...feature,
            latestStatusName: null,
            statusSnapshotId: null,
            sourceUrls: [],
            properties: {
              ...feature.properties,
              status: null,
              update: null,
              latestNote: null,
            },
          })),
        }
      : null,
    lifts: data.lifts
      ? {
          ...data.lifts,
          observedAt: null,
          sourceUrls: [],
          features: data.lifts.features.map(feature => ({
            ...feature,
            latestStatusName: null,
            statusSnapshotId: null,
            properties: {
              ...feature.properties,
              status: null,
              update: null,
              latestNote: null,
            },
          })),
        }
      : null,
  };
}

export const hasShareMap = (data: FinalizedResortMapData | null) =>
  Boolean(data?.courses?.features.length || data?.lifts?.features.length);

export const hasOsmMap = (data: FinalizedResortMapData | null) =>
  Boolean(
    data?.courses &&
      (data.courses.source.includes("osm") ||
        data.courses.source === "mixed" ||
        data.courses.features.some(f => f.verificationStatus === "unverified")),
  );

export function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, char => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[char];
  });
}
