import type L from "leaflet";
import type { MapTileVariant } from "./types";

/** next.config.ts の basePath。public/ 配下の実ファイルを指すのに使う */
export const BASE_PATH = "/rusutsu";

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
export const COARSE_POINTER_MEDIA_QUERY = "(pointer: coarse)";
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
export const FINALIZED_LABEL_PANE = "resort-finalized-labels";
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
// ホイールでの連続ズーム（ピンチ経路）の調整値。
// 1 ズームあたりの必要スクロール量、1 フレームで目標に近づける割合、
// ホイールが止まってから確定するまでの待ち時間。
export const SMOOTH_WHEEL_ZOOM_PX_PER_LEVEL = 120;
export const SMOOTH_WHEEL_ZOOM_EASING = 0.28;
export const SMOOTH_WHEEL_ZOOM_SETTLE_MS = 140;

// マーカーを描く範囲。画面外のマーカーもズームのたびに位置計算が走るため、
// 表示範囲の少し外までに絞る。
export const MARKER_VIEWPORT_PADDING_RATIO = 0.35;

export const LABEL_MEASURE_ELEMENT_ATTRIBUTE =
  "data-resort-label-measure-probe";
// R7 の LOD テーブル。優先度スコアと繰り返し配置が入ったので、
// 「z14 でスキー場全体を見たときに名前が 1 つも出ない」状態を解消する（FR-7.1）。
export const COURSE_LABEL_MIN_ZOOM = 13;
// リフト名は種別で出し始めるズームを変える。スキー場全体が 1 画面に入る
// z12〜13 では、まずゴンドラと高速クワッドだけを出す。
export const LIFT_LABEL_MIN_ZOOM_BY_CLASS = {
  gondola: 12,
  highSpeedQuad: 13,
  quad: 14,
  pair: 14,
  other: 14,
} as const;
export const LIFT_LABEL_MIN_ZOOM = 12;
export const FINALIZED_RESORT_LABEL_HIDE_MIN_ZOOM = 12;

// ラベルは基本 1 箇所（線の中央）。これ以上長い線だけ 1/4 と 3/4 の
// 2 箇所に出す。名前が並びすぎると地図が読みにくくなる。
export const LINE_LABEL_TWO_LABEL_MIN_LENGTH_PX = 640;

// 方向記号（矢羽）の間隔。線幅ではなく画面上の読みやすさで決める（FR-4.2）。
export const DIRECTION_MARK_SPACING_BY_ZOOM: Record<number, number> = {
  13: 200,
  14: 175,
  15: 145,
  16: 120,
  17: 105,
  18: 95,
};
export const DIRECTION_MARK_MIN_ZOOM = 13;
export const DIRECTION_MARK_LENGTH = 8.4;
export const DIRECTION_MARK_HALF_WIDTH = 4.4;
