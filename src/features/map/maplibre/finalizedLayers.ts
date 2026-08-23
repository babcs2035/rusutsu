import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import type {
  CourseColorMode,
  MapTileVariant,
  SelectedMapFeature,
} from "../types";

export const FINALIZED_SOURCE = {
  courses: "finalized-courses",
  courseOutlines: "finalized-course-outlines",
  lifts: "finalized-lifts",
} as const;

export const FINALIZED_LAYER = {
  courseCasing: "finalized-course-casing",
  courseLine: "finalized-course-line",
  courseUngroomed: "finalized-course-ungroomed",
  courseArrow: "finalized-course-arrow",
  liftCasing: "finalized-lift-casing",
  liftLine: "finalized-lift-line",
  liftBlink: "finalized-lift-blink",
  liftFlow: "finalized-lift-flow",
  liftArrow: "finalized-lift-arrow",
  courseHit: "finalized-course-hit",
  liftHit: "finalized-lift-hit",
} as const;

export const DIMMED_LINE_COLOR = "#94A3B8";
export const MUTED_LINE_OPACITY = 0.2;
export const ARROW_ICON_ID = "finalized-direction-arrow";

export const EMPTY_STYLE_STATE: FinalizedStyleState = {
  courseColorMode: "difficulty",
  showOpenOnly: false,
  selectedFeature: null,
  isFocusMode: false,
  tileVariant: "pale",
};

export type FinalizedStyleState = {
  courseColorMode: CourseColorMode;
  showOpenOnly: boolean;
  selectedFeature: SelectedMapFeature | null;
  isFocusMode: boolean;
  tileVariant: MapTileVariant;
};

/** ズーム別の線幅。難易度モードと斜度モードで同じ太さにする */
const widthByZoom = (
  stops: [number, number][],
): DataDrivenPropertyValueSpecification<number> =>
  [
    "interpolate",
    ["linear"],
    ["zoom"],
    ...stops.flat(),
  ] as unknown as DataDrivenPropertyValueSpecification<number>;

const COURSE_WIDTH: [number, number][] = [
  [12, 2],
  [14, 3],
  [16, 4.4],
  [18, 6],
];
const LIFT_WIDTH: [number, number][] = [
  [12, 1.8],
  [14, 2.4],
  [16, 3.2],
  [18, 4],
];

const scaleWidth = (
  stops: [number, number][],
  factor: number,
  extra = 0,
): DataDrivenPropertyValueSpecification<number> =>
  widthByZoom(
    stops.map(
      ([zoom, width]) => [zoom, width * factor + extra] as [number, number],
    ),
  );

const isSelectedExpression = (
  selected: SelectedMapFeature | null,
  kind: "course" | "lift",
): ExpressionSpecification =>
  selected && selected.kind === kind
    ? ["==", ["get", "sourceId"], selected.id]
    : ["literal", false];

/** 「営業中のみ」で沈ませる対象か */
const isMutedExpression = (
  state: FinalizedStyleState,
  kind: "course" | "lift",
): ExpressionSpecification =>
  state.showOpenOnly
    ? [
        "all",
        ["!=", ["get", "status"], "open"],
        ["!", isSelectedExpression(state.selectedFeature, kind)],
      ]
    : ["literal", false];

/** 何かを選択しているときの、それ以外の線 */
const isDimmedExpression = (
  state: FinalizedStyleState,
  kind: "course" | "lift",
): ExpressionSpecification =>
  state.selectedFeature
    ? ["!", isSelectedExpression(state.selectedFeature, kind)]
    : ["literal", false];

export const getLineOpacity = (
  state: FinalizedStyleState,
  kind: "course" | "lift",
): DataDrivenPropertyValueSpecification<number> => [
  "case",
  isMutedExpression(state, kind),
  MUTED_LINE_OPACITY,
  isDimmedExpression(state, kind),
  0.4,
  1,
];

