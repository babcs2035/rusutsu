import {
  isCourseStatusVisible,
  OPEN_COURSE_STATUSES,
} from "@/features/map/utils/mapDisplaySettings";
import {
  COURSE_DIFFICULTY_META,
  type FinalizedCourseFeature,
  type FinalizedResortMapData,
  getCourseDifficulty,
  getSlopeColor,
} from "@/lib/finalizedResortGeojsonShared";
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
        distance: sumKnown(all.map(c => c.properties.slopeDistMap)).total ?? 0,
        openDistance:
          sumKnown(open.map(c => c.properties.slopeDistMap)).total ?? 0,
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
  const columns = buildLevelColumns(
    courses?.features ?? [],
    OPEN_COURSE_STATUSES,
  );
  const total = columns.reduce((sum, column) => sum + column.distance, 0);
  if (total <= 0) return null;
  return {
    total,
    open: hasSourceUrl(courses?.sourceUrls)
      ? columns.reduce((sum, column) => sum + (column.openDistance ?? 0), 0)
      : null,
  };
};
