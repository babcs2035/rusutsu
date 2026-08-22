import L from "leaflet";
import {
  COURSE_DIFFICULTY_META,
  createCourseColorSegments,
  type FinalizedCourseFeature,
  type FinalizedLiftFeature,
  type GeoCoordinate,
  getCourseDifficulty,
  getSlopeColor,
} from "@/lib/finalizedResortGeojsonShared";
import type {
  CourseColorMode,
  FinalizedFeatureStatus,
  FinalizedLineFeature,
  FinalizedLineFeatureCollection,
} from "../types";

export const EMPTY_FINALIZED_COURSES: FinalizedCourseFeature[] = [];
export const EMPTY_FINALIZED_LIFTS: FinalizedLiftFeature[] = [];

export const toLatLngTuple = (coordinate: GeoCoordinate): L.LatLngTuple => [
  coordinate[1],
  coordinate[0],
];

export const getFeatureBounds = (coordinates: GeoCoordinate[]) =>
  L.latLngBounds(coordinates.map(toLatLngTuple));

export const getFinalizedMapDataBounds = (
  courses: FinalizedCourseFeature[],
  lifts: FinalizedLiftFeature[],
): L.LatLngBounds | null => {
  const coordinates = [
    ...courses.flatMap(course => course.coordinates),
    ...lifts.flatMap(lift => lift.coordinates),
  ];

  return coordinates.length > 0 ? getFeatureBounds(coordinates) : null;
};

export const getFeatureStatusKind = (
  status: string | null | undefined,
): FinalizedFeatureStatus => {
  if (/[○〇◯]/u.test(status ?? "")) return "open";
  if (/[△]/u.test(status ?? "")) return "limited";
  if (/[×✕✖]/u.test(status ?? "")) return "closed";
  return "unknown";
};

export const getLiftStatusKind = getFeatureStatusKind;

/** 圧雪されていない（非圧雪）コースか。piste が △ / × のとき true */
export const isUngroomedPiste = (piste: string | null | undefined) => {
  const kind = getFeatureStatusKind(piste);
  return kind === "limited" || kind === "closed";
};

type LiftStatusPalette = {
  baseColor: string;
  flowColor: string;
};

/**
 * リフトの状態パレット（FR-4.4）。
 * 色で状態、動きで稼働、記号で方向という三重符号化の「色」の部分。
 * 旧 open の濃紺 #1E3A8A は写真タイル上で沈み、フローの純シアン #00FFFF は
 * 細線でも目に刺さるため、明度と彩度を調整している。
 */
const LIFT_STATUS_PALETTE: Record<FinalizedFeatureStatus, LiftStatusPalette> = {
  open: { baseColor: "#1E40AF", flowColor: "#00E1FF" },
  limited: { baseColor: "#DC2626", flowColor: "#FFFFFF" },
  closed: { baseColor: "#8A99A8", flowColor: "#FFFFFF" },
  unknown: { baseColor: "#6366F1", flowColor: "#FFFFFF" },
};

const getLiftStatusPalette = (status: string | null | undefined) =>
  LIFT_STATUS_PALETTE[getFeatureStatusKind(status)];

/**
 * 滑走方向（標高が下がる向き）に座標と点ごとの斜度を揃えたコースを返す。
 * 描画・ラベル・方向記号のすべてがこの向きを前提にする（FR-4.1）。
 */
export const toDownhillCourse = (
  course: FinalizedCourseFeature,
): FinalizedCourseFeature => {
  const first = course.coordinates[0]?.[2];
  const last = course.coordinates[course.coordinates.length - 1]?.[2];
  if (typeof first !== "number" || typeof last !== "number") return course;
  if (first >= last) return course;

  const canReverseSlopes =
    course.slopeDeg != null &&
    course.slopeDeg.length === course.coordinates.length;

  return {
    ...course,
    coordinates: [...course.coordinates].reverse(),
    slopeDeg: canReverseSlopes
      ? [...(course.slopeDeg ?? [])].reverse()
      : course.slopeDeg,
  };
};

