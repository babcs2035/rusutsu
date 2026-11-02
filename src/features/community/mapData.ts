import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import type {
  CommunityMapData,
  CourseOption,
  ReportEntryDraft,
} from "./contract";
import { getLiftDistance } from "./liftRideTime";
import { nearestFeature } from "./location";

/** 表示範囲を広げても、投稿は対象の線を持つスキー場へ保存する。 */
export function reportResortId(
  data: CommunityMapData,
  entry: ReportEntryDraft,
  fallback: string,
) {
  const featureId = entry.liftId ?? entry.courseId;
  const nearest =
    !featureId && entry.longitude != null && entry.latitude != null
      ? nearestFeature(
          [entry.longitude, entry.latitude],
          [...data.courses, ...data.lifts],
        )?.id
      : null;
  return (
    data.resorts?.find(resort =>
      entry.liftId
        ? resort.liftIds.includes(entry.liftId)
        : featureId
          ? resort.courseIds.includes(featureId)
          : nearest &&
            (resort.courseIds.includes(nearest) ||
              resort.liftIds.includes(nearest)),
    )?.id ?? fallback
  );
}

export function resortReportMap(
  data: CommunityMapData,
  resortId: string,
): CommunityMapData {
  const resort = data.resorts?.find(item => item.id === resortId);
  return resort
    ? {
        ...data,
        courses: data.courses.filter(item =>
          resort.courseIds.includes(item.id),
        ),
        lifts: data.lifts.filter(item => resort.liftIds.includes(item.id)),
        resorts: [resort],
      }
    : data;
}

/**
 * 投稿で選べるコース・リフト。詳細の地図と同じデータから作り、
 * 画面で選べるものとサーバーで受け付けるものを一致させる。
 */
export function communityMapData(
  name: string,
  center: [number, number],
  data: Pick<FinalizedResortMapData, "courses" | "lifts"> | null | undefined,
): CommunityMapData {
  const courses = new Map<string, CourseOption>();
  for (const feature of data?.courses?.features ?? []) {
    const group = courses.get(feature.groupId);
    if (group) group.lines.push(feature.coordinates);
    else
      courses.set(feature.groupId, {
        id: feature.groupId,
        name: feature.displayName,
        coordinates: feature.coordinates,
        lines: [feature.coordinates],
      });
  }
  return {
    name,
    courses: [...courses.values()],
    lifts: (data?.lifts?.features ?? []).map(feature => ({
      id: feature.id,
      name: feature.name,
      coordinates: feature.coordinates,
      lines: [feature.coordinates],
      distance: getLiftDistance(
        feature.properties.distance,
        feature.properties.slopeDistMap,
      ),
    })),
    center,
  };
}
