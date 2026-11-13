import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";

export type NumericFilterValue = number | null;

export type NumericFilterName =
  | "minVertical"
  | "minBaseElevation"
  | "maxBaseElevation"
  | "minTopElevation"
  | "maxTopElevation"
  | "minCourses"
  | "minLifts";

export type Filters = {
  keyword: string;
  prefectures: string[];
  status: boolean;
  yukiMagi: boolean;
  evCharger: boolean;
  minVertical: NumericFilterValue;
  minBaseElevation: NumericFilterValue;
  maxBaseElevation: NumericFilterValue;
  minTopElevation: NumericFilterValue;
  maxTopElevation: NumericFilterValue;
  minCourses: NumericFilterValue;
  minLifts: NumericFilterValue;
  liftTicket: LiftTicketSearchInput;
};

export type RegionOption = {
  region: string;
  prefectures: string[];
};
