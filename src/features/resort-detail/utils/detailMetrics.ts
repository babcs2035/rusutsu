import type {
  FinalizedCourseFeature,
  FinalizedLiftFeature,
  FinalizedResortMapData,
  GeoCoordinate,
} from "@/lib/finalizedResortGeojsonShared";
import type { ElevationProfilePoint, FinalizedCourseGroup } from "../types";

export const normalizeIconSymbol = (value: string | null | undefined) => {
  if (!value) return null;
  if (/[○〇◯]/u.test(value)) return "○";
  if (/[△]/u.test(value)) return "△";
  if (/[×✕✖]/u.test(value)) return "×";
  return null;
};

export const formatCourseStatus = (status: string | null | undefined) => {
  const symbol = normalizeIconSymbol(status);
  if (symbol === "○") return "全面滑走可";
  if (symbol === "△") return "一部滑走可";
  if (symbol === "×") return "クローズ";
  return status ?? "--";
};

export const formatLiftStatus = (status: string | null | undefined) => {
  const symbol = normalizeIconSymbol(status);
  if (symbol === "○") return "運行中";
  if (symbol === "△") return "準備中・待機中";
  if (symbol === "×") return "運休";
  return status ?? "--";
};

export const formatPisteStatus = (piste: string | null | undefined) => {
  const symbol = normalizeIconSymbol(piste);
  if (symbol === "○") return "圧雪";
  if (symbol === "△") return "一部圧雪";
  if (symbol === "×") return "非圧雪";
  return piste ?? "--";
};

export const formatMeters = (value: number | null | undefined) =>
  value == null ? "--" : `${Math.round(value).toLocaleString()}m`;

export const formatDegree = (value: number | null | undefined) =>
  value == null ? "--" : `${value.toFixed(1)}°`;

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
  slopeDeg: number[] | null = null,
): ElevationProfilePoint[] => {
  if (!coordinates.every(coordinate => coordinate.length >= 3)) return [];

  const shouldReverse =
    (coordinates[0][2] ?? 0) < (coordinates[coordinates.length - 1][2] ?? 0);
  const displayCoordinates = shouldReverse
    ? [...coordinates].reverse()
    : coordinates;
  const displaySlopes =
    shouldReverse && slopeDeg?.length === coordinates.length
      ? [...slopeDeg].reverse()
      : slopeDeg;

  let distance = 0;
  return displayCoordinates.map((coordinate, index) => {
    if (index > 0) {
      distance += haversineMeters(displayCoordinates[index - 1], coordinate);
    }

    return {
      distance,
      elevation: coordinate[2] as number,
      slope:
        displaySlopes && displaySlopes.length === displayCoordinates.length
          ? displaySlopes[index]
          : null,
      coordinate,
    };
  });
};

const COURSE_SECTION_ORDER: Record<string, number> = {
  上部: 0,
  中部: 1,
  下部: 2,
};

const getProfileCoordinates = (
  coordinates: GeoCoordinate[],
  slopeDeg: number[] | null,
) => {
  const shouldReverse =
    (coordinates[0]?.[2] ?? 0) <
    (coordinates[coordinates.length - 1]?.[2] ?? 0);
  return {
    coordinates: shouldReverse ? [...coordinates].reverse() : coordinates,
    slopes:
      shouldReverse && slopeDeg?.length === coordinates.length
        ? [...slopeDeg].reverse()
        : slopeDeg,
  };
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

    const { coordinates, slopes } = getProfileCoordinates(
      course.coordinates,
      course.slopeDeg,
    );

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
        slope:
          slopes && slopes.length === coordinates.length ? slopes[index] : null,
        coordinate,
      });
    }
  }

  return points;
};
