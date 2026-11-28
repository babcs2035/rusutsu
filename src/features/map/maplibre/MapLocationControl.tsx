"use client";

import { LoaderCircle, LocateFixed } from "lucide-react";
import { type Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { useMapSession } from "../session/MapSessionProvider";

export function MapLocationControl({
  map,
  interactive,
  expanded,
  rightOffset = 0,
}: {
  map: MapLibreMap | null;
  interactive: boolean;
  expanded: boolean;
  /** 詳細パネルが地図の右側に被っている幅（px） */
  rightOffset?: number;
}) {
  const location = useMapSession();
  const position = location?.position;
  const [centerPending, setCenterPending] = useState(false);
  // 許可されていない状態で押し直し、また拒否されたときだけ一瞬知らせる
  const retryFrom = useRef<number | null>(null);
  const [deniedNotice, setDeniedNotice] = useState(false);
  const deniedAt = location?.deniedAt ?? 0;
  useEffect(() => {
    if (retryFrom.current === null || deniedAt <= retryFrom.current) return;
    retryFrom.current = null;
    setDeniedNotice(true);
    const timer = setTimeout(() => setDeniedNotice(false), 2500);
    return () => clearTimeout(timer);
  }, [deniedAt]);
  useEffect(() => {
    if (!map || !position) return;
    const element = document.createElement("div");
    element.className =
      "h-4 w-4 rounded-full border-[3px] border-white bg-blue-600 shadow-md";
    element.setAttribute("aria-label", "現在地");
    element.setAttribute("role", "img");
    element.style.pointerEvents = "none";
    const marker = new Marker({ element })
      .setLngLat([position.longitude, position.latitude])
      .addTo(map);
    const source = "user-location-accuracy";
    map.addSource(source, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Point",
          coordinates: [position.longitude, position.latitude],
        },
      },
    });
    const radius =
      position.accuracy /
      (78271.484 *
        Math.max(0.0001, Math.cos((position.latitude * Math.PI) / 180)));
    map.addLayer({
      id: source,
      type: "circle",
      source,
      paint: {
        "circle-color": "#2563eb",
        "circle-opacity": 0.12,
        "circle-stroke-color": "#2563eb",
        "circle-stroke-opacity": 0.4,
        "circle-stroke-width": 1,
        "circle-radius": [
          "interpolate",
          ["exponential", 2],
          ["zoom"],
          0,
          radius,
          22,
          radius * 2 ** 22,
        ],
      },
    });
    return () => {
      marker.remove();
      if (map.getLayer(source)) map.removeLayer(source);
      if (map.getSource(source)) map.removeSource(source);
    };
  }, [map, position]);
  useEffect(() => {
    if (!centerPending || !map || !position) return;
    map.jumpTo({
      center: [position.longitude, position.latitude],
      zoom: Math.max(map.getZoom(), 13),
    });
    setCenterPending(false);
  }, [centerPending, map, position]);
  if (!location || !interactive) return null;
  return (
    <div
      style={{ right: `${rightOffset + 12}px` }}
      className={`absolute ${expanded ? "top-16" : "top-[calc(var(--mobile-map-top-offset,0px)+0.75rem)]"} z-[760] flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-2`}
    >
      <div className="flex gap-2">
        <button
          type="button"
          aria-label={
            location.unavailable
              ? "現在地を表示（位置情報が許可されていません）"
              : "現在地を表示"
          }
          title={
            location.unavailable ? "位置情報が許可されていません" : undefined
          }
          disabled={location.loading}
          onClick={() => {
            retryFrom.current = location.unavailable ? location.deniedAt : null;
            setDeniedNotice(false);
            setCenterPending(true);
            location.request();
          }}
          className={`flex h-11 w-11 items-center justify-center rounded-xl bg-white text-blue-600 ring-1 ring-border disabled:opacity-60 ${location.unavailable ? "opacity-40" : ""}`}
        >
          {location.loading ? (
            <LoaderCircle size={20} className="animate-spin" />
          ) : (
            <LocateFixed size={20} />
          )}
        </button>
      </div>
      {deniedNotice && (
        <p
          role="status"
          className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-border"
        >
          位置情報が許可されていません
        </p>
      )}
    </div>
  );
}
