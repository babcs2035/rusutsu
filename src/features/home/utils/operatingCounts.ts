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
  feature.statusMappingNames?.some(name => name.trim() !== "") ?? false;

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

/**
 * 営業情報に対応付けたコースだけを一覧の分母にする。
 * 対応表が1件もない地図は、地図のコース数で「不明/N」にする。
 */
export const summarizeCoursesForList = (
  mapData: FinalizedResortMapData | null,
  fallbackTotal: number,
): OperatingCount | null => {
  const section = mapData?.courses;
  const courses = section?.features;
  if (!section || !courses?.length) return unknownCount(fallbackTotal);
  if (courses.some(isMapped)) return summarizeMappedCourses(courses);
  const summary = createMapCourseStatusSummary(section);
  return unknownCount(summary?.total ?? 0);
};

export const summarizeMappedCourses = (
  courses: FinalizedCourseFeature[],
): OperatingCount | null => {
  const summary = createMapCourseStatusSummary({
    source: "mixed",
    baseSource: "mixed",
    fileName: "",
    sourceUrls: [],
    features: courses.filter(isMapped),
  });
  return summary ? summarizeCourseStatusForList(summary) : null;
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
