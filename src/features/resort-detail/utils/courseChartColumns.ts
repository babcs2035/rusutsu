import { isCourseStatusVisible } from "@/features/map/utils/mapDisplaySettings";
import {
  COURSE_DIFFICULTY_META,
  type FinalizedCourseFeature,
  type FinalizedResortMapData,
  getCourseDifficulty,
  getSlopeColor,
} from "@/lib/finalizedResortGeojsonShared";
import {
  courseLengthMeters,
  summarizeCourseDistance,
} from "@/shared/course-lift/courseDistance";
import type { DistributionColumn } from "../components/DistributionChart";
import {
  groupSlopeBins,
  slopeDistribution,
  sumKnown,
} from "./courseDistribution";
import { hasSourceUrl } from "./currentConditions";
import { normalizeIconSymbol } from "./detailMetrics";

export type CourseStatusFilter = Parameters<typeof isCourseStatusVisible>[1];

const LEVEL_KEYS = [
  "beginner",
  "beginnerIntermediate",
  "intermediate",
  "intermediateAdvanced",
  "advanced",
  "unknown",
] as const;

const STATUS_KINDS = {
  "○": "open",
  "△": "limited",
  "×": "closed",
  不明: "unknown",
} as const;

/** 「不明」は状況不明の列と紛らわしいので、レベル側は明示する */
export const levelLabel = (key: string) =>
  key === "unknown"
    ? "レベル不明"
    : COURSE_DIFFICULTY_META[key as keyof typeof COURSE_DIFFICULTY_META].label;

/** 「営業中のみ」は地図と同じ営業状況で区間を絞る */
const createVisibilityTest =
  (statusFilter: CourseStatusFilter | null) =>
  (course: FinalizedCourseFeature) =>
    !statusFilter ||
    isCourseStatusVisible(
      // 地図の getFeatureStatusKind と同じ判定（leaflet を読み込まないよう記号から引く）
      STATUS_KINDS[normalizeIconSymbol(course.properties.status) ?? "不明"],
      statusFilter,
    );

const lengthOf = (course: FinalizedCourseFeature) =>
  courseLengthMeters(
    course.properties.slopeDistMap,
    course.properties.horizontalDistMap,
  );

export function buildLevelColumns(
  features: FinalizedCourseFeature[],
  statusFilter: CourseStatusFilter | null,
): DistributionColumn[] {
  const isShown = createVisibilityTest(statusFilter);
  return LEVEL_KEYS.flatMap(key => {
    const all = features.filter(
      course => getCourseDifficulty(course.properties.level) === key,
    );
    if (!all.length) return [];
    const open = all.filter(isShown);
    return [
      {
        key,
        // 棒は地図と同じ配色にして、地図で見た印象とそのまま結び付くようにする
        color: COURSE_DIFFICULTY_META[key].color,
        label: levelLabel(key),
        // 標高が未取得の線は水平距離で代える（一覧の並び替えと同じ距離）
        distance: sumKnown(all.map(lengthOf)).total ?? 0,
        openDistance: sumKnown(open.map(lengthOf)).total ?? 0,
      },
    ];
  });
}

export function buildSlopeColumns(
  features: FinalizedCourseFeature[],
  statusFilter: CourseStatusFilter | null,
): { columns: DistributionColumn[]; omitted: number } {
  const distribution = slopeDistribution(features);
  const openBins = groupSlopeBins(
    slopeDistribution(features.filter(createVisibilityTest(statusFilter))).bins,
  );
  return {
    omitted: distribution.omitted,
    // 棒は地図と同じ配色にして、地図で見た斜度の印象とそのまま結び付くようにする
    columns: groupSlopeBins(distribution.bins).map((bin, index) => ({
      key: bin.label,
      label: bin.label,
      color: getSlopeColor(bin.sample),
      distance: bin.distance,
      openDistance: openBins[index].distance,
    })),
  };
}

/** 滑走距離（m）。open は営業状況の出典があるときだけ（○・△のコース） */
export type CourseDistance = { total: number; open: number | null };

/** コースの滑走距離の合計と、そのうち営業中（○・△）の距離 */
export const createCourseDistance = (
  courses: FinalizedResortMapData["courses"] | null | undefined,
): CourseDistance | null => {
  const summary = summarizeCourseDistance(
    (courses?.features ?? []).map(course => ({
      slopeDistance: course.properties.slopeDistMap,
      horizontalDistance: course.properties.horizontalDistMap,
      status: course.properties.status,
    })),
    hasSourceUrl(courses?.sourceUrls),
  );
  return summary && { total: summary.total, open: summary.open };
};
