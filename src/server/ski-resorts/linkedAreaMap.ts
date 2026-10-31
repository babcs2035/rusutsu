import "server-only";

import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import { getDataDocument } from "@/server/data-documents/client";

/**
 * 連携エリアの地図は親がまとめて持ち、各線の properties.memberResortId に
 * どのスキー場の線かを記録している。所属スキー場の詳細では自分の線だけを出し、
 * 「同時に表示」で親の地図全体を出す。
 */
const OWNER_SOURCE_FOLDERS = [
  "slope_before",
  "slope_before_osm",
  "lift_before",
] as const;

export const MEMBER_RESORT_ID_PROPERTY = "memberResortId";

type Feature = { properties?: Record<string, unknown> | null };

/** 線の entityId → 所属スキー場ID。振り分けていない地図なら空 */
export async function readLinkedAreaOwners(areaId: string) {
  const owners = new Map<string, string>();
  const documents = await Promise.all(
    OWNER_SOURCE_FOLDERS.map(folder =>
      getDataDocument(`resorts-temporary/${folder}/${areaId}.geojson`),
    ),
  );
  for (const document of documents) {
    if (!document) continue;
    const parsed = JSON.parse(document.content) as { features?: Feature[] };
    for (const feature of parsed.features ?? []) {
      const entityId = feature.properties?.entityId;
      const owner = feature.properties?.[MEMBER_RESORT_ID_PROPERTY];
      if (typeof entityId === "string" && typeof owner === "string")
        owners.set(entityId, owner);
    }
  }
  return owners;
}

// OSM のコースは表示用IDの先頭に "osm-" が付く
const ownerOf = (owners: Map<string, string>, id: string) =>
  owners.get(id) ?? owners.get(id.replace(/^osm-/u, ""));

/** 自分の線と、まだ振り分けていない線だけを残す */
export function filterLinkedAreaMap(
  data: FinalizedResortMapData,
  owners: Map<string, string>,
  memberId: string,
  memberStatusSummary: FinalizedResortMapData["courseStatusSummary"],
): FinalizedResortMapData {
  const isOwn = (id: string) => {
    const owner = ownerOf(owners, id);
    return owner === undefined || owner === memberId;
  };
  const courses = data.courses?.features.filter(feature => isOwn(feature.id));
  const lifts = data.lifts?.features.filter(feature => isOwn(feature.id));
  return {
    courses:
      data.courses && courses?.length
        ? { ...data.courses, features: courses }
        : null,
    lifts:
      data.lifts && lifts?.length ? { ...data.lifts, features: lifts } : null,
    // 公式の営業状況の件数は、そのスキー場自身の取得結果で数える
    courseStatusSummary: memberStatusSummary ?? null,
  };
}
