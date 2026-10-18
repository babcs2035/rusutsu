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

/** 一覧では、標高未取得なら基本情報、営業情報未取得なら名前付きの地図を使う。 */
export const summarizeCoursesForList = (
  mapData: FinalizedResortMapData | null,
  fallbackTotal: number,
): OperatingCount | null => {
  const courses = mapData?.courses?.features;
  if (
    !courses?.length ||
    courses.some(
      course =>
        course.coordinates.length < 2 ||
        course.coordinates.some(coordinate => !Number.isFinite(coordinate[2])),
    )
  ) {
    return unknownCount(fallbackTotal);
  }

  if (!mapData?.courseStatusSummary) {
    const namedGroups = new Set(
      courses
        .filter(course => {
          const name = course.name.trim();
          return name !== "" && !/^(?:無名|名前不明|名称不明)/u.test(name);
        })
        .map(course => course.groupId),
    );
    return unknownCount(namedGroups.size);
  }

  return summarizeMappedCourses(courses);
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