export const toDownhillCourses = (courses: FinalizedCourseFeature[]) =>
  courses.map(toDownhillCourse);

/** リフトは下→上に揃える */
export const getLiftDisplayCoordinates = (lift: FinalizedLiftFeature) => {
  const first = lift.coordinates[0]?.[2];
  const last = lift.coordinates[lift.coordinates.length - 1]?.[2];

  if (typeof first === "number" && typeof last === "number" && first > last) {
    return [...lift.coordinates].reverse();
  }

  return lift.coordinates;
};

/**
 * コースの FeatureCollection。
 * ズームと「営業中のみ」トグルには依存させない（FR-1.1）。
 * ズームで変わるのは線幅・不透明度だけで、そこは setStyle で更新する。
 */
export const buildCourseFeatureCollection = (
  courses: FinalizedCourseFeature[],
  mode: CourseColorMode,
): FinalizedLineFeatureCollection => {
  if (mode === "slope") {
    return {
      type: "FeatureCollection",
      features: courses.flatMap<FinalizedLineFeature>(course => {
        const statusKind = getFeatureStatusKind(course.properties.status);
        const ungroomed = isUngroomedPiste(course.properties.piste);

        return createCourseColorSegments(course).map(segment => ({
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: segment.coordinates,
          },
          properties: {
            id: `${course.id}-segment-${segment.index}`,
            kind: "course" as const,
            sourceId: course.groupId,
            name: course.displayName,
            color: getSlopeColor(segment.slope),
            statusKind,
            ungroomed,
            segmented: true,
          },
        }));
      }),
    };
  }

  return {
    type: "FeatureCollection",
    features: courses.map(course => ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: course.coordinates,
      },
      properties: {
        id: course.id,
        kind: "course",
        sourceId: course.groupId,
        name: course.displayName,
        color:
          COURSE_DIFFICULTY_META[getCourseDifficulty(course.properties.level)]
            .color,
        statusKind: getFeatureStatusKind(course.properties.status),
        ungroomed: isUngroomedPiste(course.properties.piste),
        segmented: false,
      },
    })),
  };
};

/**
 * 斜度モードでも、ケーシング・ヒット領域・非圧雪表現はコース単位で 1 本にする
 * （FR-1.4）。セグメント単位で作ると同じ見た目のままパス数が 24 倍になる。
 */
export const buildCourseOutlineFeatureCollection = (
  courses: FinalizedCourseFeature[],
): FinalizedLineFeatureCollection => ({
  type: "FeatureCollection",
  features: courses.map(course => ({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: course.coordinates,
    },
    properties: {
      id: `${course.id}-outline`,
      kind: "course",
      sourceId: course.groupId,
      name: course.displayName,
      color:
        COURSE_DIFFICULTY_META[getCourseDifficulty(course.properties.level)]
          .color,
      statusKind: getFeatureStatusKind(course.properties.status),
      ungroomed: isUngroomedPiste(course.properties.piste),
      segmented: false,
    },
  })),
});

const getLiftFlowSpeed = (
  speed: string | null | undefined,
): "slow" | "normal" | "fast" => {
  if (!speed) return "normal";
  if (/高速|high|fast|express/i.test(speed)) return "fast";
  if (/低速|slow/i.test(speed)) return "slow";
  return "normal";
};

export const buildLiftFeatureCollection = (
  lifts: FinalizedLiftFeature[],
): FinalizedLineFeatureCollection => ({
  type: "FeatureCollection",
  features: lifts.map(lift => {
    const palette = getLiftStatusPalette(lift.properties.status);

    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: getLiftDisplayCoordinates(lift),
      },
      properties: {
        id: lift.id,
        kind: "lift",
        sourceId: lift.id,
        name: lift.name,
        color: palette.baseColor,
        flowColor: palette.flowColor,
        statusKind: getFeatureStatusKind(lift.properties.status),
        ungroomed: false,
        segmented: false,
        flowSpeed: getLiftFlowSpeed(lift.properties.speed),
      },
    };
  }),
});
