import type L from "leaflet";
import type { MapTileVariant } from "./types";

export const INITIAL_CENTER: L.LatLngTuple = [38.25, 138.0];
export const MOBILE_INITIAL_ZOOM = 5;
export const DESKTOP_INITIAL_ZOOM = 6;
export const GSI_TILE_LAYERS: Record<
  MapTileVariant,
  {
    label: string;
    opacity: number;
    url: string;
  }
> = {
  pale: {
    label: "地図",
    opacity: 0.9,
    url: "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
  },
  photo: {
    label: "写真",
    opacity: 0.76,
    url: "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
  },
};
export const GSI_TILE_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a>';
export const GSI_TILE_MIN_ZOOM = 5;
export const GSI_TILE_MAX_ZOOM = 18;
export const MOBILE_MAP_MEDIA_QUERY = "(max-width: 47.999em)";
export const MOBILE_LABEL_SHOW_ZOOM = 7;
export const DESKTOP_LABEL_SHOW_ZOOM = 8;
export const MOBILE_LABEL_ADVANCED_LAYOUT_ZOOM = 11;
export const DESKTOP_LABEL_ADVANCED_LAYOUT_ZOOM = 11;
export const LABEL_PREFETCH_PADDING_RATIO = 0.2;
export const LABEL_PREFETCH_MIN_PADDING_PX = 150;
export const VIEWPORT_PADDING_RATIO_CHANGE_THRESHOLD = 0.001;

export const FALLBACK_LABEL_HEIGHT = 24;
export const ADVANCED_NEAR_POINT_DISTANCE = 40;
export const PRIMARY_LABEL_SEARCH_MAX_RADIUS_PX = 180;
export const DENSE_LABEL_SEARCH_MAX_RADIUS_PX = 260;
export const LABEL_COLLISION_PADDING = 4;
export const LABEL_MARGIN = 6;

export const LABEL_POINT_CLEARANCE = 8;
export const LEADER_POINT_CLEARANCE = 8;
export const RESORT_POINT_RADIUS = 4;
export const SELECTED_MARKER_RING_WIDTH = 3;

export const BASE_MARKER_PANE = "resort-markers-base";
export const FRONT_MARKER_PANE = "resort-markers-front";
export const FILTER_MATCH_MARKER_PANE = "resort-markers-filter-match";
export const SELECTED_MARKER_PANE = "resort-markers-selected";
export const FINALIZED_LIFT_PANE = "resort-finalized-lifts";
export const FINALIZED_COURSE_PANE = "resort-finalized-courses";
export const FINALIZED_SELECTED_PANE = "resort-finalized-selected";
export const COMPARE_PANEL_ATTRIBUTE = "data-ski-resort-compare-panel";
export const DETAIL_PANEL_ATTRIBUTE = "data-ski-resort-detail-panel";
export const MOBILE_ZOOM_SETTINGS = {
  zoomSnap: 0,
  zoomDelta: 0.5,
};
export const DESKTOP_ZOOM_SETTINGS = {
  zoomSnap: 1,
  zoomDelta: 1,
};
export const LABEL_MEASURE_ELEMENT_ATTRIBUTE =
  "data-resort-label-measure-probe";
export const COURSE_LABEL_MIN_ZOOM = 15;
export const LIFT_LABEL_MIN_ZOOM = 14;
export const FINALIZED_RESORT_LABEL_HIDE_MIN_ZOOM = 12;