export const getLineColor = (
  state: FinalizedStyleState,
  kind: "course" | "lift",
): DataDrivenPropertyValueSpecification<string> => [
  "case",
  isDimmedExpression(state, kind),
  DIMMED_LINE_COLOR,
  ["get", "color"],
];

/**
 * ズーム別の線幅。ズームごとの値を case で出し分ける。
 *
 * case の枝それぞれに interpolate を置くと
 * 「zoom を使った interpolate は式にひとつだけ」という制約に触れるため、
 * interpolate を外側、case を内側にする。
 */
const widthByZoomAndCase = (
  stops: [number, number][],
  toValue: (width: number) => ExpressionSpecification,
): DataDrivenPropertyValueSpecification<number> =>
  [
    "interpolate",
    ["linear"],
    ["zoom"],
    ...stops.flatMap(([zoom, width]) => [zoom, toValue(width)]),
  ] as unknown as DataDrivenPropertyValueSpecification<number>;

export const getLineWidth = (
  state: FinalizedStyleState,
  kind: "course" | "lift",
): DataDrivenPropertyValueSpecification<number> => {
  const stops = kind === "course" ? COURSE_WIDTH : LIFT_WIDTH;
  const focus = state.isFocusMode ? 0.3 : 0;
  const base = state.showOpenOnly ? focus + 0.3 : focus;

  return widthByZoomAndCase(stops, width => [
    "case",
    isSelectedExpression(state.selectedFeature, kind),
    width + focus + 1.6,
    isMutedExpression(state, kind),
    width * 0.6 + focus,
    width + base,
  ]);
};

export const getCasingWidth = (
  state: FinalizedStyleState,
  kind: "course" | "lift",
): DataDrivenPropertyValueSpecification<number> => {
  const stops = kind === "course" ? COURSE_WIDTH : LIFT_WIDTH;
  const isPhoto = state.tileVariant === "photo";
  const extra = (state.isFocusMode ? 0.3 : 0) + (isPhoto ? 2.2 : 1.8);
  return scaleWidth(stops, 1, extra);
};

export const getCasingOpacity = (
  state: FinalizedStyleState,
  kind: "course" | "lift",
): DataDrivenPropertyValueSpecification<number> => [
  "case",
  // 沈ませる線は白ケーシングを外す。白い縁が残ると薄いのに目立つままになる
  isMutedExpression(state, kind),
  0,
  isDimmedExpression(state, kind),
  0.12,
  state.tileVariant === "photo" ? 0.74 : 0.56,
];

/**
 * 非圧雪コースの破線。
 *
 * line-dasharray の単位は「線幅」なので、そのまま固定値にすると
 * 縮小したときに破線が線幅ごと縮んで、実線と見分けが付かなくなる。
 * ズームごとに線幅で割り戻して、画面上ではどの倍率でも
 * だいたい 6px 描いて 4.5px 空ける形に揃える。
 */
const UNGROOMED_DASH: DataDrivenPropertyValueSpecification<number[]> = [
  "step",
  ["zoom"],
  // 配列そのものを式の戻り値にするので literal で包む。
  // 素の配列は式の呼び出しとして読まれ、レイヤーごと弾かれてしまう。
  ["literal", [3, 2.2]],
  13,
  ["literal", [2.4, 1.8]],
  14,
  ["literal", [2, 1.5]],
  15,
  ["literal", [1.7, 1.25]],
  16,
  ["literal", [1.5, 1.1]],
  17,
  ["literal", [1.3, 0.95]],
] as unknown as DataDrivenPropertyValueSpecification<number[]>;

/**
 * 圧雪コース側のフィルタ。
 * 選択中の非圧雪コースはここに含めて実線で描く（点線のままだと形が読みにくい）。
 */
const getGroomedFilter = (state: FinalizedStyleState): FilterSpecification => [
  "any",
  ["!=", ["get", "ungroomed"], true],
  isSelectedExpression(state.selectedFeature, "course"),
];

