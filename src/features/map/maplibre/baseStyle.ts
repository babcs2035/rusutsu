import type { StyleSpecification } from "maplibre-gl";
import {
  GSI_TILE_ATTRIBUTION,
  GSI_TILE_LAYERS,
  GSI_TILE_MAX_ZOOM,
  GSI_TILE_MIN_ZOOM,
} from "../constants";
import type { CourseColorMode, MapTileVariant } from "../types";

export const BASE_RASTER_SOURCE_ID = {
  pale: "gsi-pale",
  photo: "gsi-photo",
} as const satisfies Record<MapTileVariant, string>;

export const BASE_RASTER_LAYER_ID = {
  pale: "gsi-pale-layer",
  photo: "gsi-photo-layer",
} as const satisfies Record<MapTileVariant, string>;

/**
 * 地図タイルの色味。
 *
 * Leaflet 版では CSS filter を掛けていたが、MapLibre はラスタレイヤーの
 * paint プロパティとして持っているので、タイルの継ぎ目を作らずに同じ調整ができる。
 */
type RasterTone = {
  saturation: number;
  contrast: number;
  brightnessMin: number;
};

const TONE: Record<
  MapTileVariant,
  { normal: RasterTone; focus: RasterTone; slope: RasterTone }
> = {
  pale: {
    normal: { saturation: -0.08, contrast: -0.02, brightnessMin: 0.02 },
    focus: { saturation: -0.42, contrast: -0.18, brightnessMin: 0.1 },
    slope: { saturation: -1, contrast: -0.1, brightnessMin: 0.06 },
  },
  photo: {
    normal: { saturation: -0.22, contrast: -0.1, brightnessMin: 0.04 },
    focus: { saturation: -0.38, contrast: -0.18, brightnessMin: 0.08 },
    slope: { saturation: -1, contrast: -0.08, brightnessMin: 0.04 },
  },
};

export const getRasterTone = ({
  variant,
  isFocusMode,
  courseColorMode,
  hasCourses,
}: {
  variant: MapTileVariant;
  isFocusMode: boolean;
  courseColorMode: CourseColorMode;
  hasCourses: boolean;
}): RasterTone => {
  const tone = TONE[variant];
  // 斜度モードでは地図を白黒にして、斜度の色だけが目に入るようにする
  if (hasCourses && courseColorMode === "slope") return tone.slope;
  return isFocusMode ? tone.focus : tone.normal;
};

export const createBaseStyle = (
  variant: MapTileVariant,
): StyleSpecification => ({
  version: 8,
  // 文字は DOM のオーバーレイで描くので glyphs（フォント PBF）は要らない。
  // 日本語のグリフ一式をホストする必要がなくなり、外部サービスにも依存しない。
  sources: {
    [BASE_RASTER_SOURCE_ID.pale]: {
      type: "raster",
      tiles: [GSI_TILE_LAYERS.pale.url],
      tileSize: 256,
      minzoom: GSI_TILE_MIN_ZOOM,
      maxzoom: GSI_TILE_MAX_ZOOM,
      attribution: GSI_TILE_ATTRIBUTION,
    },
    [BASE_RASTER_SOURCE_ID.photo]: {
      type: "raster",
      tiles: [GSI_TILE_LAYERS.photo.url],
      tileSize: 256,
      minzoom: GSI_TILE_MIN_ZOOM,
      maxzoom: GSI_TILE_MAX_ZOOM,
      attribution: GSI_TILE_ATTRIBUTION,
    },
  },
  layers: [
    {
      id: BASE_RASTER_LAYER_ID.pale,
      type: "raster",
      source: BASE_RASTER_SOURCE_ID.pale,
      layout: { visibility: variant === "pale" ? "visible" : "none" },
      paint: { "raster-fade-duration": 120 },
    },
    {
      id: BASE_RASTER_LAYER_ID.photo,
      type: "raster",
      source: BASE_RASTER_SOURCE_ID.photo,
      layout: { visibility: variant === "photo" ? "visible" : "none" },
      paint: { "raster-fade-duration": 120 },
    },
  ],
});
