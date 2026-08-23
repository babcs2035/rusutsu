"use client";

import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import {
  BASE_PATH,
  GSI_TILE_MAX_ZOOM,
  GSI_TILE_MIN_ZOOM,
  INITIAL_CENTER,
} from "../constants";
import type { MapTileVariant } from "../types";
import { registerArrowIcon } from "./arrowIcon";
import { createBaseStyle } from "./baseStyle";
import {
  createFinalizedLayers,
  EMPTY_STYLE_STATE,
  FINALIZED_SOURCE,
} from "./finalizedLayers";
import {
  createResortPointLayers,
  EMPTY_RESORT_POINTS,
  RESORT_POINT_SOURCE,
} from "./resortPointLayers";
import { EMPTY_LINE_COLLECTION } from "./sources";

/**
 * ワーカーの場所を教える。
 *
 * MapLibre は import.meta.url からワーカーの URL を組み立てるが、
 * Next.js のバンドル後はそれが http(s) にならず空文字になる。そのまま動かすと
 * HTML をワーカーとして読み込もうとして GeoJSON のタイル化が始まらず、
 * コースもリフトも一本も描かれない。実体は scripts/copyMaplibreWorker.mjs が
 * public/maplibre へ複製している。
 */
setWorkerUrl(`${BASE_PATH}/maplibre/maplibre-gl-worker.mjs`);

/**
 * 地図インスタンスを 1 つ作って使い回す。
 *
 * スタイル・ソース・レイヤーは load 後に一度だけ組み立て、
 * 以降は setData と setPaintProperty で差分更新する。
 * 作り直すとタイルの読み直しが走って画面が白くなるため。
 */
export const useMapLibreMap = ({
  containerRef,
  initialZoom,
  tileVariant,
  hitWidth,
  isInteractive,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  initialZoom: number;
  tileVariant: MapTileVariant;
  hitWidth: number;
  isInteractive: boolean;
}) => {
  const mapRef = useRef<MapLibreMap | null>(null);
  const [isReady, setIsReady] = useState(false);
  const initialStateRef = useRef({ initialZoom, tileVariant, hitWidth });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const { initialZoom: zoom, tileVariant: variant } = initialStateRef.current;
    const map = new MapLibreMap({
      container,
      style: createBaseStyle(variant),
      center: [INITIAL_CENTER[1], INITIAL_CENTER[0]],
      zoom,
      minZoom: GSI_TILE_MIN_ZOOM,
      maxZoom: GSI_TILE_MAX_ZOOM,
      attributionControl: { compact: true },
      // 回転はスキー場詳細画面だけで使うので、既定では切っておく
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      // 端末のピクセル密度をそのまま使うと、モバイルで描画負荷が上がりすぎる
      maxPitch: 0,
    });
    mapRef.current = map;

    map.on("load", () => {
      registerArrowIcon(map);
      map.addSource(RESORT_POINT_SOURCE, {
        type: "geojson",
        data: EMPTY_RESORT_POINTS,
      });
      for (const sourceId of Object.values(FINALIZED_SOURCE)) {
        if (map.getSource(sourceId)) continue;
        map.addSource(sourceId, {
          type: "geojson",
          data: EMPTY_LINE_COLLECTION,
        });
      }
      const layers = [
        ...createFinalizedLayers(
          EMPTY_STYLE_STATE,
          initialStateRef.current.hitWidth,
        ),
        ...createResortPointLayers(
          initialStateRef.current.tileVariant,
          initialStateRef.current.hitWidth,
        ),
      ];
      for (const layer of layers) {
        if (map.getLayer(layer.id)) continue;
        map.addLayer(layer);
      }
      setIsReady(true);
    });

    return () => {
      setIsReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, [containerRef]);

  // プレビュー表示では操作を受け付けない
  // biome-ignore lint/correctness/useExhaustiveDependencies: mapRef は参照なので、地図ができたことは isReady で知る
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handlers = [
      map.dragPan,
      map.scrollZoom,
      map.boxZoom,
      map.doubleClickZoom,
      map.keyboard,
      map.touchZoomRotate,
    ];
    for (const handler of handlers) {
      if (isInteractive) handler.enable();
      else handler.disable();
    }
  }, [isInteractive, isReady]);

  return { map: mapRef.current, isReady };
};