const getUngroomedFilter = (
  state: FinalizedStyleState,
): FilterSpecification => [
  "all",
  ["==", ["get", "ungroomed"], true],
  ["!", isSelectedExpression(state.selectedFeature, "course")],
];

/** 矢羽の間隔。線幅ではなく画面上の読みやすさで決める */
const ARROW_SPACING: DataDrivenPropertyValueSpecification<number> = [
  "interpolate",
  ["linear"],
  ["zoom"],
  13,
  200,
  15,
  145,
  17,
  105,
  18,
  95,
];

const ARROW_SIZE: DataDrivenPropertyValueSpecification<number> = [
  "interpolate",
  ["linear"],
  ["zoom"],
  13,
  0.44,
  15,
  0.5,
  17,
  0.55,
  18,
  0.6,
];

/** タップ判定用の透明な線。細い線をそのまま狙わせると当たらない */
const createHitLayer = (
  id: string,
  source: string,
  hitWidth: number,
): LayerSpecification => ({
  id,
  type: "line",
  source,
  layout: { "line-cap": "round", "line-join": "round" },
  paint: { "line-color": "#000000", "line-opacity": 0, "line-width": hitWidth },
});

export const createFinalizedLayers = (
  state: FinalizedStyleState,
  hitWidth: number,
): LayerSpecification[] => [
  {
    id: FINALIZED_LAYER.courseCasing,
    type: "line",
    source: FINALIZED_SOURCE.courseOutlines,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#FFFFFF",
      "line-width": getCasingWidth(state, "course"),
      "line-opacity": getCasingOpacity(state, "course"),
    },
  },
  {
    id: FINALIZED_LAYER.liftCasing,
    type: "line",
    source: FINALIZED_SOURCE.lifts,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#FFFFFF",
      "line-width": getCasingWidth(state, "lift"),
      "line-opacity": getCasingOpacity(state, "lift"),
    },
  },
  // 圧雪コース（実線）と非圧雪コース（破線）はレイヤーを分ける。
  // line-dasharray はデータ駆動にできないため。
  {
    id: FINALIZED_LAYER.courseLine,
    type: "line",
    source: FINALIZED_SOURCE.courses,
    filter: getGroomedFilter(state),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": getLineColor(state, "course"),
      "line-width": getLineWidth(state, "course"),
      "line-opacity": getLineOpacity(state, "course"),
    },
  },
  {
    id: FINALIZED_LAYER.courseUngroomed,
    type: "line",
    source: FINALIZED_SOURCE.courses,
    filter: getUngroomedFilter(state),
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: {
      "line-color": getLineColor(state, "course"),
      "line-width": getLineWidth(state, "course"),
      "line-opacity": getLineOpacity(state, "course"),
      "line-dasharray": UNGROOMED_DASH,
    },
  },
  {
    id: FINALIZED_LAYER.liftLine,
    type: "line",
    source: FINALIZED_SOURCE.lifts,
    filter: ["!=", ["get", "status"], "limited"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": getLineColor(state, "lift"),
      "line-width": getLineWidth(state, "lift"),
      "line-opacity": getLineOpacity(state, "lift"),
    },
  },
  // 一部運休のリフトは赤く点滅させる。opacity は useLiftAnimation が動かす
  {
    id: FINALIZED_LAYER.liftBlink,
    type: "line",
    source: FINALIZED_SOURCE.lifts,
    filter: ["==", ["get", "status"], "limited"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": getLineColor(state, "lift"),
      "line-width": getLineWidth(state, "lift"),
      "line-opacity": getLineOpacity(state, "lift"),
    },
  },
  // 運行中のリフトだけ、流れる破線を重ねる
  {
    id: FINALIZED_LAYER.liftFlow,
    type: "line",
    source: FINALIZED_SOURCE.lifts,
    filter: ["==", ["get", "status"], "open"],
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: {
      "line-color": ["get", "flowColor"],
      "line-width": scaleWidth(LIFT_WIDTH, 0.6),
      "line-opacity": getLineOpacity(state, "lift"),
      "line-dasharray": [0, 2, 2],
    },
  },
  createHitLayer(
    FINALIZED_LAYER.courseHit,
    FINALIZED_SOURCE.courseOutlines,
    hitWidth,
  ),
  createHitLayer(FINALIZED_LAYER.liftHit, FINALIZED_SOURCE.lifts, hitWidth),
  {
    id: FINALIZED_LAYER.courseArrow,
    type: "symbol",
    source: FINALIZED_SOURCE.courseOutlines,
    minzoom: 13,
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": ARROW_SPACING,
      "icon-image": ARROW_ICON_ID,
      "icon-size": ARROW_SIZE,
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
    paint: {
      "icon-opacity": [
        "case",
        isMutedExpression(state, "course"),
        0,
        isDimmedExpression(state, "course"),
        0.45,
        1,
      ],
    },
  },
  {
    id: FINALIZED_LAYER.liftArrow,
    type: "symbol",
    source: FINALIZED_SOURCE.lifts,
    minzoom: 13,
    // 運行中は流れる破線が向きを示すので矢羽は出さない
    filter: ["!=", ["get", "status"], "open"],
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": ARROW_SPACING,
      "icon-image": ARROW_ICON_ID,
      "icon-size": ARROW_SIZE,
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
    paint: {
      "icon-opacity": [
        "case",
        isMutedExpression(state, "lift"),
        0,
        isDimmedExpression(state, "lift"),
        0.45,
        1,
      ],
    },
  },
];

