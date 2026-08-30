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

export type LiftFlowSpeed = "slow" | "normal" | "fast";

export type FinalizedLineProperties = {
  sourceId: string;
  name: string;
  color: string;
  flowColor?: string;
  /** リフトの速さ。流れる破線の速度を分けるのに使う */
  flowSpeed?: LiftFlowSpeed;
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

/**
 * リフトの色。営業状態はすべて「流れる破線」で動かすので、
 * 状態の違いは色の系統で読ませる。
 * 運行中は青×水色、待機中は赤系統、運休は薄いグレー、
 * 不明は運休と取り違えないよう紫系統にする。
 */
const LIFT_PALETTE: Record<
  FinalizedFeatureStatus,
  { color: string; flowColor: string }
> = {
  open: { color: "#1E40AF", flowColor: "#00E1FF" },
  limited: { color: "#B91C1C", flowColor: "#FECACA" },
  closed: { color: "#64748B", flowColor: "#FFFFFF" },
  unknown: { color: "#7C3AED", flowColor: "#EDE9FE" },
};

/** 「高速」「低速」の表記から流れの速さを決める */
const getLiftFlowSpeed = (speed: string | null | undefined): LiftFlowSpeed => {
  if (!speed) return "normal";
  if (/高速|high|fast|express|ゴンドラ|ロープウェイ/i.test(speed))
    return "fast";
  if (/低速|slow/i.test(speed)) return "slow";
  return "normal";
};

/**
 * リフトの線を間引く。
 *
 * 元データは 20m 間隔などで細かく打たれているが、リフトは支柱の間が
 * まっすぐな索道なので、形はほとんど変わらない。頂点が多いと
 * MapLibre が線に沿った距離を頂点ごとに積み上げる過程で誤差が乗り、
 * 流れる破線の 1 周期だけが縮んで「尺取り虫」のように見える。
 * 約 2m の許容で間引いて、見た目を保ったまま頂点を減らす。
 */
const SIMPLIFY_EPSILON_DEG = 0.00002;

const perpendicularDistance = (
  point: number[],
  start: number[],
  end: number[],
) => {
  const [px, py] = point;
  const [sx, sy] = start;
  const [ex, ey] = end;
  const dx = ex - sx;
  const dy = ey - sy;
  if (dx === 0 && dy === 0) return Math.hypot(px - sx, py - sy);

  const t = ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (sx + clamped * dx), py - (sy + clamped * dy));
};

const simplifyLine = (coordinates: number[][]): number[][] => {
  if (coordinates.length <= 2) return coordinates;

  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];
  let farthest = 0;
  let maxDistance = 0;
  for (let index = 1; index < coordinates.length - 1; index += 1) {
    const distance = perpendicularDistance(coordinates[index], start, end);
    if (distance <= maxDistance) continue;
    maxDistance = distance;
    farthest = index;
  }

  if (maxDistance <= SIMPLIFY_EPSILON_DEG) return [start, end];
  return [
    ...simplifyLine(coordinates.slice(0, farthest + 1)).slice(0, -1),
    ...simplifyLine(coordinates.slice(farthest)),
  ];
};

export const buildLiftCollection = (
  lifts: FinalizedLiftFeature[],
): FinalizedLineCollection => ({
  type: "FeatureCollection",
  features: lifts.map(lift => {
    const status = getFeatureStatusKind(lift.properties.status);
    const palette = LIFT_PALETTE[status];

    return toLineFeature(
      simplifyLine(getLiftDisplayCoordinates(lift) as number[][]),
      {
        sourceId: lift.id,
        name: lift.name,
        color: palette.color,
        flowColor: palette.flowColor,
        flowSpeed: getLiftFlowSpeed(
          `${lift.properties.speed ?? ""} ${lift.properties.type ?? ""}`,
        ),
        status,
        ungroomed: false,
      },
    );
  }),
});
