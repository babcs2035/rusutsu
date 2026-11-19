"use client";

import { type RefObject, useEffect, useState } from "react";
import { DETAIL_PANEL_ATTRIBUTE } from "../constants";

/**
 * 詳細パネルが地図の右側にどれだけ被っているかを px で返す。
 *
 * デスクトップでは地図コンテナがパネルの下まで伸びているため、
 * 右側に置いたコントロールがパネルの裏に隠れてしまう。その分だけ
 * 内側にずらすために使う。
 *
 * パネルは読み込み中→本体などで別要素に差し替わる（body 直下の Portal）。
 * 最初に見つけた要素だけを追うと差し替え後に測り直せないので、
 * body 直下の増減を見て毎回探し直す。
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

    const findPanels = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          `[${DETAIL_PANEL_ATTRIBUTE}="true"]`,
        ),
      );

    const measure = () => {
      const container = containerRef.current;
      if (!container) return;
      const mapRect = container.getBoundingClientRect();
      let next = 0;
      for (const panel of findPanels()) {
        const panelRect = panel.getBoundingClientRect();
        if (panelRect.width === 0 || panelRect.height === 0) continue;
        const overlapsVertically =
          panelRect.bottom > mapRect.top && panelRect.top < mapRect.bottom;
        if (!overlapsVertically || panelRect.width >= mapRect.width) continue;
        const overlapRight =
          mapRect.right - Math.max(mapRect.left, panelRect.left);
        next = Math.max(next, Math.min(mapRect.width, overlapRight));
      }
      setOverlap(Math.max(0, next));
    };

    const timers = new Set<number>();
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
      // パネルはトランジションで開くので、少し遅らせて測り直す
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        measure();
      }, 320);
      timers.add(timer);
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    const observePanels = () => {
      resizeObserver?.disconnect();
      if (containerRef.current) resizeObserver?.observe(containerRef.current);
      for (const panel of findPanels()) resizeObserver?.observe(panel);
    };

    const mutationObserver = new MutationObserver(() => {
      observePanels();
      schedule();
    });
    mutationObserver.observe(document.body, { childList: true });

    observePanels();
    measure();
    schedule();
    window.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(frame);
      for (const timer of timers) window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
    };
  }, [containerRef, enabled]);

  return overlap;
};
