"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";

/** 通信完了を待つ idle ではなく、WebGL の喪失と描画イベントで復帰を判定する。 */
export function useMapRecovery(
  map: MapLibreMap | null,
  onRecover: () => void,
  onAutoRecover: () => boolean,
) {
  const [failed, setFailed] = useState(false);
  const resizeFrame = useRef<number | null>(null);
  const retry = useCallback(() => {
    // 現在のカメラを保存してから地図だけ再生成する。
    map?.fire("moveend");
    onRecover();
  }, [map, onRecover]);
  useEffect(() => {
    if (!map) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const rendered = () => {
      clearTimeout(timer);
      setFailed(false);
    };
    const recoverOrOfferRetry = () => {
      if (document.visibilityState !== "visible") return;
      map.fire("moveend");
      if (!onAutoRecover()) setFailed(true);
    };
    const lost = () => {
      clearTimeout(timer);
      timer = setTimeout(recoverOrOfferRetry, 4000);
    };
    const resume = () => {
      if (document.visibilityState !== "visible") {
        map.stop();
        clearTimeout(timer);
        return;
      }
      if (resizeFrame.current !== null)
        cancelAnimationFrame(resizeFrame.current);
      resizeFrame.current = requestAnimationFrame(() => {
        // resize の副作用で既存のコース fit が走っても、見ていた位置へ戻す。
        const center = map.getCenter();
        const zoom = map.getZoom();
        const bearing = map.getBearing();
        map.stop();
        map.resize();
        map.jumpTo({ center, zoom, bearing });
        map.triggerRepaint();
        clearTimeout(timer);
        timer = setTimeout(recoverOrOfferRetry, 4000);
      });
    };
    map.on("webglcontextlost", lost);
    map.on("webglcontextrestored", resume);
    map.on("render", rendered);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    return () => {
      clearTimeout(timer);
      if (resizeFrame.current !== null)
        cancelAnimationFrame(resizeFrame.current);
      map.off("webglcontextlost", lost);
      map.off("webglcontextrestored", resume);
      map.off("render", rendered);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
    };
  }, [map, onAutoRecover]);
  return { failed, retry };
}
