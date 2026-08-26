import type { FeatureCollection, LineString } from "geojson";
import {
  COURSE_DIFFICULTY_META,
  createCourseColorSegments,
  type FinalizedCourseFeature,
  type FinalizedLiftFeature,
  getCourseDifficulty,
  getSlopeColor,
} from "@/lib/finalizedResortGeojsonShared";
import type { CourseColorMode, FinalizedFeatureStatus } from "../types";
import {
  getFeatureStatusKind,
  getLiftDisplayCoordinates,
  isUngroomedPiste,
} from "../utils/finalizedMapData";

export type FinalizedLineProperties = {
  sourceId: string;
  name: string;
  color: string;
  flowColor?: string;
  status: FinalizedFeatureStatus;
  ungroomed: boolean;
};

export type FinalizedLineCollection = FeatureCollection<
  LineString,
  FinalizedLineProperties
>;

export const EMPTY_LINE_COLLECTION: FinalizedLineCollection = {
  type: "FeatureCollection",
  features: [],
};

const toLineFeature = (
  coordinates: number[][],
  properties: FinalizedLineProperties,
) => ({
  type: "Feature" as const,
  geometry: { type: "LineString" as const, coordinates },
  properties,
});

/**
 * コースの線。
 *
 * 斜度モードは 1 コースを最大 24 片に分けて色を変える。
 * MapLibre の line-gradient は特徴量ごとの色を取れないため、
 * 分割した線を並べる方式にしている（WebGL 描画なので本数は問題にならない）。
 *
 * 非圧雪コースもここでは同じように分割して色を付ける。破線は
 * この色付きの線の上から白い「隙間」を重ねて作る（finalizedLayers の
 * courseUngroomedMask）。分割した線に直接 line-dasharray を掛けると、
 * 縮小時に 1 片が破線 1 周期より短くなって実線に見えてしまう。
 */
export const buildCourseCollection = (
  courses: FinalizedCourseFeature[],
  mode: CourseColorMode,
): FinalizedLineCollection => ({
  type: "FeatureCollection",
  features: courses.flatMap(course => {
    const status = getFeatureStatusKind(course.properties.status);
    const ungroomed = isUngroomedPiste(course.properties.piste);
    const base = {
      sourceId: course.groupId,
      name: course.displayName,
      status,
      ungroomed,
    };

    if (mode === "slope") {
      return createCourseColorSegments(course).map(segment =>
        toLineFeature(segment.coordinates as number[][], {
          ...base,
          color: getSlopeColor(segment.slope),
        }),
      );
    }

    return [
      toLineFeature(course.coordinates as number[][], {
        ...base,
        color:
          COURSE_DIFFICULTY_META[getCourseDifficulty(course.properties.level)]
            .color,
      }),
    ];
  }),
});

/**
 * コース 1 本につき 1 フィーチャ。
 * ケーシング・矢羽・クリック判定に使う（斜度モードでも分割しない）。
 */
export const buildCourseOutlineCollection = (
  courses: FinalizedCourseFeature[],
): FinalizedLineCollection => ({
  type: "FeatureCollection",
  features: courses.map(course =>
    toLineFeature(course.coordinates as number[][], {
      sourceId: course.groupId,
      name: course.displayName,
      color:
        COURSE_DIFFICULTY_META[getCourseDifficulty(course.properties.level)]
          .color,
      status: getFeatureStatusKind(course.properties.status),
      ungroomed: isUngroomedPiste(course.properties.piste),
    }),
  ),
});

const LIFT_PALETTE: Record<
  FinalizedFeatureStatus,
  { color: string; flowColor: string }
> = {
  open: { color: "#1E40AF", flowColor: "#00E1FF" },
  limited: { color: "#DC2626", flowColor: "#FFFFFF" },
  closed: { color: "#8A99A8", flowColor: "#FFFFFF" },
  unknown: { color: "#6366F1", flowColor: "#FFFFFF" },
};

export const buildLiftCollection = (
  lifts: FinalizedLiftFeature[],
): FinalizedLineCollection => ({
  type: "FeatureCollection",
  features: lifts.map(lift => {
    const status = getFeatureStatusKind(lift.properties.status);
    const palette = LIFT_PALETTE[status];

    return toLineFeature(getLiftDisplayCoordinates(lift) as number[][], {
      sourceId: lift.id,
      name: lift.name,
      color: palette.color,
      flowColor: palette.flowColor,
      status,
      ungroomed: false,
    });
  }),
});
