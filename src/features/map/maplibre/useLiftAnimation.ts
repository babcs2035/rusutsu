"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import {
  FINALIZED_LAYER,
  type FinalizedStyleState,
  FLOW_STEP_COUNT,
  getBlinkOpacity,
  getFlowDashFrames,
  getFlowDashLevel,
  getLineOpacity,
  LIFT_FLOW_LAYERS,
} from "./finalizedLayers";

const BLINK_PERIOD_MS = 1200;

/**
 * リフトの動き。
 *
 * どの営業状態でも破線を流して向きを示す。状態は色と濃さで読ませ、
 * 待機中だけは赤く点滅させて注意を引く。
 * 「営業中のみ」のときは運行中だけを流し、ほかは押した瞬間の縞のまま止める。
 * 外すと止めた位置から流れ出す（運行中とそれ以外でコマを別々に数える）。
 * 待機中の点滅も止める。
 * 高速リフト・ゴンドラは速く、低速リフトはゆっくり流す。
 *
 * 縞の長さは整数ズームをまたいだ所でだけ付け直す（getFlowDashLevel）。
 * MapLibre 自身が縞を付け直すのと同じ所なので、操作中もその場で合わせ、
 * 操作が終わった瞬間に縞の長さが飛ばないようにする。
 * コマ送りは操作中は止めて、描画の負荷を上げない。
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
  /** 選択中の沈み込みを点滅で打ち消さないために使う */
  styleState: FinalizedStyleState;
}) => {
  // 縞の段階と、流れるレイヤーごとの現在のコマ。ズームの付け直しとコマ送りで共有する
  const dashRef = useRef({
    level: Number.NaN,
    frames: LIFT_FLOW_LAYERS.map(() => 0),
  });

  useEffect(() => {
    if (!map || !isReady) return;

    // MapLibre は line-dasharray を「前の柄と次の柄のクロスフェード」で補間する。
    // 既定の 300ms のままコマ送りすると、常に 2 つの柄が混ざった状態が描かれ、
    // 塗りの長さが伸び縮みして見える。レイヤー定義でも 0 にしているが、
    // 途中で作り直された地図でも確実に効くようにここでも落とす。
    for (const { id } of LIFT_FLOW_LAYERS) {
      if (!map.getLayer(id)) continue;
      map.setPaintProperty(id, "line-dasharray-transition", {
        duration: 0,
        delay: 0,
      });
    }

    const dash = dashRef.current;
    const syncDash = () => {
      const level = getFlowDashLevel(map.getZoom());
      if (level === dash.level) return;
      dash.level = level;
      const frames = getFlowDashFrames(level);
      LIFT_FLOW_LAYERS.forEach((layer, index) => {
        if (!map.getLayer(layer.id)) return;
        map.setPaintProperty(
          layer.id,
          "line-dasharray",
          frames[dash.frames[index]],
        );
      });
    };
    dash.level = Number.NaN;
    syncDash();
    map.on("zoom", syncDash);
    return () => {
      map.off("zoom", syncDash);
    };
  }, [isReady, map]);

  useEffect(() => {
    if (!map || !isReady || isInteracting || prefersReducedMotion) return;

    const hasStateFilter =
      styleState.selectedFeature !== null || !!styleState.showCommunityPosts;

    // 「営業中のみ」では待機中も止める。点滅で変えた濃さを通常の濃さへ戻す
    const shouldBlink = !styleState.showOpenOnly;
    if (!shouldBlink && map.getLayer(FINALIZED_LAYER.liftBlink)) {
      map.setPaintProperty(
        FINALIZED_LAYER.liftBlink,
        "line-opacity",
        getLineOpacity(styleState, "lift"),
      );
    }

    let raf: number | null = null;
    // 速さごとに独立したコマ送り。速いレイヤーだけ早く進む
    const lastFrameAt = LIFT_FLOW_LAYERS.map(() => 0);
    let lastBlinkAt = 0;
    const dash = dashRef.current;

    const step = (now: number) => {
      raf = window.requestAnimationFrame(step);

      const frames = getFlowDashFrames(dash.level);
      LIFT_FLOW_LAYERS.forEach((layer, index) => {
        // 「営業中のみ」では運行中以外のコマを進めず、その位置で止める
        if (styleState.showOpenOnly && !layer.open) return;
        if (now - lastFrameAt[index] < layer.frameMs) return;
        lastFrameAt[index] = now;
        if (!map.getLayer(layer.id)) return;

        dash.frames[index] = (dash.frames[index] + 1) % FLOW_STEP_COUNT;
        map.setPaintProperty(
          layer.id,
          "line-dasharray",
          frames[dash.frames[index]],
        );
      });

      if (!shouldBlink || now - lastBlinkAt < 55) return;
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

    const syncVisibility = () => {
      if (raf !== null) window.cancelAnimationFrame(raf);
      raf =
        document.visibilityState === "visible"
          ? window.requestAnimationFrame(step)
          : null;
    };
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      if (raf !== null) window.cancelAnimationFrame(raf);
    };
  }, [isInteracting, isReady, map, prefersReducedMotion, styleState]);
};
