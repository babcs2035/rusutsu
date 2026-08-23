"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect } from "react";
import { FINALIZED_LAYER } from "./finalizedLayers";

/** 運行中のリフトの「流れる破線」のコマ */
const FLOW_DASH_FRAMES: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

const FLOW_FRAME_MS = 55;
const BLINK_PERIOD_MS = 1200;

/**
 * リフトの動き。
 *
 * 運行中は破線を流して方向と稼働を示し、一部運休は赤く点滅させる。
 * 「動き = 稼働中」という符号を保ちつつ、注意も引けるようにしている。
 * 地図を操作している間は止めて、描画の負荷を上げない。
 */
export const useLiftAnimation = ({
  map,
  isReady,
  isInteracting,
  prefersReducedMotion,
}: {
  map: MapLibreMap | null;
  isReady: boolean;
  isInteracting: boolean;
  prefersReducedMotion: boolean;
}) => {
  useEffect(() => {
    if (!map || !isReady || isInteracting || prefersReducedMotion) return;

    let frame = 0;
    let raf: number | null = null;
    let lastFrameAt = 0;

    const step = (now: number) => {
      raf = window.requestAnimationFrame(step);
      if (now - lastFrameAt < FLOW_FRAME_MS) return;
      lastFrameAt = now;

      if (map.getLayer(FINALIZED_LAYER.liftFlow)) {
        frame = (frame + 1) % FLOW_DASH_FRAMES.length;
        map.setPaintProperty(
          FINALIZED_LAYER.liftFlow,
          "line-dasharray",
          FLOW_DASH_FRAMES[frame],
        );
      }
      if (map.getLayer(FINALIZED_LAYER.liftBlink)) {
        const phase = (now % BLINK_PERIOD_MS) / BLINK_PERIOD_MS;
        map.setPaintProperty(
          FINALIZED_LAYER.liftBlink,
          "line-opacity",
          0.22 + 0.78 * (0.5 + 0.5 * Math.cos(phase * Math.PI * 2)),
        );
      }
    };

    raf = window.requestAnimationFrame(step);
    return () => {
      if (raf !== null) window.cancelAnimationFrame(raf);
    };
  }, [isInteracting, isReady, map, prefersReducedMotion]);
};
