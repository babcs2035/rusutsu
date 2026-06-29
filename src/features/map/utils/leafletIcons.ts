import L from "leaflet";
import {
  FALLBACK_LABEL_HEIGHT,
  LABEL_MEASURE_ELEMENT_ATTRIBUTE,
  SELECTED_MARKER_RING_WIDTH,
} from "../constants";

let cachedLabelMeasureElement: HTMLDivElement | undefined;

const cleanupLabelMeasureElement = () => {
  if (cachedLabelMeasureElement?.parentNode) {
    cachedLabelMeasureElement.parentNode.removeChild(cachedLabelMeasureElement);
  }
  cachedLabelMeasureElement = undefined;
};
const cleanupOrphanedLabelMeasureElements = () => {
  if (typeof document === "undefined") {
    return;
  }
  document
    .querySelectorAll<HTMLDivElement>(
      `div[${LABEL_MEASURE_ELEMENT_ATTRIBUTE}="true"]`,
    )
    .forEach(element => {
      if (element !== cachedLabelMeasureElement) {
        element.remove();
      }
    });
};

export const getScaledMapLineWidth = (
  zoom: number,
  kind: "course" | "lift" | "ungroomedCourse" | "liftFlow",
) => {
  const t = Math.max(0, Math.min(1, (zoom - 10) / 7));
  if (kind === "course") return 0.4 + t * 2.0;
  if (kind === "ungroomedCourse") return 0.4 + t * 2.0;
  if (kind === "lift") return 1.0 + t * 2.0;
  return 1.6 + t * 2.8;
};

export const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const getLabelMeasureElement = () => {
  if (typeof window === "undefined") {
    return undefined;
  }

  if (cachedLabelMeasureElement?.isConnected) {
    return cachedLabelMeasureElement;
  }

  if (cachedLabelMeasureElement && !cachedLabelMeasureElement.isConnected) {
    cleanupLabelMeasureElement();
  }
  cleanupOrphanedLabelMeasureElements();

  const probe = document.createElement("div");
  probe.className = "resort-name-label";
  probe.setAttribute(LABEL_MEASURE_ELEMENT_ATTRIBUTE, "true");
  probe.style.position = "absolute";
  probe.style.left = "-100000px";
  probe.style.top = "-100000px";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.whiteSpace = "nowrap";
  probe.style.width = "fit-content";

  document.body.appendChild(probe);
  cachedLabelMeasureElement = probe;
  return probe;
};

export const measureTextWidth = (text: string): number => {
  const probe = getLabelMeasureElement();
  if (!probe) return text.length * 8;
  probe.textContent = text;
  return Math.ceil(probe.getBoundingClientRect().width);
};

export const measureLabelHeight = (): number => {
  const probe = getLabelMeasureElement();
  if (!probe) {
    return FALLBACK_LABEL_HEIGHT;
  }

  probe.textContent = "Hg";
  const measuredHeight = Math.ceil(probe.getBoundingClientRect().height);
  return measuredHeight > 0 ? measuredHeight : FALLBACK_LABEL_HEIGHT;
};

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
