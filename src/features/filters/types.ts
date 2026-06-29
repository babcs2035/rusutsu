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
  beginnerFriendly: boolean;
  minVertical: NumericFilterValue;
  minBaseElevation: NumericFilterValue;
  maxBaseElevation: NumericFilterValue;
  minTopElevation: NumericFilterValue;
  maxTopElevation: NumericFilterValue;
  minCourses: NumericFilterValue;
  minLifts: NumericFilterValue;
};

export type RegionOption = {
  region: string;
  prefectures: string[];
};
