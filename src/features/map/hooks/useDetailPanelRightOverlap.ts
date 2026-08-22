"use client";

import { type RefObject, useEffect, useState } from "react";
import { DETAIL_PANEL_ATTRIBUTE } from "../constants";

/**
 * 詳細パネルが地図の右側にどれだけ被っているかを px で返す。
 *
 * デスクトップでは地図コンテナがパネルの下まで伸びているため、
 * 右下に置いたコントロールがパネルの裏に隠れてしまう。その分だけ
 * 内側にずらすために使う。
 */
export const useDetailPanelRightOverlap = (
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) => {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setOverlap(0);
      return;
    }

    const measure = () => {
      const container = containerRef.current;
      if (!container) return;

      const panel = document.querySelector<HTMLElement>(
        `[${DETAIL_PANEL_ATTRIBUTE}="true"]`,
      );
      if (!panel) {
        setOverlap(0);
        return;
      }

      const mapRect = container.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const overlapsVertically =
        panelRect.bottom > mapRect.top && panelRect.top < mapRect.bottom;
      if (!overlapsVertically || panelRect.width >= mapRect.width) {
        setOverlap(0);
        return;
      }

      const overlapRight =
        mapRect.right - Math.max(mapRect.left, panelRect.left);
      setOverlap(Math.max(0, Math.min(mapRect.width, overlapRight)));
    };

    measure();
    // パネルはトランジションで開くので、少し遅らせて測り直す
    const frame = window.requestAnimationFrame(measure);
    const timer = window.setTimeout(measure, 320);
    window.addEventListener("resize", measure);

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    if (containerRef.current) observer?.observe(containerRef.current);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [containerRef, enabled]);

  return overlap;
};
