import type {
  Map as MapLibreMap,
  RasterSourceSpecification,
  StyleSpecification,
} from "maplibre-gl";
import { GOOGLE_TILE_LAYERS, TILE_LAYERS } from "../../constants";
import type { TileLayerId } from "../../types";

const GOOGLE_LAYER_IDS = ["googleSatellite", "googleHybrid"] as const;
type GoogleLayerId = (typeof GOOGLE_LAYER_IDS)[number];

export const isGoogleTileLayer = (id: TileLayerId): id is GoogleLayerId =>
  id === "googleSatellite" || id === "googleHybrid";

/** Google タイルが使えないときの代役 */
export const FALLBACK_TILE_LAYER: TileLayerId = "gsiPale";

const tileSourceId = (id: TileLayerId) => `editor-tile-${id}`;
export const tileLayerId = (id: TileLayerId) => `editor-tile-layer-${id}`;

export const EDITOR_BACKGROUND_LAYER = "editor-tile-background";

/**
 * 生タイルの最大ズーム。
 *
 * Leaflet の TileLayer.maxZoom は「地図をここまでしか拡大させない」だったが、
 * MapLibre の source.maxzoom は「これ以上細かいタイルは取りに行かず引き伸ばす」で
 * 意味が違う。拡大の上限は map 側の maxZoom で別に決める必要がある。
 */
const RAW_MAX_ZOOM: Record<TileLayerId, number> = {
  gsiPale: TILE_LAYERS.gsiPale.maxZoom,
  gsiPhoto: TILE_LAYERS.gsiPhoto.maxZoom,
  osm: TILE_LAYERS.osm.maxZoom,
  googleSatellite: 21,
  googleHybrid: 21,
};

/**
 * 地図に許す最大ズーム。
 *
 * 256px のタイルを tileSize:256 で使うと、MapLibre は「スタイルズーム + 1」の
 * 生タイルを取りに行く。Leaflet はタイルの z をそのままズーム値にしていたので、
 * Leaflet 時代の値から 1 引くと同じ見え方になる。
 * src/features/map/constants.ts:13-21 と同じ事情。
 */
export const getMapMaxZoom = (id: TileLayerId) => RAW_MAX_ZOOM[id] - 1;

const rasterSource = (
  tiles: string,
  attribution: string,
  maxzoom: number,
): RasterSourceSpecification => ({
  type: "raster",
  tiles: [tiles],
  tileSize: 256,
  maxzoom,
  attribution,
});

/** 最初からスタイルに入れておくタイル。Google は URL が非同期なので入れられない */
const STATIC_TILE_IDS = ["gsiPale", "gsiPhoto", "osm"] as const;

/**
 * 編集地図のベーススタイル。
 *
 * 切り替えはソースの差し替えではなく visibility で行う。差し替えると
 * タイルを全部捨てて取り直すので、切り替えるたびに一度白くなる。
 */
export const createEditorStyle = (
  initialLayerId: TileLayerId,
): StyleSpecification => {
  const visibleId = isGoogleTileLayer(initialLayerId)
    ? FALLBACK_TILE_LAYER
    : initialLayerId;

  return {
    version: 8,
    // 文字は DOM で描くので glyphs（フォント PBF）は要らない
    sources: Object.fromEntries(
      STATIC_TILE_IDS.map(id => [
        tileSourceId(id),
        rasterSource(
          TILE_LAYERS[id].url,
          TILE_LAYERS[id].attribution,
          RAW_MAX_ZOOM[id],
        ),
      ]),
    ),
    layers: [
      // タイルが届くまでの下地。透明のままだと真っ白に見える
      {
        id: EDITOR_BACKGROUND_LAYER,
        type: "background",
        paint: { "background-color": "#C9CED4" },
      },
      ...STATIC_TILE_IDS.map(id => ({
        id: tileLayerId(id),
        type: "raster" as const,
        source: tileSourceId(id),
        layout: {
          visibility: id === visibleId ? "visible" : ("none" as const),
        },
        paint: { "raster-fade-duration": 120 },
      })),
    ],
  } as StyleSpecification;
};

/**
 * Google タイルを地図に足す。
 * セッションを取れて初めて URL が決まるので、後から差し込む。
 */
export const addGoogleTileLayer = (
  map: MapLibreMap,
  id: GoogleLayerId,
  url: string,
) => {
  if (map.getLayer(tileLayerId(id))) return;

  map.addSource(
    tileSourceId(id),
    rasterSource(url, "&copy; Google", RAW_MAX_ZOOM[id]),
  );
  // コースやリフトの線より下に入れる。末尾に足すと線を覆い隠してしまう
  const firstEditorLayer = map
    .getStyle()
    .layers.find(
      layer =>
        layer.id.startsWith("editor-") && !layer.id.startsWith("editor-tile"),
    );

  map.addLayer(
    {
      id: tileLayerId(id),
      type: "raster",
      source: tileSourceId(id),
      layout: { visibility: "none" },
      paint: { "raster-fade-duration": 120 },
    },
    firstEditorLayer?.id,
  );
};

export const ALL_TILE_IDS: TileLayerId[] = [
  ...STATIC_TILE_IDS,
  ...GOOGLE_LAYER_IDS,
];

export { GOOGLE_TILE_LAYERS };
