import type L from "leaflet";
import type { MapTileVariant } from "./types";

/** next.config.ts の basePath。public/ 配下の実ファイルを指すのに使う */
export const BASE_PATH = "/rusutsu";

// 緯度は、最北のスキー場（稚内こまどり山スキー場, 約 45.39°N）と
// 最南のスキー場（五ヶ瀬ハイランドスキー場, 約 32.58°N）の中間になるよう
// 選んである。単純な緯度の平均（約 38.98°N）ではなく、メルカトル図法で
// 画面上の上下の余白が均等になる中間点（約 39.28°N）を採用している
// （メルカトルは高緯度ほど間延びするため、単純平均だと北側が余りやすい）。
export const INITIAL_CENTER: L.LatLngTuple = [39.28, 138.0];
// これ以降のズーム値は MapLibre のスタイルズーム基準（内部的にタイル 512px 換算）。
// GSI タイルは 256px なので、MapLibre は実際には
// スタイルズーム + 1 の生のタイル ({z}/{x}/{y}) を取りに行く
// （tileSize: 256 を指定したときの仕様）。Leaflet はタイル 256px を
// そのままズームとして扱っていたため、Leaflet 版で決めていたズーム値を
// そのまま流用すると、実際には 1 段階分ズームインした状態になる。
// 日本全体が入らない・スキー場名ラベルが出るタイミングが遅れる、
// という 2 つの不具合はどちらもこのずれが原因なので、
// Leaflet 時代の値から一律 1 引いてある。
export const MOBILE_INITIAL_ZOOM = 4;
export const DESKTOP_INITIAL_ZOOM = 5;
export const GSI_TILE_LAYERS: Record<
  MapTileVariant,
  {
    label: string;
    opacity: number;
    url: string;
  }
> = {
  pale: {
    label: "標準",
    opacity: 0.9,
    url: "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
  },
  photo: {
    label: "航空写真",
    opacity: 0.76,
    url: "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
  },
};
export const GSI_TILE_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a>';
// 同上の理由で 1 引いてある（元は 5 / 18）
export const GSI_TILE_MIN_ZOOM = 4;
export const GSI_TILE_MAX_ZOOM = 17;
export const MOBILE_MAP_MEDIA_QUERY = "(max-width: 47.999em)";
export const COARSE_POINTER_MEDIA_QUERY = "(pointer: coarse)";
// 同上の理由で 1 引いてある（元は 7 / 8）
export const MOBILE_LABEL_SHOW_ZOOM = 6;
export const DESKTOP_LABEL_SHOW_ZOOM = 7;
// 管理画面のスキー場選択は「全国を見渡しながら名前で探す」ための地図なので、
// 初期ズームからラベルを出す。一覧地図の 7 は「寄ってから名前を出す」前提の値。
export const RESORT_PICKER_LABEL_SHOW_ZOOM = DESKTOP_INITIAL_ZOOM;
// 同上の理由で 1 引いてある（元はどちらも 11）
export const MOBILE_LABEL_ADVANCED_LAYOUT_ZOOM = 10;
export const DESKTOP_LABEL_ADVANCED_LAYOUT_ZOOM = 10;
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
export const COMPARE_MAP_HEADER_ATTRIBUTE = "data-compare-map-header";
/** 地図に重ねて出す「選択中のコース・リフト」パネル。値は left / right */
export const FEATURE_DETAIL_OVERLAY_ATTRIBUTE =
  "data-map-feature-detail-overlay";
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
// 同上の理由で 1 引いてある（元は 12）
export const FINALIZED_RESORT_LABEL_HIDE_MIN_ZOOM = 11;

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
