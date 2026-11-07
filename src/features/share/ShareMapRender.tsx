"use client";

import type {
  DataDrivenPropertyValueSpecification,
  LngLatBoundsLike,
  Map as MapLibreMap,
} from "maplibre-gl";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ResortFinalizedMap } from "@/features/map/components/ResortFinalizedMap";
import {
  BASE_BACKGROUND_LAYER_ID,
  BASE_RASTER_LAYER_ID,
} from "@/features/map/maplibre/baseStyle";
import { DEFAULT_MAP_DISPLAY_SETTINGS } from "@/features/map/utils/mapDisplaySettings";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import type { MapSkiResort } from "@/types/skiResorts";
import {
  hasShareMap,
  SHARE_FIT_PADDING,
  SHARE_LINE_WIDTH_SCALE,
  SHARE_MAP_SIZES,
  SHARE_PHOTO_OPACITY,
  type ShareMapSize,
} from "./mapCard";

const DynamicMap = dynamic(
  () =>
    import("@/features/map/MapLibreResortMap").then(m => m.MapLibreResortMap),
  { ssr: false },
);
const nothing = () => undefined;
const settings = {
  ...DEFAULT_MAP_DISPLAY_SETTINGS,
  showCourseNames: false,
  showLiftNames: false,
};

type WidthValue = DataDrivenPropertyValueSpecification<number>;

/** ズーム別の線幅式の出力だけを倍にする。zoom の interpolate は最上位に残す。 */
function scaleWidth(value: WidthValue): WidthValue {
  if (typeof value === "number") return value * SHARE_LINE_WIDTH_SCALE;
  if (Array.isArray(value) && value[0] === "interpolate")
    return value.map((item, i) =>
      i >= 4 && i % 2 === 0 ? ["*", SHARE_LINE_WIDTH_SCALE, item] : item,
    ) as WidthValue;
  return value;
}

/** コース・リフトと基準点がすべて入る範囲。 */
function shareBounds(
  resort: MapSkiResort,
  mapData: FinalizedResortMapData | null,
): LngLatBoundsLike | null {
  const points = [
    ...(mapData?.courses?.features ?? []).flatMap(f => f.coordinates),
    ...(mapData?.lifts?.features ?? []).flatMap(f => f.coordinates),
  ];
  if (!points.length) return null;
  points.push([resort.longitude, resort.latitude]);
  const lngs = points.map(p => p[0]);
  const lats = points.map(p => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/** 公開地図と同じ部品を、保存状態・操作ボタンなしで描画する出力用画面。 */
export function ShareMapRender({
  resort,
  mapData,
  size,
}: {
  resort: MapSkiResort;
  mapData: FinalizedResortMapData | null;
  size: ShareMapSize;
}) {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const available = hasShareMap(mapData);
  useEffect(() => {
    if (!map) return;
    const bounds = shareBounds(resort, mapData);
    const scaled = new Map<string, string>();
    let stableSince = 0;
    const timer = setInterval(() => {
      // 地図部品が後から描画設定を入れ直しても、撮影前に必ず薄めた状態へ戻す。
      const photo = map.getLayer(BASE_RASTER_LAYER_ID.photo);
      if (!photo) return;
      if (
        map.getPaintProperty(BASE_RASTER_LAYER_ID.photo, "raster-opacity") !==
        SHARE_PHOTO_OPACITY
      ) {
        stableSince = 0;
        map.setPaintProperty(
          BASE_BACKGROUND_LAYER_ID,
          "background-color",
          "#ffffff",
        );
        map.setPaintProperty(
          BASE_RASTER_LAYER_ID.photo,
          "raster-opacity",
          SHARE_PHOTO_OPACITY,
        );
        return;
      }
      // 地図部品の線幅を入れ直されても、共有用の太さへ戻す。
      let changed = false;
      for (const layer of map.getStyle().layers) {
        if (layer.type !== "line") continue;
        const current = JSON.stringify(
          map.getPaintProperty(layer.id, "line-width") ?? 1,
        );
        if (scaled.get(layer.id) === current) continue;
        const next = scaleWidth(JSON.parse(current));
        map.setPaintProperty(layer.id, "line-width", next);
        scaled.set(layer.id, JSON.stringify(next));
        changed = true;
      }
      // 地図部品の寄せ方より優先し、北向きのまま全体が入る最大まで寄せる。
      const camera = bounds
        ? map.cameraForBounds(bounds, {
            padding: SHARE_FIT_PADDING,
            bearing: 0,
            maxZoom: 17,
          })
        : undefined;
      if (
        camera?.zoom !== undefined &&
        camera.center &&
        !map.isMoving() &&
        (Math.abs(map.getZoom() - camera.zoom) > 0.01 || map.getBearing() !== 0)
      ) {
        map.setMinZoom(Math.min(map.getMinZoom(), camera.zoom));
        map.jumpTo({ center: camera.center, zoom: camera.zoom, bearing: 0 });
        changed = true;
      }
      if (changed) {
        stableSince = 0;
        return;
      }
      // リフトのアニメーション中でもタイル・GeoJSON・viewportの完了を判定する。
      const settled =
        map.areTilesLoaded() &&
        map.getZoom() >= 10 &&
        !map.isMoving() &&
        Object.keys(map.getStyle().sources).every(id =>
          map.isSourceLoaded(id),
        ) &&
        map.queryRenderedFeatures().length > 0;
      if (!settled) stableSince = 0;
      else if (!stableSince) stableSince = Date.now();
      else if (Date.now() - stableSince > 400) setReady(true);
    }, 100);
    return () => clearInterval(timer);
  }, [map, mapData, resort]);
  const dimensions = SHARE_MAP_SIZES[size];
  return (
    <div
      data-share-map-ready={available ? String(ready) : "true"}
      data-share-map="true"
      style={{
        ...dimensions,
        position: "relative",
        overflow: "hidden",
        background: "#ffffff",
      }}
    >
      {available ? (
        <ResortFinalizedMap
          DynamicMap={DynamicMap}
          resortId={resort.id}
          finalizedMapData={mapData}
          mapResorts={[resort]}
          presentation="preview"
          embedded
          showToolbar={false}
          showOpenOnlyControl={false}
          showLocationControl={false}
          courseColorMode="slope"
          mapDisplaySettings={settings}
          mapTileVariant="photo"
          showOpenOnly={false}
          selectedFinalizedFeature={null}
          selectedElevationProfilePoint={null}
          onSelectedFinalizedFeatureChange={nothing}
          onSelectedElevationProfilePointChange={nothing}
          onMapReady={setMap}
        />
      ) : (
        <div
          style={{
            height: "100%",
            display: "grid",
            placeItems: "center",
            color: "#526174",
            fontSize: 24,
          }}
        >
          ゲレンデマップ準備中
        </div>
      )}
      <style>{`.maplibregl-ctrl-attrib, .maplibregl-ctrl-scale, .resort-label-anchor, nextjs-portal { display: none !important; }`}</style>
    </div>
  );
}
