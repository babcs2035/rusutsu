import type { ExpressionSpecification, LayerSpecification } from "maplibre-gl";

export const EDITOR_SOURCE = {
  backgroundLines: "editor-background-lines",
  lines: "editor-lines",
  mergeDiscarded: "editor-merge-discarded",
  mergePreview: "editor-merge-preview",
  mergeAnchors: "editor-merge-anchors",
  vertices: "editor-vertices",
  midpoints: "editor-midpoints",
  insertHint: "editor-insert-hint",
  midstation: "editor-midstation",
} as const;

export const EDITOR_LAYER = {
  backgroundLine: "editor-background-line",
  lineInactive: "editor-line-inactive",
  lineHovered: "editor-line-hovered",
  lineActive: "editor-line-active",
  lineHit: "editor-line-hit",
  mergeDiscarded: "editor-merge-discarded-line",
  mergePreview: "editor-merge-preview-line",
  midpoint: "editor-midpoint",
  midpointHit: "editor-midpoint-hit",
  insertHint: "editor-insert-hint-point",
  vertex: "editor-vertex",
  vertexHit: "editor-vertex-hit",
  mergeAnchor: "editor-merge-anchor",
  midstation: "editor-midstation",
  midstationHit: "editor-midstation-hit",
} as const;

/** Leaflet 版と同じ色。編集中はどれを触っているかが分かることを優先する */
const COLOR = {
  activeLine: "#E53E3E",
  inactiveLine: "#3182CE",
  hoveredLine: "#2B6CB0",
  backgroundLine: "#4A5568",
  vertex: "#E53E3E",
  lastVertex: "#DD6B20",
  splitVertex: "#805AD5",
  midpoint: "#3182CE",
  insertHint: "#E53E3E",
  midstation: "#2F855A",
  mergePreview: "#0F9D58",
  mergeAnchor: "#0F9D58",
  mergeDiscarded: "#A0AEC0",
} as const;

/**
 * 点の半径。Leaflet 版は直径で指定していたので、その半分。
 * 白い縁は circle-stroke で描く（divIcon の box-shadow は再現できない）。
 */
const RADIUS = {
  vertex: 7,
  lastVertex: 8,
  splitVertex: 8,
  midpoint: 5,
  insertHint: 5,
  midstation: 9,
  mergeAnchor: 9,
} as const;

const POINT_STROKE_WIDTH = 2;

/**
 * 当たり判定の広さ。
 *
 * 見た目の太さで判定すると、拡大していないと線をつかめない。公式マップ並みに
 * 「線の近くを押せば反応する」を目指して、判定だけ指の幅ぶんまで広げる。
 * 複数の線がこの幅で重なったときは、EditorMap 側で画面上の距離を測って
 * いちばん近い線を選ぶので、広げても取り違えは起きない。
 */
export const LINE_HIT_WIDTH = 26;

const HIT_RADIUS = {
  vertex: RADIUS.lastVertex + 8,
  midpoint: RADIUS.midpoint + 9,
  midstation: RADIUS.midstation + 6,
} as const;

const isActive: ExpressionSpecification = ["get", "active"];
const isHovered: ExpressionSpecification = ["get", "hovered"];

const createPointHitLayer = (
  id: string,
  source: string,
  radius: number,
): LayerSpecification => ({
  id,
  type: "circle",
  source,
  paint: {
    "circle-radius": radius,
    "circle-color": "#000000",
    "circle-opacity": 0,
  },
});

const byVertexKind = <T>(
  vertex: T,
  last: T,
  split: T,
): ExpressionSpecification =>
  [
    "match",
    ["get", "kind"],
    "last",
    last,
    "split",
    split,
    vertex,
  ] as unknown as ExpressionSpecification;

/**
 * 編集用のレイヤー。下から順に返す。
 *
 * 頂点も中点も DOM のマーカーではなくレイヤーで描く。頂点ドラッグ中は
 * 毎フレーム座標が変わるので、DOM 要素だと「掴んでいる最中に要素が
 * 差し替わって操作が切れる」事故が起きる。レイヤーなら掴む対象の DOM が
 * そもそも無いので、その危険が構造ごと消える。
 */
