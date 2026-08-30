import {
  FALLBACK_LABEL_HEIGHT,
  LABEL_MEASURE_ELEMENT_ATTRIBUTE,
} from "../constants";

/**
 * ラベルの実寸を測る道具。
 *
 * 地図ライブラリには依存しない。ここを leafletIcons.ts に置いたままにすると、
 * ラベル配置を使うだけの MapLibre 側の経路にも Leaflet 本体がバンドルされる。
 */

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

let cachedMeasureContext: CanvasRenderingContext2D | null | undefined;

const getMeasureContext = () => {
  if (cachedMeasureContext !== undefined) return cachedMeasureContext;
  if (typeof document === "undefined") {
    cachedMeasureContext = null;
    return cachedMeasureContext;
  }

  cachedMeasureContext = document.createElement("canvas").getContext("2d");
  return cachedMeasureContext;
};

/**
 * ラベルの実寸幅（px）。文字数 × 固定幅の概算では日本語と英数字が混ざると
 * 衝突判定がずれるため、実際のフォントで測る。
 */
export const measureCanvasTextWidth = (text: string, font: string): number => {
  const context = getMeasureContext();
  if (!context) return text.length * 12;

  context.font = font;
  return Math.ceil(context.measureText(text).width);
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
