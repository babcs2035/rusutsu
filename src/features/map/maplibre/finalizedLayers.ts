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
  courseUngroomedMask: "finalized-course-ungroomed-mask",
  courseArrow: "finalized-course-arrow",
  liftCasing: "finalized-lift-casing",
  liftLine: "finalized-lift-line",
  liftBlink: "finalized-lift-blink",
  liftFlowSlow: "finalized-lift-flow-slow",
  liftFlowNormal: "finalized-lift-flow-normal",
  liftFlowFast: "finalized-lift-flow-fast",
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
// コースに埋もれないよう、リフトはコースと同じくらいの太さにする
const LIFT_WIDTH: [number, number][] = [
  [12, 2.2],
  [14, 3.1],
  [16, 4.4],
  [18, 5.8],
];

/** 流れる破線の太さ。細すぎると動きが読めないので、線幅の 3/4 で描く */
const LIFT_FLOW_WIDTH_FACTOR = 0.74;

/**
 * 流れる破線のコマ。単位は線幅なので、線幅を変えても見え方が揃う。
 *
 * MapLibre の line-dasharray は要素数が奇数だとパターンを 2 回繰り返して
 * 偶数に直す（塗りと隙間が入れ替わった 2 周期になる）。そのため
 * コマごとに要素数が変わると周期そのものが変わり、リフトによって
 * 色の並びが崩れて見える。どのコマも必ず [塗り, 隙間, 塗り, 隙間] の
 * 4 要素・同じ周期になるように組み立てる。
 */
const FLOW_PERIOD = 14;
/** 2 色が同じ長さになるように、周期のちょうど半分を塗る */
const FLOW_DASH = FLOW_PERIOD / 2;
/**
 * 1 周期を何コマで送るか。
 *
 * MapLibre は破線の 1 周期を「line-dasharray の合計 × floor(線幅)」px として
 * 描く。floor が効くので、縮小して線が細いときは 1 周期が 14px しかない。
 * そこへ 0.5 単位ずつずらすと 1 コマの移動量が 0.5px になり、
 * 端のまるめがコマごとに変わって塗りが伸び縮みして見える（尺取り虫）。
 * 1 単位＝整数 px ちょうどずつ送れば、どの縮尺でも形を保ったまま流れる。
 */
const FLOW_STEPS = FLOW_PERIOD;

export const FLOW_DASH_FRAMES: number[][] = Array.from(
  { length: FLOW_STEPS },
  (_, index) => {
    const phase = (FLOW_PERIOD * index) / FLOW_STEPS;
    if (phase + FLOW_DASH <= FLOW_PERIOD) {
      return [0, phase, FLOW_DASH, FLOW_PERIOD - phase - FLOW_DASH];
    }
    // 周期をまたぐぶんは先頭に回す。末尾の隙間 0 で次の周期の頭とつながる
    const head = phase + FLOW_DASH - FLOW_PERIOD;
    return [head, FLOW_PERIOD - FLOW_DASH, FLOW_DASH - head, 0];
  },
);

/**
 * 速さごとの流れるレイヤー。line-dasharray は式にできないので分ける。
 *
 * frameMs は 1 コマぶんの間隔で、1 周期（FLOW_PERIOD コマ）を流し終えるまでの
 * 時間はその 14 倍になる。高速リフトと低速リフトの差が読み取りにくかったため、
 * fast:normal:slow をおよそ 1:2.5:5 まで広げている（以前は 1:1.7:2.5 程度）。
 */
export const LIFT_FLOW_LAYERS = [
  { id: FINALIZED_LAYER.liftFlowSlow, speed: "slow", frameMs: 200 },
  { id: FINALIZED_LAYER.liftFlowNormal, speed: "normal", frameMs: 100 },
  { id: FINALIZED_LAYER.liftFlowFast, speed: "fast", frameMs: 40 },
] as const;

/**
 * 流れる破線の濃さ。
 * 二色の差が読めないと動きが見えないので、どの状態でも濃いまま出す。
 * 「薄さ」は流れる色そのものと、下の地の線の濃さ（LINE_STATUS_OPACITY）で作る。
 */
const FLOW_STATUS_OPACITY: ExpressionSpecification = [
  "match",
  ["get", "status"],
  "open",
  0.95,
  "limited",
  0.95,
  "closed",
  0.9,
  0.95,
];

