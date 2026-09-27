import type { FinalizedFeatureStatus } from "../types";

export type MapDisplaySettings = {
  showCourseNames: boolean;
  showLiftNames: boolean;
  showUngroomed: boolean;
  monochrome: boolean;
  courseStatuses: Record<FinalizedFeatureStatus, boolean>;
};

export const ALL_COURSE_STATUSES = {
  open: true,
  limited: true,
  closed: true,
  unknown: true,
};
export const OPEN_COURSE_STATUSES = {
  open: true,
  limited: true,
  closed: false,
  unknown: false,
};
export const DEFAULT_MAP_DISPLAY_SETTINGS: MapDisplaySettings = {
  showCourseNames: true,
  showLiftNames: true,
  showUngroomed: true,
  monochrome: true,
  courseStatuses: ALL_COURSE_STATUSES,
};
export const COURSE_STATUS_OPTIONS = [
  { value: "open", symbol: "○", label: "全面滑走可" },
  { value: "limited", symbol: "△", label: "一部滑走可" },
  { value: "closed", symbol: "×", label: "滑走不可" },
  { value: "unknown", symbol: "不明", label: "状況不明" },
] as const;
export const isCourseStatusVisible = (
  status: FinalizedFeatureStatus,
  courseStatuses: MapDisplaySettings["courseStatuses"],
) => courseStatuses[status];
