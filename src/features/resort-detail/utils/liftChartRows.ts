import type { FinalizedLiftFeature } from "@/lib/finalizedResortGeojsonShared";
import type { LiftStatusChartRow } from "../components/LiftStatusChart";
import { sumKnown } from "./courseDistribution";
import {
  normalizeIconSymbol,
  type StatusSymbol,
  summarizeCourseStatuses,
} from "./detailMetrics";
import {
  getLiftTypeLabel,
  groupByLiftType,
  type LiftTypeLabel,
} from "./liftTypes";

export type LiftChartInput = {
  name: string;
  type: string | null | undefined;
  speed: string | null | undefined;
  status: StatusSymbol | null;
  distance: number | null;
};

/** 種別ごとの行は同じリフト集合を分けたものなので、足すと合計に一致する */
export function buildLiftChartRows(
  lifts: LiftChartInput[],
): LiftStatusChartRow[] {
  const typeRows: Array<{
    label: LiftTypeLabel;
    status: StatusSymbol | null;
    distance: number | null;
  }> = lifts.map(lift => ({
    label: getLiftTypeLabel({
      type: lift.type,
      speed: lift.speed,
      name: lift.name,
    }),
    status: lift.status,
    distance: lift.distance,
  }));
  const statusDistance = (
    groupRows: typeof typeRows,
    status: StatusSymbol | null,
  ) =>
    sumKnown(
      groupRows.filter(row => row.status === status).map(row => row.distance),
    ).total ?? 0;
  return groupByLiftType(typeRows, row => row.label).map(group => ({
    label: group.label,
    summary: summarizeCourseStatuses(group.rows.map(row => row.status)),
    distance: sumKnown(group.rows.map(row => row.distance)).total,
    statusDistances: {
      open: statusDistance(group.rows, "○"),
      partial: statusDistance(group.rows, "△"),
      closed: statusDistance(group.rows, "×"),
      unknown: statusDistance(group.rows, null),
    },
  }));
}

/** 地図のリフト地物から集計用の入力を作る（距離は表と同じく slopeDistMap で補う） */
export const liftChartInputsFromFeatures = (
  features: FinalizedLiftFeature[],
): LiftChartInput[] =>
  features.map(lift => ({
    name: lift.name,
    type: lift.properties.type,
    speed: lift.properties.speed,
    status: normalizeIconSymbol(lift.properties.status),
    distance: lift.properties.distance ?? lift.properties.slopeDistMap,
  }));
