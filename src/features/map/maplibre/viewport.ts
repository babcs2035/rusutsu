import {
  LngLatBounds,
  type Map as MapLibreMap,
  type PaddingOptions,
} from "maplibre-gl";
import type { GeoCoordinate } from "@/lib/finalizedResortGeojsonShared";
import type { MapSkiResort } from "@/types/skiResorts";
import {
  COMPARE_MAP_HEADER_ATTRIBUTE,
  COMPARE_PANEL_ATTRIBUTE,
  DESKTOP_LABEL_SHOW_ZOOM,
  DETAIL_PANEL_ATTRIBUTE,
  FEATURE_DETAIL_OVERLAY_ATTRIBUTE,
  GSI_TILE_MIN_ZOOM,
} from "../constants";

const BASE_PADDING = 32;
/**
 * スキー場の点に合わせるときの余白。
 * 名前のラベルは点の左右に出るので、点を画面の縁ぎりぎりに置くと
 * 名前だけが画面外へ出てしまう。ラベル 1 個ぶんの幅を見込んでおく。
 */
const RESORT_FIT_PADDING_X = 108;
const RESORT_FIT_PADDING_Y = 56;

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

/**
 * 地図に重ねている「選択中のコース」パネルが、左右それぞれ何 px 隠しているか。
 * 選んだコースがそのパネルの下に潜らないよう、寄せるときの余白に足す。
 */
export const getFeatureDetailOverlayPadding = (
  map: MapLibreMap,
): { left: number; right: number } => {
  if (typeof document === "undefined") return { left: 0, right: 0 };

  const mapRect = map.getContainer().getBoundingClientRect();
  let left = 0;
  let right = 0;
  const overlays = document.querySelectorAll<HTMLElement>(
    `[${FEATURE_DETAIL_OVERLAY_ATTRIBUTE}]`,
  );
  for (const overlay of overlays) {
    const rect = overlay.getBoundingClientRect();
    const overlapsVertically =
      rect.bottom > mapRect.top && rect.top < mapRect.bottom;
    if (!overlapsVertically || rect.width >= mapRect.width) continue;

    if (overlay.dataset.mapFeatureDetailOverlay === "right") {
      right = Math.max(
        right,
        mapRect.right - Math.max(mapRect.left, rect.left),
      );
      continue;
    }
    left = Math.max(left, Math.min(mapRect.right, rect.right) - mapRect.left);
  }
  return {
    left: Math.max(0, Math.min(mapRect.width, left)),
    right: Math.max(0, Math.min(mapRect.width, right)),
  };
};

/** 地図の上にかぶさっている帯の高さ。比較の切替・表示設定の帯で使う */
export const getCompareHeaderOverlapTopHeight = (map: MapLibreMap): number => {
  if (typeof document === "undefined") return 0;

  const header = document.querySelector<HTMLElement>(
    `[${COMPARE_MAP_HEADER_ATTRIBUTE}="true"]`,
  );
  if (!header) return 0;

  const mapRect = map.getContainer().getBoundingClientRect();
  const headerRect = header.getBoundingClientRect();
  const overlapsHorizontally =
    headerRect.right > mapRect.left && headerRect.left < mapRect.right;
  if (!overlapsHorizontally || headerRect.height >= mapRect.height) return 0;

  return Math.max(0, headerRect.bottom - mapRect.top);
};

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
  basePadding: { x: number; y: number } = { x: BASE_PADDING, y: BASE_PADDING },
  topPanelHeight = 0,
  leftPanelWidth = 0,
): PaddingOptions => {
  const size = getMapSize(map);
  // 地図より余白の方が大きくなると MapLibre 側の計算が壊れるので、
  // 上下左右あわせて地図の半分までに収める
  const paddingX = Math.min(basePadding.x, Math.max(0, size.x / 4));
  const paddingY = Math.min(basePadding.y, Math.max(0, size.y / 4));
  const maxHorizontalPadding = Math.max(paddingX, size.x - paddingX * 3);
  const maxRightPadding = maxHorizontalPadding;
  const maxVerticalPadding = Math.max(paddingY, size.y - paddingY * 3);

  return {
    top: Math.min(topPanelHeight + paddingY, maxVerticalPadding),
    left: Math.min(leftPanelWidth + paddingX, maxHorizontalPadding),
    right: Math.min(rightPanelWidth + paddingX, maxRightPadding),
    bottom: Math.min(bottomPanelHeight + paddingY, maxVerticalPadding),
  };
};

/**
 * 収めたい範囲がいまの最小ズームに収まらないときだけ、最小ズームを下げる。
 *
 * 最小ズームは「日本から離れすぎない」ための下限だが、そのままだと
 * 北海道と九州のように離れたスキー場を検索・比較したときに
 * fitBounds が下限で頭打ちになり、一部が画面の外に出てしまう。
 * 上げ直すと今の表示が飛ぶので、下げるだけにする。
 */
const relaxMinZoomForFit = (map: MapLibreMap, requiredZoom: number) => {
  const required = Math.max(GSI_TILE_MIN_ZOOM, requiredZoom);
  if (map.getMinZoom() <= required) return;
  map.setMinZoom(required);
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
  topPanelHeight = 0,
  labelShowZoom = DESKTOP_LABEL_SHOW_ZOOM,
  animate = true,
}: {
  map: MapLibreMap;
  resorts: MapSkiResort[];
  rightPanelWidth?: number;
  bottomPanelHeight?: number;
  topPanelHeight?: number;
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
      offset: [-rightPanelWidth / 2, (topPanelHeight - bottomPanelHeight) / 2],
      ...getMoveOptions(animate),
    });
    return;
  }

  const bounds = getResortBounds(resorts);
  if (!bounds) return;

  const padding = getSafeFitPadding(
    map,
    rightPanelWidth,
    bottomPanelHeight,
    { x: RESORT_FIT_PADDING_X, y: RESORT_FIT_PADDING_Y },
    topPanelHeight,
  );
  // 指定しないと北向きに戻ってしまう。今見ている向きのままにする
  const bearing = map.getBearing();
  const camera = map.cameraForBounds(bounds, { padding, bearing });
  if (camera?.zoom !== undefined) relaxMinZoomForFit(map, camera.zoom);

  map.fitBounds(bounds, {
    padding,
    bearing,
    ...getMoveOptions(animate),
  });
};
