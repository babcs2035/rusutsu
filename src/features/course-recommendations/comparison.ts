import type { FinalizedCourseGroup } from "@/features/resort-detail/types";
import { RECOMMENDATION, recommendationSelection } from "./algorithm";

type Differences = {
  maxSlopeDifference: number;
  steepDistanceDifference: number;
  slopeDifference: number;
  lengthDifference: number;
};

export function comparisonScoreRows(course: Differences) {
  return [
    {
      label: "最大斜度",
      difference: course.maxSlopeDifference,
      weight: RECOMMENDATION.maxSlopeWeight,
    },
    {
      label: "急斜面の距離",
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
