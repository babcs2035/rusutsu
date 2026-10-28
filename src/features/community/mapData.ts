import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import type { CommunityMapData, CourseOption } from "./contract";

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
    })),
    center,
  };
}
