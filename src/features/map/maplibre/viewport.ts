import {
  LngLatBounds,
  type Map as MapLibreMap,
  type PaddingOptions,
} from "maplibre-gl";
import type { GeoCoordinate } from "@/lib/finalizedResortGeojsonShared";
import type { MapSkiResort } from "@/types/skiResorts";
import {
  COMPARE_PANEL_ATTRIBUTE,
  DESKTOP_LABEL_SHOW_ZOOM,
  DETAIL_PANEL_ATTRIBUTE,
} from "../constants";

const BASE_PADDING = 32;

export const getCoordinateBounds = (
  coordinates: GeoCoordinate[],
): LngLatBounds | null => {
  if (coordinates.length === 0) return null;

  const bounds = new LngLatBounds();
  for (const coordinate of coordinates) {
    bounds.extend([coordinate[0], coordinate[1]]);
  }
  return bounds;
};

export const getResortBounds = (
  resorts: MapSkiResort[],
): LngLatBounds | null => {
  if (resorts.length === 0) return null;

  const bounds = new LngLatBounds();
  for (const resort of resorts) {
    bounds.extend([resort.longitude, resort.latitude]);
  }
  return bounds;
};

export const getMapSize = (map: MapLibreMap) => {
  const container = map.getContainer();
  return { x: container.clientWidth, y: container.clientHeight };
};

/**
 * 右側のパネルが地図にかぶっている幅。
 * パネルは地図の上に重ねて出しているので、そのぶんだけ見える範囲が狭い。
 */
const getPanelOverlapRightWidth = (
  map: MapLibreMap,
  panelAttribute: string,
): number => {
  if (typeof document === "undefined") return 0;

  const panel = document.querySelector<HTMLElement>(
    `[${panelAttribute}="true"]`,
  );
  if (!panel) return 0;

  const mapRect = map.getContainer().getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const overlapsVertically =
    panelRect.bottom > mapRect.top && panelRect.top < mapRect.bottom;
  if (!overlapsVertically || panelRect.width >= mapRect.width) return 0;

  const overlapRight = mapRect.right - Math.max(mapRect.left, panelRect.left);
  return Math.max(0, Math.min(mapRect.width, overlapRight));
};

export const getComparePanelOverlapRightWidth = (map: MapLibreMap): number =>
  getPanelOverlapRightWidth(map, COMPARE_PANEL_ATTRIBUTE);

export const getDetailPanelOverlapRightWidth = (map: MapLibreMap): number =>
  getPanelOverlapRightWidth(map, DETAIL_PANEL_ATTRIBUTE);

/**
 * パネルに隠れない範囲の真ん中に寄せるためのずらし量（px）。
 * easeTo の offset は「終了時に center が置かれる、コンテナ中心からの差」なので、
 * 隠れている幅の半分だけ手前へ寄せればよい。
 */
export const getPanelOffset = (
  rightPanelWidth: number,
  bottomPanelHeight: number,
): [number, number] => [-rightPanelWidth / 2, -bottomPanelHeight / 2];

/**
 * fitBounds のパディング。
 * パネル幅をそのまま渡すと、狭い画面で「上下左右の余白 > 地図」になって
 * MapLibre 側が破綻するため、地図サイズから決まる上限で頭打ちにする。
 */
export const getSafeFitPadding = (
  map: MapLibreMap,
  rightPanelWidth: number,
  bottomPanelHeight: number,
): PaddingOptions => {
  const size = getMapSize(map);
  const maxRightPadding = Math.max(BASE_PADDING, size.x - BASE_PADDING * 3);
  const maxBottomPadding = Math.max(BASE_PADDING, size.y - BASE_PADDING * 3);

  return {
    top: BASE_PADDING,
    left: BASE_PADDING,
    right: Math.min(rightPanelWidth + BASE_PADDING, maxRightPadding),
    bottom: Math.min(bottomPanelHeight + BASE_PADDING, maxBottomPadding),
  };
};

/**
 * アニメーションの有無。
 *
 * duration: undefined を渡すと MapLibre 側の既定値（500ms）を
 * undefined で上書きしてしまい、計算が NaN になって地図が壊れる。
 * 動かさないときだけキーごと足す。
 */
export const getMoveOptions = (animate: boolean) =>
  animate ? {} : { duration: 0 };

export const fitResortsInViewport = ({
  map,
  resorts,
  rightPanelWidth = 0,
  bottomPanelHeight = 0,
  labelShowZoom = DESKTOP_LABEL_SHOW_ZOOM,
  animate = true,
}: {
  map: MapLibreMap;
  resorts: MapSkiResort[];
  rightPanelWidth?: number;
  bottomPanelHeight?: number;
  labelShowZoom?: number;
  animate?: boolean;
}) => {
  if (resorts.length === 0) return;

  const first = resorts[0];
  if (resorts.length === 1 && first) {
    const targetZoom = Math.max(map.getZoom(), labelShowZoom);
    map.easeTo({
      center: [first.longitude, first.latitude],
      zoom: targetZoom,
      offset: getPanelOffset(rightPanelWidth, bottomPanelHeight),
      ...getMoveOptions(animate),
    });
    return;
  }

  const bounds = getResortBounds(resorts);
  if (!bounds) return;

  map.fitBounds(bounds, {
    padding: getSafeFitPadding(map, rightPanelWidth, bottomPanelHeight),
    // 指定しないと北向きに戻ってしまう。今見ている向きのままにする
    bearing: map.getBearing(),
    ...getMoveOptions(animate),
  });
};
