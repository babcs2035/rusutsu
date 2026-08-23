import type { FeatureCollection, Point } from "geojson";
import type {
  FilterSpecification,
  LayerSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import { RESORT_POINT_RADIUS, SELECTED_MARKER_RING_WIDTH } from "../constants";
import type { MapTileVariant } from "../types";

export const RESORT_POINT_SOURCE = "resort-points";

export const RESORT_POINT_LAYER = {
  shadow: "resort-point-shadow",
  selected: "resort-point-selected",
  point: "resort-point",
  hit: "resort-point-hit",
} as const;

export type ResortPointProperties = {
  resortId: string;
  color: string;
  opacity: number;
  selected: boolean;
  /** ラベルが出ていない点はタップさせない（低ズームでの誤タップを防ぐ） */
  interactive: boolean;
};

export type ResortPointCollection = FeatureCollection<
  Point,
  ResortPointProperties
>;

export const EMPTY_RESORT_POINTS: ResortPointCollection = {
  type: "FeatureCollection",
  features: [],
};

export const RESORT_POINT_COLOR = {
  pale: { normal: "#007C89", filterMatch: "#D9480F" },
  photo: { normal: "#22D3EE", filterMatch: "#FB923C" },
} as const satisfies Record<
  MapTileVariant,
  { normal: string; filterMatch: string }
>;

const SELECTED_RING_COLOR = {
  pale: "#1E293B",
  photo: "#FDE047",
} as const satisfies Record<MapTileVariant, string>;

const SELECTED_RING_RADIUS =
  RESORT_POINT_RADIUS + SELECTED_MARKER_RING_WIDTH * 0.5 + 1.5;

const isSelected: FilterSpecification = ["==", ["get", "selected"], true];

/**
 * スキー場の点。
 *
 * DOM のマーカーだと 500 個ぶんの transform を毎フレーム書き換えることになり、
 * 地図の動きから目に見えて遅れる。円レイヤーにすれば地図と同じ描画に乗るので、
 * パンでもズームでもぴったり付いてくる。
 */
export const createResortPointLayers = (
  tileVariant: MapTileVariant,
  hitRadius: number,
): LayerSpecification[] => [
  {
    id: RESORT_POINT_LAYER.shadow,
    type: "circle",
    source: RESORT_POINT_SOURCE,
    paint: {
      "circle-radius": RESORT_POINT_RADIUS + 1.4,
      "circle-color": "#0F172A",
      "circle-opacity": ["*", ["get", "opacity"], 0.42],
    },
  },
  {
    id: RESORT_POINT_LAYER.selected,
    type: "circle",
    source: RESORT_POINT_SOURCE,
    filter: isSelected,
    paint: {
      "circle-radius": SELECTED_RING_RADIUS,
      "circle-color": SELECTED_RING_COLOR[tileVariant],
      "circle-stroke-width": SELECTED_MARKER_RING_WIDTH,
      "circle-stroke-color":
        tileVariant === "photo" ? "rgba(15,23,42,0.95)" : "#FFFFFF",
    },
  },
  {
    id: RESORT_POINT_LAYER.point,
    type: "circle",
    source: RESORT_POINT_SOURCE,
    paint: {
      "circle-radius": RESORT_POINT_RADIUS,
      "circle-color": ["get", "color"],
      "circle-opacity": ["get", "opacity"],
      "circle-stroke-width": 1.2,
      "circle-stroke-color": "#FFFFFF",
      "circle-stroke-opacity": ["get", "opacity"],
    },
  },
  {
    id: RESORT_POINT_LAYER.hit,
    type: "circle",
    source: RESORT_POINT_SOURCE,
    filter: ["==", ["get", "interactive"], true],
    paint: {
      "circle-radius": hitRadius,
      "circle-color": "#000000",
      "circle-opacity": 0,
    },
  },
];

/** 選択リングの色だけはタイル種別で変える（写真の上では白黒が逆になる） */
export const applyResortPointTileVariant = (
  map: Pick<MapLibreMap, "getLayer" | "setPaintProperty">,
  tileVariant: MapTileVariant,
) => {
  if (!map.getLayer(RESORT_POINT_LAYER.selected)) return;

  map.setPaintProperty(
    RESORT_POINT_LAYER.selected,
    "circle-color",
    SELECTED_RING_COLOR[tileVariant],
  );
  map.setPaintProperty(
    RESORT_POINT_LAYER.selected,
    "circle-stroke-color",
    tileVariant === "photo" ? "rgba(15,23,42,0.95)" : "#FFFFFF",
  );
};
