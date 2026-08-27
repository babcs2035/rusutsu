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

export const BASE_BACKGROUND_LAYER_ID = "base-background";

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
export type RasterTone = {
  saturation: number;
  contrast: number;
  brightnessMin: number;
};

const TONE: Record<MapTileVariant, { normal: RasterTone; mono: RasterTone }> = {
  pale: {
    normal: { saturation: -0.08, contrast: -0.02, brightnessMin: 0.02 },
    mono: { saturation: -1, contrast: -0.1, brightnessMin: 0.06 },
  },
  photo: {
    normal: { saturation: -0.22, contrast: -0.1, brightnessMin: 0.04 },
    mono: { saturation: -1, contrast: -0.08, brightnessMin: 0.04 },
  },
};

/**
 * 地図の色味。
 *
 * スキー場を選んでいる間は必ず白黒にする。判断の材料は interactionMode だけで、
 * コースデータの到着を待たない。待つと「選んだ直後はカラー写真 → データが届いて
 * 白黒」と一段遅れて色が抜け、ちらついて見える。
 */
export const getRasterTone = ({
  variant,
  isDetailView,
  courseColorMode,
  hasCourses,
}: {
  variant: MapTileVariant;
  isDetailView: boolean;
  courseColorMode: CourseColorMode;
  hasCourses: boolean;
}): RasterTone => {
  const tone = TONE[variant];
  if (isDetailView) return tone.mono;
  // 斜度モードでは地図を白黒にして、斜度の色だけが目に入るようにする
  if (hasCourses && courseColorMode === "slope") return tone.mono;
  return tone.normal;
};

/**
 * 初期スタイル。
 *
 * 色味は生成時点で焼き込む。paint を後から useEffect で当てると、
 * 1 フレームだけ元の色のタイルが見えてから色が変わる。
 * 詳細画面用に作り直される地図（スマホのプレビュー・全画面）で目に付く。
 */
export const createBaseStyle = (
  variant: MapTileVariant,
  tone: RasterTone,
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
    // タイルが届くまでの下地。透明のままだと真っ白に見えて、
    // 「白地図が出てから写真に変わった」ように見えてしまう
    {
      id: BASE_BACKGROUND_LAYER_ID,
      type: "background",
      paint: { "background-color": "#c9ced4" },
    },
    {
      id: BASE_RASTER_LAYER_ID.pale,
      type: "raster",
      source: BASE_RASTER_SOURCE_ID.pale,
      layout: { visibility: variant === "pale" ? "visible" : "none" },
      paint: {
        "raster-fade-duration": 120,
        "raster-saturation": tone.saturation,
        "raster-contrast": tone.contrast,
        "raster-brightness-min": tone.brightnessMin,
      },
    },
    {
      id: BASE_RASTER_LAYER_ID.photo,
      type: "raster",
      source: BASE_RASTER_SOURCE_ID.photo,
      layout: { visibility: variant === "photo" ? "visible" : "none" },
      paint: {
        "raster-fade-duration": 120,
        "raster-saturation": tone.saturation,
        "raster-contrast": tone.contrast,
        "raster-brightness-min": tone.brightnessMin,
      },
    },
  ],
});
