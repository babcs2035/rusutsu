"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect } from "react";
import {
  FINALIZED_LAYER,
  type FinalizedStyleState,
  FLOW_DASH_FRAMES,
  getBlinkOpacity,
  LIFT_FLOW_LAYERS,
} from "./finalizedLayers";

const BLINK_PERIOD_MS = 1200;

/**
 * リフトの動き。
 *
 * どの営業状態でも破線を流して向きを示す。状態は色と濃さで読ませ、
 * 待機中だけは赤く点滅させて注意を引く。
 * 高速リフト・ゴンドラは速く、低速リフトはゆっくり流す。
 * 地図を操作している間は止めて、描画の負荷を上げない。
 */
export const useLiftAnimation = ({
  map,
  isReady,
  isInteracting,
  prefersReducedMotion,
  styleState,
}: {
  map: MapLibreMap | null;
  isReady: boolean;
  isInteracting: boolean;
  prefersReducedMotion: boolean;
  /** 「営業中のみ」や選択中の沈み込みを点滅で打ち消さないために使う */
  styleState: FinalizedStyleState;
}) => {
  useEffect(() => {
    if (!map || !isReady || isInteracting || prefersReducedMotion) return;

    const hasStateFilter =
      styleState.showOpenOnly || styleState.selectedFeature !== null;

    // MapLibre は line-dasharray を「前の柄と次の柄のクロスフェード」で補間する。
    // 既定の 300ms のままコマ送りすると、常に 2 つの柄が混ざった状態が描かれ、
    // 塗りの長さが伸び縮みして見える。レイヤー定義でも 0 にしているが、
    // 途中で作り直された地図でも確実に効くようにここでも落とす。
    for (const layer of LIFT_FLOW_LAYERS) {
      if (!map.getLayer(layer.id)) continue;
      map.setPaintProperty(layer.id, "line-dasharray-transition", {
        duration: 0,
        delay: 0,
      });
    }

    let raf: number | null = null;
    // 速さごとに独立したコマ送り。速いレイヤーだけ早く進む
    const flowState = LIFT_FLOW_LAYERS.map(layer => ({
      layer,
      frame: 0,
      lastFrameAt: 0,
    }));
    let lastBlinkAt = 0;

    const step = (now: number) => {
      raf = window.requestAnimationFrame(step);

      for (const state of flowState) {
        if (now - state.lastFrameAt < state.layer.frameMs) continue;
        state.lastFrameAt = now;
        if (!map.getLayer(state.layer.id)) continue;

        state.frame = (state.frame + 1) % FLOW_DASH_FRAMES.length;
        map.setPaintProperty(
          state.layer.id,
          "line-dasharray",
          FLOW_DASH_FRAMES[state.frame],
        );
      }

      if (now - lastBlinkAt < 55) return;
      lastBlinkAt = now;
      if (map.getLayer(FINALIZED_LAYER.liftBlink)) {
        const phase = (now % BLINK_PERIOD_MS) / BLINK_PERIOD_MS;
        const blink = 0.22 + 0.78 * (0.5 + 0.5 * Math.cos(phase * Math.PI * 2));
        map.setPaintProperty(
          FINALIZED_LAYER.liftBlink,
          "line-opacity",
          // 沈み込みが効いていないときは、式を組み立てず素の数値で渡す
          hasStateFilter ? getBlinkOpacity(styleState, blink) : blink,
        );
      }
    };

    raf = window.requestAnimationFrame(step);
    return () => {
      if (raf !== null) window.cancelAnimationFrame(raf);
    };
  }, [isInteracting, isReady, map, prefersReducedMotion, styleState]);
};
