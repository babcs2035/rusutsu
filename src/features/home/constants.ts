export const BOTTOM_SHEET_COLLAPSED_SNAP_POINT = 0.095;
export const BOTTOM_SHEET_MIDDLE_SNAP_POINT = 0.46;
export const BOTTOM_SHEET_EXPANDED_SNAP_POINT = 0.86;
export const BOTTOM_SHEET_SNAP_POINTS = [
  BOTTOM_SHEET_COLLAPSED_SNAP_POINT,
  BOTTOM_SHEET_MIDDLE_SNAP_POINT,
  BOTTOM_SHEET_EXPANDED_SNAP_POINT,
] as const;
export const BOTTOM_SHEET_INITIAL_SNAP_POINT =
  BOTTOM_SHEET_COLLAPSED_SNAP_POINT;
export const BOTTOM_SHEET_SEARCH_SNAP_POINT = BOTTOM_SHEET_MIDDLE_SNAP_POINT;
export const MOBILE_KEYBOARD_INSET_THRESHOLD = 72;
export const SIDE_PANEL_MEDIA_QUERY = "(min-width: 48em)";
export const MAP_ZOOM_SURFACE_SELECTOR = '[data-map-zoom-surface="true"]';

export const getBottomSheetHeightRatio = (snapPoint: number | string | null) =>
  typeof snapPoint === "number" ? snapPoint : 0;

export const isBottomSheetExpanded = (snapPoint: number | string | null) =>
  typeof snapPoint === "number" &&
  Math.abs(snapPoint - BOTTOM_SHEET_EXPANDED_SNAP_POINT) < 0.001;