export const createEditorLayers = (): LayerSpecification[] => [
  {
    id: EDITOR_LAYER.backgroundLine,
    type: "line",
    source: EDITOR_SOURCE.backgroundLines,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": COLOR.backgroundLine,
      "line-width": 3,
      "line-opacity": 0.55,
      // dasharray の単位は線幅の倍数。Leaflet の "6 6" は線幅 3 なので [2, 2]
      "line-dasharray": [2, 2],
    },
  },
  {
    id: EDITOR_LAYER.lineInactive,
    type: "line",
    source: EDITOR_SOURCE.lines,
    filter: ["all", ["!", isActive], ["!", isHovered]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": COLOR.inactiveLine,
      "line-width": 3,
      "line-opacity": 0.7,
    },
  },
  {
    id: EDITOR_LAYER.lineHovered,
    type: "line",
    source: EDITOR_SOURCE.lines,
    filter: isHovered,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": COLOR.hoveredLine,
      "line-width": 6,
      "line-opacity": 0.9,
    },
  },
  {
    id: EDITOR_LAYER.lineActive,
    type: "line",
    source: EDITOR_SOURCE.lines,
    filter: isActive,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": COLOR.activeLine,
      "line-width": 5,
      "line-opacity": 0.95,
    },
  },
  {
    id: EDITOR_LAYER.lineHit,
    type: "line",
    source: EDITOR_SOURCE.lines,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#000000",
      "line-opacity": 0,
      "line-width": LINE_HIT_WIDTH,
    },
  },
  {
    id: EDITOR_LAYER.mergeDiscarded,
    type: "line",
    source: EDITOR_SOURCE.mergeDiscarded,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": COLOR.mergeDiscarded,
      "line-width": 4,
      "line-opacity": 0.65,
      "line-dasharray": [1.5, 1.5],
    },
  },
  {
    id: EDITOR_LAYER.mergePreview,
    type: "line",
    source: EDITOR_SOURCE.mergePreview,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": COLOR.mergePreview,
      "line-width": 7,
      "line-opacity": 0.9,
    },
  },
  {
    id: EDITOR_LAYER.midpoint,
    type: "circle",
    source: EDITOR_SOURCE.midpoints,
    paint: {
      "circle-radius": RADIUS.midpoint,
      "circle-color": COLOR.midpoint,
      "circle-opacity": 0.7,
      "circle-stroke-width": POINT_STROKE_WIDTH,
      "circle-stroke-color": "#FFFFFF",
      "circle-stroke-opacity": 0.7,
    },
  },
  createPointHitLayer(
    EDITOR_LAYER.midpointHit,
    EDITOR_SOURCE.midpoints,
    HIT_RADIUS.midpoint,
  ),
  {
    id: EDITOR_LAYER.insertHint,
    type: "circle",
    source: EDITOR_SOURCE.insertHint,
    paint: {
      "circle-radius": RADIUS.insertHint,
      "circle-color": COLOR.insertHint,
      "circle-opacity": 0.55,
      "circle-stroke-width": POINT_STROKE_WIDTH,
      "circle-stroke-color": "#FFFFFF",
    },
  },
  {
    id: EDITOR_LAYER.vertex,
    type: "circle",
    source: EDITOR_SOURCE.vertices,
    paint: {
      "circle-radius": byVertexKind(
        RADIUS.vertex,
        RADIUS.lastVertex,
        RADIUS.splitVertex,
      ),
      "circle-color": byVertexKind(
        COLOR.vertex,
        COLOR.lastVertex,
        COLOR.splitVertex,
      ),
      "circle-stroke-width": POINT_STROKE_WIDTH,
      "circle-stroke-color": "#FFFFFF",
    },
  },
  createPointHitLayer(
    EDITOR_LAYER.vertexHit,
    EDITOR_SOURCE.vertices,
    HIT_RADIUS.vertex,
  ),
  {
    id: EDITOR_LAYER.mergeAnchor,
    type: "circle",
    source: EDITOR_SOURCE.mergeAnchors,
    paint: {
      "circle-radius": RADIUS.mergeAnchor,
      "circle-color": COLOR.mergeAnchor,
      "circle-stroke-width": 3,
      "circle-stroke-color": "#FFFFFF",
    },
  },
  {
    id: EDITOR_LAYER.midstation,
    type: "circle",
    source: EDITOR_SOURCE.midstation,
    paint: {
      "circle-radius": RADIUS.midstation,
      "circle-color": COLOR.midstation,
      "circle-stroke-width": POINT_STROKE_WIDTH,
      "circle-stroke-color": "#FFFFFF",
    },
  },
  createPointHitLayer(
    EDITOR_LAYER.midstationHit,
    EDITOR_SOURCE.midstation,
    HIT_RADIUS.midstation,
  ),
];
