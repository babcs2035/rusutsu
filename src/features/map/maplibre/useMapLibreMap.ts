"use client";

import { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import {
  GSI_TILE_MAX_ZOOM,
  GSI_TILE_MIN_ZOOM,
  INITIAL_CENTER,
} from "../constants";
import type { MapTileVariant } from "../types";
import { registerArrowIcon } from "./arrowIcon";
import { createBaseStyle, type RasterTone } from "./baseStyle";
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
// ワーカー URL の設定。import した時点で副作用として走る
import "./mapWorker";

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
  initialTone,
  hitWidth,
  isInteractive,
  initialViewport,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  initialZoom: number;
  tileVariant: MapTileVariant;
  /** 1 フレーム目から正しい色味で描くために、生成時の色味を受け取る */
  initialTone: RasterTone;
  hitWidth: number;
  isInteractive: boolean;
  /** 生成直後に描く位置。日本全体から寄っていく動きを見せないために使う */
  initialViewport?: { center: [number, number]; zoom: number } | null;
}) => {
  const mapRef = useRef<MapLibreMap | null>(null);
  const [isReady, setIsReady] = useState(false);
  const initialStateRef = useRef({
    initialZoom,
    tileVariant,
    initialTone,
    hitWidth,
    initialViewport,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const {
      initialZoom: zoom,
      tileVariant: variant,
      initialTone: tone,
      initialViewport: viewport,
    } = initialStateRef.current;
    const map = new MapLibreMap({
      container,
      style: createBaseStyle(variant, tone),
      center: viewport?.center ?? [INITIAL_CENTER[1], INITIAL_CENTER[0]],
      zoom: viewport?.zoom ?? zoom,
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
          // 斜度モードのコースは頂点ごとの細片に分かれている。既定の簡略化
          // （tolerance 0.375）だと、縮小したときに細片がタイル化の段階で
          // 丸ごと捨てられ、色が消えて白いケーシングだけが残る。
          tolerance: 0,
          // リフトの流れる破線は「線に沿った距離」で位置が決まるが、その距離は
          // タイルごとに 0 から数え直される。既定（maxzoom 18）だと拡大時の
          // タイルは 1 枚 600m ほどしかなく、1 本のリフトが何度も切られて、
          // 継ぎ目の塗りだけが伸び縮みして見える。粗くタイル化して継ぎ目を
          // 減らす。これはデータの刻み方の設定で、地図の拡大上限
          // （maxZoom）とは別物。日本の緯度なら z14 は 1 枚およそ 2km、
          // タイル内の座標は 8192 分割なので丸めは約 0.25m。
          // 最大ズームでも 0.5px ほどなので、見た目には出ない。
          ...(sourceId === FINALIZED_SOURCE.lifts ? { maxzoom: 14 } : {}),
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
