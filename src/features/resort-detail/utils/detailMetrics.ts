import type {
  FinalizedCourseFeature,
  FinalizedLiftFeature,
  FinalizedResortMapData,
  GeoCoordinate,
} from "@/lib/finalizedResortGeojsonShared";
import { calculateCoordinateSlopes } from "@/lib/finalizedResortGeojsonShared";
import type { ElevationProfilePoint, FinalizedCourseGroup } from "../types";

export const normalizeIconSymbol = (value: string | null | undefined) => {
  if (!value) return null;
  if (/[○〇◯]/u.test(value)) return "○";
  if (/[△]/u.test(value)) return "△";
  if (/[×✕✖]/u.test(value)) return "×";
  return null;
};

export type StatusSymbol = "○" | "△" | "×";

/** 記号は ○△× に統一し、意味は説明文で補う */
export const COURSE_STATUS_DESCRIPTION: Record<StatusSymbol, string> = {
  "○": "全面滑走可",
  "△": "一部滑走可",
  "×": "クローズ",
};

export const LIFT_STATUS_DESCRIPTION: Record<StatusSymbol, string> = {
  "○": "運行中",
  "△": "待機中",
  "×": "運休",
};

export const PISTE_STATUS_DESCRIPTION: Record<StatusSymbol, string> = {
  "○": "圧雪",
  "△": "一部圧雪",
  "×": "非圧雪",
};

/**
 * コース全体の営業状況。
 * 上部・下部などに分かれていて一部だけ開いている場合は △ とし、
 * どこが開いているかを note で返す。
 */
export const getCourseGroupStatus = (
  group: FinalizedCourseGroup,
): { symbol: StatusSymbol | null; note: string | null } => {
  const symbols = group.courses.map(course =>
    normalizeIconSymbol(course.properties.status),
  );
  const known = symbols.filter(
    (symbol): symbol is StatusSymbol => symbol !== null,
  );
  if (known.length === 0) return { symbol: null, note: null };

  const openCount = known.filter(symbol => symbol === "○").length;
  if (openCount === known.length) return { symbol: "○", note: null };
  if (openCount === 0) {
    return {
      symbol: known.every(symbol => symbol === "×") ? "×" : "△",
      note: null,
    };
  }

  const openSections = group.courses
    .filter((_, index) => symbols[index] === "○")
    .map(course => course.sectionName)
    .filter((section): section is string => Boolean(section));

  return {
    symbol: "△",
    note:
      openSections.length > 0
        ? `${openSections.join("・")}のみオープン`
        : "一部のみオープン",
  };
};

export const getCourseGroupPisteSymbol = (
  group: FinalizedCourseGroup,
): StatusSymbol | null => {
  const symbols = group.courses
    .map(course => normalizeIconSymbol(course.properties.piste))
    .filter((symbol): symbol is StatusSymbol => symbol !== null);
  if (symbols.length === 0) return null;
  if (symbols.every(symbol => symbol === "○")) return "○";
  if (symbols.every(symbol => symbol === "×")) return "×";
  return "△";
};

const collectUnique = (values: Array<string | null | undefined>) => [
  ...new Set(
    values
      .filter((value): value is string => Boolean(value?.trim()))
      .map(value => value.trim()),
  ),
];

/**
 * コースごとの注記。
 * latest_note はその日の状況、note はコースそのものの紹介文なので分けて扱う。
 */
export const getCourseGroupNotes = (group: FinalizedCourseGroup) => ({
  latest: collectUnique(
    group.courses.map(course => course.properties.latestNote),
  ),
  description: collectUnique(
    group.courses.map(course => course.properties.note),
  ),
});

export const formatCourseStatus = (status: string | null | undefined) => {
  const symbol = normalizeIconSymbol(status);
  return symbol ? COURSE_STATUS_DESCRIPTION[symbol] : (status ?? "--");
};

export const formatLiftStatus = (status: string | null | undefined) => {
  const symbol = normalizeIconSymbol(status);
  return symbol ? LIFT_STATUS_DESCRIPTION[symbol] : (status ?? "--");
};

export const formatPisteStatus = (piste: string | null | undefined) => {
  const symbol = normalizeIconSymbol(piste);
  return symbol ? PISTE_STATUS_DESCRIPTION[symbol] : (piste ?? "--");
};

export const formatMeters = (value: number | null | undefined) =>
  value == null ? "--" : `${Math.round(value).toLocaleString()}m`;

/** 斜度は小数第一位まで出しても読み分けられないので整数にする */
export const formatDegree = (value: number | null | undefined) =>
  value == null ? "--" : `${Math.round(value)}°`;

