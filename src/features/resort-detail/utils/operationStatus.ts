// 地図から作る営業状況の集計を，サーバーと画面で共有する．
import type { CourseDistance } from "@/features/resort-detail/utils/courseChartColumns";
import { createCourseDistance } from "@/features/resort-detail/utils/courseChartColumns";
import { createMapCourseStatusSummary } from "@/features/resort-detail/utils/courseStatusSummary";
import { createLiftStatusSummary } from "@/features/resort-detail/utils/liftStatusSummary";
import type { CourseStatusSummary } from "@/lib/courseStatusSummary";
import type {
  FinalizedCourseFeature,
  FinalizedLiftFeature,
  FinalizedResortMapData,
} from "@/lib/finalizedResortGeojsonShared";

type OperationCountSummary = {
  total: number;
  open: number;
  partial: number;
  hasPartial: boolean;
};

export type FinalizedOperationSummary = {
  courses: OperationCountSummary | null;
  lifts: OperationCountSummary | null;
};

/** 詳細パネルと比較画面で使う営業情報を，確定済み地図から作る． */
export type ResortOperationStatus = {
  courses: CourseStatusSummary | null;
  lifts: CourseStatusSummary | null;
  courseSourceUrls: string[];
  liftSourceUrls: string[];
  courseObservedAt: string | null;
  liftObservedAt: string | null;
  courseSourceLabels: Record<string, string> | undefined;
  courseUpdates: string[];
  /** 滑走距離（m）。open は営業状況の出典があるときだけ（○・△のコース） */
  courseDistance: CourseDistance | null;
};

const getOperationSymbol = (status: string | null | undefined) => {
  if (!status) return null;
  if (/[○〇◯]/u.test(status)) return "open";
  if (/[△]/u.test(status)) return "partial";
  return null;
};

const isCountableCourseName = (name: string) =>
  !name.startsWith("無名") && !name.includes("_");

const createOperationCountSummary = (
  statuses: Array<string | null | undefined>,
): OperationCountSummary | null => {
  if (statuses.length === 0) return null;

  const operationSymbols = statuses.map(getOperationSymbol);
  if (operationSymbols.every(symbol => symbol === null)) return null;

  const open = operationSymbols.filter(symbol => symbol === "open");
  const partial = operationSymbols.filter(symbol => symbol === "partial");

  return {
    total: statuses.length,
    open: open.length,
    partial: partial.length,
    hasPartial: partial.length > 0,
  };
};

const createCourseOperationSummary = (
  courses: FinalizedCourseFeature[],
): OperationCountSummary | null =>
  createOperationCountSummary(
    courses
      .filter(course => isCountableCourseName(course.name))
      .map(course => course.properties.status),
  );

const createLiftOperationSummary = (
  lifts: FinalizedLiftFeature[],
): OperationCountSummary | null =>
  createOperationCountSummary(lifts.map(lift => lift.properties.status));

/** 詳細上部の件数表示用に，コース・リフトの営業件数を集計する． */
export function createFinalizedOperationSummary(
  finalizedMapData: FinalizedResortMapData | null,
): FinalizedOperationSummary {
  return {
    courses: finalizedMapData?.courses
      ? createCourseOperationSummary(finalizedMapData.courses.features)
      : null,
    lifts: finalizedMapData?.lifts
      ? createLiftOperationSummary(finalizedMapData.lifts.features)
      : null,
  };
}

/** 詳細と比較で共用する営業状態・出典・滑走距離を地図から集計する． */
export function createResortOperationStatus(
  mapData: FinalizedResortMapData | null,
): ResortOperationStatus {
  return {
    courses: createMapCourseStatusSummary(mapData?.courses),
    lifts: createLiftStatusSummary(mapData?.lifts),
    courseSourceUrls: mapData?.courses?.sourceUrls ?? [],
    liftSourceUrls: mapData?.lifts?.sourceUrls ?? [],
    courseObservedAt: mapData?.courses?.observedAt ?? null,
    liftObservedAt: mapData?.lifts?.observedAt ?? null,
    courseSourceLabels: mapData?.courseStatusSummary?.sourceLabels,
    courseUpdates:
      mapData?.courses?.features.map(
        course => course.properties.update ?? "",
      ) ?? [],
    courseDistance: createCourseDistance(mapData?.courses),
  };
}
