"use client";

import { LoaderCircle, LocateFixed, X } from "lucide-react";
import { type Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useMemo, useState } from "react";
import type { MapSkiResort } from "@/types/skiResorts";
import { useMapSession } from "../session/MapSessionProvider";
import { distanceKm } from "../utils/distance";

export function MapLocationControl({
  map,
  resorts,
  interactive,
  expanded,
}: {
  map: MapLibreMap | null;
  resorts: MapSkiResort[];
  interactive: boolean;
  expanded: boolean;
}) {
  const location = useMapSession();
  const position = location?.position;
  const [centerPending, setCenterPending] = useState(false);
  const [showNearby, setShowNearby] = useState(false);
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
  const nearby = useMemo(
    () =>
      position
        ? resorts
            .map(resort => ({ resort, distance: distanceKm(position, resort) }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 5)
        : [],
    [position, resorts],
  );
  if (!location || !interactive) return null;
  return (
    <div
      className={`absolute right-3 ${expanded ? "top-16" : "top-3"} z-[760] flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-2`}
    >
      <div className="flex gap-2">
        {position && (
          <button
            type="button"
            className="h-11 rounded-md border bg-white px-3 text-sm shadow-sm"
            onClick={() => setShowNearby(value => !value)}
            aria-expanded={showNearby}
          >
            近くのスキー場
          </button>
        )}
        <button
          type="button"
          aria-label="現在地を表示"
          disabled={location.loading}
          onClick={() => {
            setCenterPending(true);
            location.request();
          }}
          className="flex h-11 w-11 items-center justify-center rounded-md border bg-white text-blue-600 shadow-sm disabled:opacity-60"
        >
          {location.loading ? (
            <LoaderCircle size={20} className="animate-spin" />
          ) : (
            <LocateFixed size={20} />
          )}
        </button>
        {location.enabled && (
          <button
            type="button"
            aria-label="現在地の取得を停止"
            className="flex h-11 w-11 items-center justify-center rounded-md border bg-white shadow-sm"
            onClick={() => {
              location.stop();
              setCenterPending(false);
              setShowNearby(false);
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>
      {location.error && (
        <p
          role="status"
          className="max-w-72 rounded-md border bg-white p-3 text-sm shadow-sm"
        >
          {location.error}
        </p>
      )}
      {showNearby && position && (
        <div className="max-h-60 w-64 max-w-full overflow-y-auto rounded-md border bg-white p-2 shadow-md">
          <p className="px-2 py-1 text-xs text-gray-500">
            現在地からの直線距離順
          </p>
          {nearby.map(({ resort, distance }) => (
            <button
              type="button"
              key={resort.id}
              onClick={() => {
                setShowNearby(false);
                location.selectResort(resort.id);
              }}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded px-2 text-left text-sm hover:bg-gray-100"
            >
              <span>{resort.nameJa}</span>
              <span className="shrink-0 text-xs text-gray-500">
                {distance.toFixed(1)} km
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
