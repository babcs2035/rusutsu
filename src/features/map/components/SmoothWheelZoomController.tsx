"use client";

import type L from "leaflet";
import { useEffect } from "react";
import { useMap } from "react-leaflet";
import {
  SMOOTH_WHEEL_ZOOM_EASING,
  SMOOTH_WHEEL_ZOOM_PX_PER_LEVEL,
  SMOOTH_WHEEL_ZOOM_SETTLE_MS,
} from "../constants";
import {
  getMapInternals,
  getWheelDeltaPx,
  getZoomAnchoredCenter,
} from "../utils/leafletInternals";

/**
 * ホイールでの拡大縮小を、Leaflet のピンチズームと同じ経路に載せ替える。
 *
 * Leaflet 標準の scrollWheelZoom は
 * 「40ms 溜める → 1 回の離散ズーム → 250ms アニメ → 全レイヤ再投影」
 * を繰り返すため、どれだけ描画を軽くしても段階的な動きにしかならない。
 *
 * 一方ピンチズームは毎フレーム map._move(..., { pinch: true }) を呼び、
 * タイルもベクタも CSS transform で拡大するだけで再投影せず、
 * 指を離したときに 1 回だけ確定させている。ホイールをこちらに載せると、
 * 拡大縮小が連続的になり、確定も 1 回で済む。
 *
 * 確定時にズーム段へ丸めることはしない。ホイールを止めた瞬間に
 * ズームが動くと「勝手に変わった」という違和感になるため、
 * 止めた位置のまま確定させて再投影だけを行う。
 */
export const SmoothWheelZoomController = ({
  enabled,
  onUserMapZoomInteraction,
}: {
  enabled: boolean;
  onUserMapZoomInteraction?: () => void;
}) => {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;

    const internals = getMapInternals(map);
    const container = map.getContainer();
    const wasWheelZoomEnabled = map.scrollWheelZoom.enabled();
    map.scrollWheelZoom.disable();

    let targetZoom = map.getZoom();
    let anchor: L.Point = map.getSize().divideBy(2);
    let frame: number | null = null;
    let lastWheelAt = 0;
    let isZooming = false;

    const stopFrame = () => {
      if (frame === null) return;
      window.cancelAnimationFrame(frame);
      frame = null;
    };

    /**
     * ズームを確定させる。
     *
     * Leaflet の _resetView は viewprereset を投げ、タイルレイヤが
     * _invalidateAll ですべてのタイルを DOM から取り除く。
     * そのため確定のたびに地図が一瞬白くなる。ここでは同じ結果を
     * タイルを消さない手順で組み立てる:
     *   _move     … 最終ズームを反映（タイルは通常どおり差分更新される）
     *   viewreset … ベクタとオーバーレイを再投影させる
     *   _moveEnd  … zoomend / moveend を発火させる
     *
     * zoomSnap による丸めもしない。ホイールを止めた瞬間にズームが動くと
     * 「勝手に変わった」という違和感になるため、止めた位置のまま確定する。
     */
    const settleAt = (zoom: number) => {
      const finalZoom = Math.max(
        map.getMinZoom(),
        Math.min(map.getMaxZoom(), zoom),
      );
      internals._move(map.getCenter(), finalZoom);
      map.fire("viewreset");
      internals._moveEnd(true);
    };

    const finish = () => {
      stopFrame();
      if (!isZooming) return;

      isZooming = false;
      settleAt(targetZoom);
      onUserMapZoomInteraction?.();
    };

    const step = () => {
      frame = null;
      const currentZoom = map.getZoom();
      const remaining = targetZoom - currentZoom;
      const isSettled = Math.abs(remaining) < 0.004;

      if (isSettled) {
        if (Date.now() - lastWheelAt > SMOOTH_WHEEL_ZOOM_SETTLE_MS) {
          finish();
          return;
        }
        frame = window.requestAnimationFrame(step);
        return;
      }

      const nextZoom = currentZoom + remaining * SMOOTH_WHEEL_ZOOM_EASING;
      internals._move(getZoomAnchoredCenter(map, anchor, nextZoom), nextZoom, {
        pinch: true,
        round: false,
      });
      frame = window.requestAnimationFrame(step);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      if (internals._animatingZoom) return;

      const delta = -getWheelDeltaPx(event) / SMOOTH_WHEEL_ZOOM_PX_PER_LEVEL;
      if (delta === 0) return;

      if (!isZooming) {
        isZooming = true;
        targetZoom = map.getZoom();
      }
      anchor = map.mouseEventToContainerPoint(event);
      targetZoom = Math.max(
        map.getMinZoom(),
        Math.min(map.getMaxZoom(), targetZoom + delta),
      );
      lastWheelAt = Date.now();

      if (frame === null) {
        frame = window.requestAnimationFrame(step);
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      stopFrame();
      if (isZooming) {
        isZooming = false;
        settleAt(targetZoom);
      }
      if (wasWheelZoomEnabled) {
        map.scrollWheelZoom.enable();
      }
    };
  }, [enabled, map, onUserMapZoomInteraction]);

  return null;
};
