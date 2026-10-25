"use client";

import { Map as MapLibreMap, Marker, NavigationControl } from "maplibre-gl";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

export function CommunityPinMap({
  center,
  coordinates,
  onChange,
  interactive = true,
}: {
  center: [number, number];
  coordinates: [number, number] | null;
  onChange: (lng: number, lat: number) => void;
  interactive?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<MapLibreMap | null>(null),
    marker = useRef<Marker | null>(null),
    onUpdate = useRef(onChange);
  onUpdate.current = onChange;
  useEffect(() => {
    if (!host.current) return;
    const m = new MapLibreMap({
      container: host.current,
      center,
      zoom: 12,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "Tiles © Esri",
          },
        },
        layers: [{ id: "satellite", type: "raster", source: "satellite" }],
      },
      attributionControl: false,
    });
    map.current = m;
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.on("click", (e: { lngLat: { lng: number; lat: number } }) => {
      if (interactive) onUpdate.current(e.lngLat.lng, e.lngLat.lat);
    });
    return () => {
      marker.current?.remove();
      marker.current = null;
      m.remove();
      map.current = null;
    };
  }, [center, interactive]);
  useEffect(() => {
    const m = map.current;
    if (!m || !coordinates) return;
    if (!marker.current)
      marker.current = new Marker({ color: "#0284c7" })
        .setLngLat(coordinates)
        .addTo(m);
    else marker.current.setLngLat(coordinates);
    m.easeTo({ center: coordinates, duration: 250 });
  }, [coordinates]);
  return (
    <div
      ref={host}
      className="h-full min-h-40 w-full"
      role="application"
      aria-label="地図上で投稿場所を指定"
    />
  );
}
