"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ResortFinalizedMap } from "@/features/map/components/ResortFinalizedMap";
import { MapScaleSlot } from "@/features/map/maplibre/MapScaleSlot";
import { DEFAULT_MAP_DISPLAY_SETTINGS } from "@/features/map/utils/mapDisplaySettings";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import type { MapSkiResort } from "@/types/skiResorts";
import { hasShareMap, SHARE_MAP_SIZES, type ShareMapSize } from "./mapCard";

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
    let stableSince = 0;
    const timer = setInterval(() => {
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
  }, [map]);
  const dimensions = SHARE_MAP_SIZES[size];
  return (
    <div
      data-share-map-ready={available ? String(ready) : "true"}
      data-share-map="true"
      style={{
        ...dimensions,
        position: "relative",
        overflow: "hidden",
        background: "#e5eaf0",
      }}
    >
      {available ? (
        <>
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
          <div style={{ position: "absolute", bottom: 10, right: 14 }}>
            <MapScaleSlot map={map} />
          </div>
        </>
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
      <style>{`.maplibregl-ctrl-attrib, nextjs-portal { display: none !important; }`}</style>
    </div>
  );
}