/** 線の標高の最小・最大。GeoJSON の 3 番目の値から拾う */
export const getElevationRange = (
  coordinateLists: Array<Array<readonly number[]>>,
): { min: number; max: number } | null => {
  const elevations = coordinateLists
    .flat()
    .map(coordinate => coordinate[2])
    .filter((value): value is number => typeof value === "number");
  if (elevations.length === 0) return null;

  return { min: Math.min(...elevations), max: Math.max(...elevations) };
};

export const getLiftElevationDiff = (lift: FinalizedLiftFeature) => {
  if (lift.properties.elevationDiffMap != null) {
    return lift.properties.elevationDiffMap;
  }

  const first = lift.coordinates[0]?.[2];
  const last = lift.coordinates[lift.coordinates.length - 1]?.[2];
  if (typeof first === "number" && typeof last === "number") {
    return Math.abs(last - first);
  }

  return lift.properties.vertical;
};

export const maxNullable = (values: Array<number | null | undefined>) => {
  const numericValues = values.filter(
    (value): value is number => typeof value === "number",
  );
  return numericValues.length > 0 ? Math.max(...numericValues) : null;
};

export const averageNullable = (values: Array<number | null | undefined>) => {
  const numericValues = values.filter(
    (value): value is number => typeof value === "number",
  );
  if (numericValues.length === 0) return null;
  return (
    numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
  );
};

export const createFinalizedCourseGroups = (
  courses: NonNullable<FinalizedResortMapData["courses"]>["features"],
): FinalizedCourseGroup[] => {
  const groups = new Map<string, FinalizedCourseGroup>();
  for (const course of courses) {
    const current = groups.get(course.groupId);
    if (current) {
      current.courses.push(course);
    } else {
      groups.set(course.groupId, {
        id: course.groupId,
        displayName: course.displayName,
        courses: [course],
      });
    }
  }
  return [...groups.values()];
};

export const haversineMeters = (a: GeoCoordinate, b: GeoCoordinate) => {
  const radius = 6371000;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

export const createElevationProfile = (
  coordinates: GeoCoordinate[],
): ElevationProfilePoint[] => {
  if (!coordinates.every(coordinate => coordinate.length >= 3)) return [];

  const shouldReverse =
    (coordinates[0][2] ?? 0) < (coordinates[coordinates.length - 1][2] ?? 0);
  const displayCoordinates = shouldReverse
    ? [...coordinates].reverse()
    : coordinates;
  let distance = 0;
  return displayCoordinates.map((coordinate, index) => {
    if (index > 0) {
      distance += haversineMeters(displayCoordinates[index - 1], coordinate);
    }

    return {
      distance,
      elevation: coordinate[2] as number,
      slope: null,
      coordinate,
    };
  });
};

const COURSE_SECTION_ORDER: Record<string, number> = {
  上部: 0,
  中部: 1,
  下部: 2,
};

const getProfileCoordinates = (coordinates: GeoCoordinate[]) => {
  const shouldReverse =
    (coordinates[0]?.[2] ?? 0) <
    (coordinates[coordinates.length - 1]?.[2] ?? 0);
  return shouldReverse ? [...coordinates].reverse() : coordinates;
};

export const createConnectedCourseElevationProfile = (
  courses: FinalizedCourseFeature[],
): ElevationProfilePoint[] => {
  const sortedCourses = courses
    .map((course, index) => ({ course, index }))
    .sort((a, b) => {
      const aOrder =
        a.course.sectionName == null
          ? Number.POSITIVE_INFINITY
          : (COURSE_SECTION_ORDER[a.course.sectionName] ??
            Number.POSITIVE_INFINITY);
      const bOrder =
        b.course.sectionName == null
          ? Number.POSITIVE_INFINITY
          : (COURSE_SECTION_ORDER[b.course.sectionName] ??
            Number.POSITIVE_INFINITY);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map(item => item.course);

  const points: ElevationProfilePoint[] = [];
  let distance = 0;

  for (const course of sortedCourses) {
    if (!course.coordinates.every(coordinate => coordinate.length >= 3)) {
      continue;
    }

    const coordinates = getProfileCoordinates(course.coordinates);
    const slopes = calculateCoordinateSlopes(coordinates);

    for (const [index, coordinate] of coordinates.entries()) {
      const previousCoordinate =
        index === 0
          ? points[points.length - 1]?.coordinate
          : coordinates[index - 1];
      if (previousCoordinate) {
        distance += haversineMeters(previousCoordinate, coordinate);
      }

      points.push({
        distance,
        elevation: coordinate[2] as number,
        slope: slopes[index] ?? null,
        coordinate,
        status: normalizeIconSymbol(course.properties.status),
      });
    }
  }

  return points;
};
