import { createMapCourseStatusSummary } from "@/features/resort-detail/utils/courseStatusSummary";
import type { CourseStatusSummary } from "@/lib/courseStatusSummary";
import type {
  FinalizedCourseFeature,
  FinalizedLiftFeature,
  FinalizedResortMapData,
} from "@/lib/finalizedResortGeojsonShared";

export type OperatingCount = {
  active: number | null;
  total: number;
};

export type ResortOperatingCounts = {
  hasMap: boolean;
  courses: OperatingCount | null;
  lifts: OperatingCount | null;
};

const isMapped = (feature: { statusMappingNames?: string[] }) =>
  (feature.statusMappingNames?.length ?? 0) > 0;

const isOpen = (status: string | null | undefined) =>
  status && /[○〇◯△]/u.test(status);

const isClosed = (status: string | null | undefined) =>
  status && /[×✕✖]/u.test(status);

const summarize = (states: Array<boolean | null>): OperatingCount | null => {
  if (states.length === 0) return null;
  if (states.includes(null)) return { active: null, total: states.length };
  return {
    active: states.filter(Boolean).length,
    total: states.length,
  };
};

const unknownCount = (total: number): OperatingCount | null =>
  total > 0 ? { active: null, total } : null;

export const summarizeCourseStatusForList = (
  summary: CourseStatusSummary,
): OperatingCount | null => {
  if (summary.total === 0) return null;
  return {
    active: summary.unknown === 0 ? summary.open + summary.partial : null,
    total: summary.total,
  };
};

/** 詳細と同じ地図上のコースと状態から集計する。 */
export const summarizeCoursesForList = (
  mapData: FinalizedResortMapData | null,
  fallbackTotal: number,
): OperatingCount | null => {
  const summary = createMapCourseStatusSummary(mapData?.courses);
  return summary && summary.total > 0
    ? summarizeCourseStatusForList(summary)
    : unknownCount(fallbackTotal);
};

export const summarizeMappedCourses = (
  courses: FinalizedCourseFeature[],
): OperatingCount | null => {
  const groups = new Map<string, Array<string | null | undefined>>();
  for (const course of courses) {
    if (!isMapped(course)) continue;
    const statuses = groups.get(course.groupId) ?? [];
    statuses.push(course.properties.status);
    groups.set(course.groupId, statuses);
  }

  const states = [...groups.values()].map(statuses => {
    if (statuses.some(isOpen)) return true;
    if (statuses.every(isClosed)) return false;
    return null;
  });
  return summarize(states);
};

export const summarizeMappedLifts = (
  lifts: FinalizedLiftFeature[],
): OperatingCount | null =>
  summarize(
    lifts.filter(isMapped).map(lift => {
      if (isOpen(lift.properties.status)) return true;
      if (isClosed(lift.properties.status)) return false;
      return null;
    }),
  );
