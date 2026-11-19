import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import type { PassProgramId } from "@/shared/passPrograms";

export type NumericFilterValue = number | null;

export type NumericFilterName =
  | "minVertical"
  | "minBaseElevation"
  | "maxBaseElevation"
  | "minTopElevation"
  | "maxTopElevation"
  | "minCourses"
  | "minLifts"
  | "minCourseDistance";

/** コース数・リフト数・滑走距離を、全体と営業中のどちらで比べるか */
export type ScaleBasis = "total" | "open";

export type Filters = {
  keyword: string;
  prefectures: string[];
  yukiMagi: boolean;
  /** 選んだシーズン券・キッズパス。選んだ全部の対象スキー場に絞る */
  passPrograms: PassProgramId[];
  evCharger: boolean;
  minVertical: NumericFilterValue;
  minBaseElevation: NumericFilterValue;
  maxBaseElevation: NumericFilterValue;
  minTopElevation: NumericFilterValue;
  maxTopElevation: NumericFilterValue;
  minCourses: NumericFilterValue;
  minLifts: NumericFilterValue;
  /** 総滑走距離の下限（km） */
  minCourseDistance: NumericFilterValue;
  scaleBasis: ScaleBasis;
  liftTicket: LiftTicketSearchInput;
};

export type RegionOption = {
  region: string;
  prefectures: string[];
};
