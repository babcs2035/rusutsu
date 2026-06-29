import L from "leaflet";
import type { MapSkiResort } from "@/types/skiResorts";
import {
  COMPARE_PANEL_ATTRIBUTE,
  DESKTOP_LABEL_SHOW_ZOOM,
  DETAIL_PANEL_ATTRIBUTE,
} from "../constants";

const getPanelOverlapRightWidth = (
  map: L.Map,
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

export const getComparePanelOverlapRightWidth = (map: L.Map): number =>
  getPanelOverlapRightWidth(map, COMPARE_PANEL_ATTRIBUTE);

export const getDetailPanelOverlapRightWidth = (map: L.Map): number =>
  getPanelOverlapRightWidth(map, DETAIL_PANEL_ATTRIBUTE);

export const getPanelAdjustedCenter = (
  map: L.Map,
  latLng: L.LatLngExpression,
  rightPanelWidth: number,
  bottomPanelHeight: number,
  zoom = map.getZoom(),
): L.LatLng => {
  if (rightPanelWidth <= 0 && bottomPanelHeight <= 0) return L.latLng(latLng);

  const point = map.project(latLng, zoom);
  return map.unproject(
    point.add([rightPanelWidth / 2, bottomPanelHeight / 2]),
    zoom,
  );
};

export const getSafeFitPadding = (
  map: L.Map,
  rightPanelWidth: number,
  bottomPanelHeight: number,
): {
  paddingTopLeft: L.PointExpression;
  paddingBottomRight: L.PointExpression;
} => {
  const mapSize = map.getSize();
  const basePadding = 32;
  const maxRightPadding = Math.max(basePadding, mapSize.x - basePadding * 3);
  const maxBottomPadding = Math.max(basePadding, mapSize.y - basePadding * 3);
  const rightPadding = Math.min(rightPanelWidth + basePadding, maxRightPadding);
  const bottomPadding = Math.min(
    bottomPanelHeight + basePadding,
    maxBottomPadding,
  );

  return {
    paddingTopLeft: [basePadding, basePadding],
    paddingBottomRight: [rightPadding, bottomPadding],
  };
};

export const fitResortsInViewport = ({
  map,
  resorts,
  rightPanelWidth = 0,
  bottomPanelHeight = 0,
  labelShowZoom = DESKTOP_LABEL_SHOW_ZOOM,
}: {
  map: L.Map;
  resorts: MapSkiResort[];
  rightPanelWidth?: number;
  bottomPanelHeight?: number;
  labelShowZoom?: number;
}) => {
  if (resorts.length === 0) return;

  const fitPadding = getSafeFitPadding(map, rightPanelWidth, bottomPanelHeight);

  if (resorts.length === 1) {
    const resortLatLng: L.LatLngTuple = [
      resorts[0].latitude,
      resorts[0].longitude,
    ];
    const targetZoom = Math.max(map.getZoom(), labelShowZoom);
    map.setView(
      getPanelAdjustedCenter(
        map,
        resortLatLng,
        rightPanelWidth,
        bottomPanelHeight,
        targetZoom,
      ),
      targetZoom,
      { animate: true },
    );
    return;
  }

  const bounds = L.latLngBounds(
    resorts.map(resort => [resort.latitude, resort.longitude]),
  );

  map.fitBounds(bounds, {
    animate: true,
    ...fitPadding,
  });
};
