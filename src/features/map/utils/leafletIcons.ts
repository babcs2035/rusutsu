import L from "leaflet";
import { SELECTED_MARKER_RING_WIDTH } from "../constants";
import { escapeHtml } from "./labelMeasure";

/**
 * Leaflet の divIcon を組み立てる。
 *
 * ラベルの実寸を測る関数は labelMeasure.ts に置いてある。MapLibre 側からも
 * 使うので、Leaflet 本体を巻き込まないように分けている。
 */

export const createNameLabelIcon = (
  name: string,
  width: number,
  height: number,
  isSelected: boolean,
  isDimmed: boolean,
) =>
  L.divIcon({
    className: "resort-name-label-icon",
    html: `<div class="resort-name-label${isSelected ? " is-selected" : ""}${isDimmed ? " is-dimmed" : ""}" style="width:${width}px">${escapeHtml(name)}</div>`,
    iconSize: [width, height],
    iconAnchor: [0, 0],
  });

export const createResortPointIcon = ({
  radius,
  isSelected,
  isFilterMatch,
  isDimmed,
}: {
  radius: number;
  isSelected: boolean;
  isFilterMatch: boolean;
  isDimmed: boolean;
}) => {
  const selectedRingWidth = isSelected ? SELECTED_MARKER_RING_WIDTH : 0;
  const size = radius * 2;
  const iconSize = size + selectedRingWidth * 2;
  const markerStyle = [
    `width:${size}px`,
    `height:${size}px`,
    selectedRingWidth > 0
      ? `margin:${selectedRingWidth}px;--selected-ring-width:${selectedRingWidth}px`
      : "",
  ]
    .filter(Boolean)
    .join(";");

  return L.divIcon({
    className: "resort-point-marker-icon",
    html: `<div class="resort-point-marker${isSelected ? " is-selected" : ""}${isFilterMatch ? " is-filter-match" : ""}${isDimmed ? " is-dimmed" : ""}" style="${markerStyle}"></div>`,
    iconSize: [iconSize, iconSize],
    iconAnchor: [iconSize / 2, iconSize / 2],
  });
};
