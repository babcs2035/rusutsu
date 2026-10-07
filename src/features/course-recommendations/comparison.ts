import type { FinalizedCourseGroup } from "@/features/resort-detail/types";
import { RECOMMENDATION, recommendationSelection } from "./algorithm";

type Differences = {
  steepSlopeDifference: number;
  steepDistanceDifference: number;
  slopeDifference: number;
  lengthDifference: number;
};

export function comparisonScoreRows(course: Differences) {
  return [
    {
      label: "急斜面の斜度",
      difference: course.steepSlopeDifference,
      weight: RECOMMENDATION.steepSlopeWeight,
    },
    {
      label: "急な区間の長さ",
      difference: course.steepDistanceDifference,
      weight: RECOMMENDATION.steepDistanceWeight,
    },
    {
      label: "全体の斜度分布",
      difference: course.slopeDifference,
      weight: RECOMMENDATION.slopeWeight,
    },
    {
      label: "滑走距離",
      difference: course.lengthDifference,
      weight: RECOMMENDATION.distanceWeight,
    },
  ].map(row => ({
    ...row,
    similarity: 100 * (1 - row.difference),
    points: 100 * row.weight * (1 - row.difference),
  }));
}

/** Show the same main route used to produce the recommendation score. */
export function comparisonSourceGroup(group: FinalizedCourseGroup) {
  const selected = recommendationSelection(group.id, group.courses);
  if (!selected?.routeId) return group;
  return {
    ...group,
    courses: group.courses.filter(
      course => course.routeKey === selected.routeId,
    ),
  };
}