/** 状態が変わったときに、レイヤーを作り直さず paint だけ差し替える */
export const applyFinalizedStyleState = (
  map: MapLibreMap,
  state: FinalizedStyleState,
) => {
  const set = (layerId: string, property: string, value: unknown) => {
    if (!map.getLayer(layerId)) return;
    map.setPaintProperty(
      layerId,
      property as "line-color",
      value as DataDrivenPropertyValueSpecification<string>,
    );
  };

  if (map.getLayer(FINALIZED_LAYER.courseLine)) {
    map.setFilter(FINALIZED_LAYER.courseLine, getGroomedFilter(state));
  }
  if (map.getLayer(FINALIZED_LAYER.courseUngroomed)) {
    map.setFilter(FINALIZED_LAYER.courseUngroomed, getUngroomedFilter(state));
  }

  for (const [layerId, kind] of [
    [FINALIZED_LAYER.courseLine, "course"],
    [FINALIZED_LAYER.courseUngroomed, "course"],
    [FINALIZED_LAYER.liftLine, "lift"],
    [FINALIZED_LAYER.liftBlink, "lift"],
  ] as const) {
    set(layerId, "line-color", getLineColor(state, kind));
    set(layerId, "line-width", getLineWidth(state, kind));
    set(layerId, "line-opacity", getLineOpacity(state, kind));
  }

  set(
    FINALIZED_LAYER.courseCasing,
    "line-width",
    getCasingWidth(state, "course"),
  );
  set(
    FINALIZED_LAYER.courseCasing,
    "line-opacity",
    getCasingOpacity(state, "course"),
  );
  set(FINALIZED_LAYER.liftCasing, "line-width", getCasingWidth(state, "lift"));
  set(
    FINALIZED_LAYER.liftCasing,
    "line-opacity",
    getCasingOpacity(state, "lift"),
  );
  set(FINALIZED_LAYER.liftFlow, "line-opacity", getLineOpacity(state, "lift"));

  set(FINALIZED_LAYER.courseArrow, "icon-opacity", [
    "case",
    isMutedExpression(state, "course"),
    0,
    isDimmedExpression(state, "course"),
    0.45,
    1,
  ]);
  set(FINALIZED_LAYER.liftArrow, "icon-opacity", [
    "case",
    isMutedExpression(state, "lift"),
    0,
    isDimmedExpression(state, "lift"),
    0.45,
    1,
  ]);
};