/** リフトの地の線の濃さ。運休・不明はここで沈める */
const LINE_STATUS_OPACITY: ExpressionSpecification = [
  "match",
  ["get", "status"],
  "closed",
  0.72,
  "unknown",
  0.88,
  1,
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
  kind === "lift" ? LINE_STATUS_OPACITY : 1,
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

/** 流れる破線の濃さ。状態ごとの濃さに、選択・営業中のみの効果を掛ける */
export const getFlowOpacity = (
  state: FinalizedStyleState,
): DataDrivenPropertyValueSpecification<number> => [
  "case",
  isMutedExpression(state, "lift"),
  0,
  isDimmedExpression(state, "lift"),
  ["*", FLOW_STATUS_OPACITY, 0.4],
  FLOW_STATUS_OPACITY,
];

/**
 * 点滅中のリフトの濃さ。
 * 生の数値で上書きすると「営業中のみ」や選択中の沈み込みが消えてしまうので、
 * 同じ case を通してから点滅の値を入れる。
 */
export const getBlinkOpacity = (
  state: FinalizedStyleState,
  blink: number,
): DataDrivenPropertyValueSpecification<number> => [
  "case",
  isMutedExpression(state, "lift"),
  MUTED_LINE_OPACITY,
  isDimmedExpression(state, "lift"),
  0.4,
  blink,
];

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
 * 色付きの線そのものを破線にはしない。斜度モードではコースを頂点ごとに
 * 分割して色を変えており、line-dasharray は地物ごとに先頭から描き直されるため、
 * 縮小して 1 片が破線 1 周期より短くなると「線が途切れる前に地物が終わる」状態に
 * なって実線に見えてしまう。
 *
 * そこで、分割していないコース 1 本ぶんの線（courseOutlines）を白で重ねて
 * 「隙間」の側を描く。破線の周期はコース全長に対して連なるので、
 * どこまで縮小しても点線のまま、色は分割した線のグラデーションが残る。
 *
 * dasharray の単位は「線幅」なので、そのまま固定値にすると縮小したときに
 * 破線が線幅ごと縮む。ズームごとに線幅で割り戻して、画面上ではどの倍率でも
 * だいたい 6px 描いて 4.5px 空ける形に揃える。
 *
 * 先頭の 0 は「塗らない区間」から始める指定。[0, 描く, 空ける] の並びで、
 * 元の破線とちょうど裏返しの位置（＝隙間になるところ）だけを白く塗る。
 */
const UNGROOMED_MASK_DASH: DataDrivenPropertyValueSpecification<number[]> = [
  "step",
  ["zoom"],
  // 配列そのものを式の戻り値にするので literal で包む。
  // 素の配列は式の呼び出しとして読まれ、レイヤーごと弾かれてしまう。
  ["literal", [0, 3, 2.2]],
  13,
  ["literal", [0, 2.4, 1.8]],
  14,
  ["literal", [0, 2, 1.5]],
  15,
  ["literal", [0, 1.7, 1.25]],
  16,
  ["literal", [0, 1.5, 1.1]],
  17,
  ["literal", [0, 1.3, 0.95]],
] as unknown as DataDrivenPropertyValueSpecification<number[]>;

/**
 * 隙間を空ける対象。
 * 選択中のコースは実線で見せる（点線のままだと形が読みにくい）。
 */
const getUngroomedMaskFilter = (
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
  // 圧雪・非圧雪をまとめて実線で描く。斜度モードでは 1 コースが
  // 頂点ごとの細片に分かれていて、そのグラデーションをそのまま出す。
  {
    id: FINALIZED_LAYER.courseLine,
    type: "line",
    source: FINALIZED_SOURCE.courses,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": getLineColor(state, "course"),
      "line-width": getLineWidth(state, "course"),
      "line-opacity": getLineOpacity(state, "course"),
    },
  },
  // 非圧雪コースの隙間。分割していない 1 本の線から破線の裏返しを白で重ねて、
  // 上の色付きの線を点線に見せる。
  {
    id: FINALIZED_LAYER.courseUngroomedMask,
    type: "line",
    source: FINALIZED_SOURCE.courseOutlines,
    filter: getUngroomedMaskFilter(state),
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: {
      "line-color": "#FFFFFF",
      "line-width": getLineWidth(state, "course"),
      "line-opacity": getLineOpacity(state, "course"),
      "line-dasharray": UNGROOMED_MASK_DASH,
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
  // 待機中のリフトは赤く点滅させる。opacity は useLiftAnimation が動かす
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
  // すべてのリフトに流れる破線を重ねる。速さで流す間隔を変えたいので、
  // line-dasharray を式にできない都合上、速さごとにレイヤーを分ける
  ...LIFT_FLOW_LAYERS.map(
    (layer): LayerSpecification => ({
      id: layer.id,
      type: "line",
      source: FINALIZED_SOURCE.lifts,
      filter: ["==", ["coalesce", ["get", "flowSpeed"], "normal"], layer.speed],
      // キャップは butt のまま。round にすると MapLibre が周期をまたぐ
      // 塗り（先頭の切れ端と末尾）をつなげてくれず、コマによって
      // 短い点が余分に描かれてしまう。
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: {
        "line-color": ["get", "flowColor"],
        "line-width": scaleWidth(LIFT_WIDTH, LIFT_FLOW_WIDTH_FACTOR),
        "line-opacity": getFlowOpacity(state),
        "line-dasharray": FLOW_DASH_FRAMES[0],
        // MapLibre は line-dasharray を「前の柄と次の柄のクロスフェード」で
        // 補間する。既定の 300ms のままコマ送りすると、常に 2 つの柄が
        // 重なって見え、塗りの長さが伸び縮みしているように見える。
        "line-dasharray-transition": { duration: 0, delay: 0 },
      },
    }),
  ),
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

  if (map.getLayer(FINALIZED_LAYER.courseUngroomedMask)) {
    map.setFilter(
      FINALIZED_LAYER.courseUngroomedMask,
      getUngroomedMaskFilter(state),
    );
  }

  for (const [layerId, kind] of [
    [FINALIZED_LAYER.courseLine, "course"],
    [FINALIZED_LAYER.liftLine, "lift"],
    [FINALIZED_LAYER.liftBlink, "lift"],
  ] as const) {
    set(layerId, "line-color", getLineColor(state, kind));
    set(layerId, "line-width", getLineWidth(state, kind));
    set(layerId, "line-opacity", getLineOpacity(state, kind));
  }

  // 隙間の線は白のままで、太さと濃さだけ色付きの線に追従させる
  set(
    FINALIZED_LAYER.courseUngroomedMask,
    "line-width",
    getLineWidth(state, "course"),
  );
  set(
    FINALIZED_LAYER.courseUngroomedMask,
    "line-opacity",
    getLineOpacity(state, "course"),
  );

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
  for (const layer of LIFT_FLOW_LAYERS) {
    set(layer.id, "line-opacity", getFlowOpacity(state));
  }

  set(FINALIZED_LAYER.courseArrow, "icon-opacity", [
    "case",
    isMutedExpression(state, "course"),
    0,
    isDimmedExpression(state, "course"),
    0.45,
    1,
  ]);
};
