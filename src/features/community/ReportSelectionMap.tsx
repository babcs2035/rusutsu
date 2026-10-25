"use client";

import type { Feature, FeatureCollection, LineString } from "geojson";
import {
  AttributionControl,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
} from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBaseStyle, getRasterTone } from "../map/maplibre/baseStyle";
import type { CommunityMapData, ReportEntryDraft } from "./contract";
import { nearestCourseId } from "./location";
import "../map/maplibre/mapWorker";
import "maplibre-gl/dist/maplibre-gl.css";

export type ReportMapTarget =
  | { kind: "COURSE" | "LIFT"; id: string }
  | { kind: "POINT"; coordinates: [number, number]; courseId: string | null };

type Props = {
  data: CommunityMapData;
  selection: ReportEntryDraft | null;
  onSelect: (target: ReportMapTarget) => void;
};

const SOURCE = "report-lines";
const LINE_LAYER = "report-lines-layer";
const HIT_LAYER = "report-lines-hitbox";

function lineFeatures(
  data: CommunityMapData,
  selection: ReportEntryDraft | null,
) {
  const features: Feature<LineString>[] = [];
  for (const [kind, entries] of [
    ["COURSE", data.courses],
    ["LIFT", data.lifts],
  ] as const) {
    for (const entry of entries) {
      const lines = entry.lines.length ? entry.lines : [entry.coordinates];
      for (const coordinates of lines) {
        const valid = coordinates.filter(
          point =>
            point.length >= 2 &&
            Number.isFinite(point[0]) &&
            Number.isFinite(point[1]),
        );
        if (valid.length < 2) continue;
        features.push({
          type: "Feature",
          properties: {
            kind,
            id: entry.id,
            name: entry.name,
            selected:
              selection?.kind === kind &&
              (kind === "COURSE" ? selection.courseId : selection.liftId) ===
                entry.id,
          },
          geometry: {
            type: "LineString",
            coordinates: valid as [number, number][],
          },
        });
      }
    }
  }
  return {
    type: "FeatureCollection",
    features,
  } as FeatureCollection<LineString>;
}

export function ReportSelectionMap({ data, selection, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const selectRef = useRef(onSelect);
  const selectionRef = useRef(selection);
  const dataRef = useRef(data);
  const [mapError, setMapError] = useState(false);
  const [ready, setReady] = useState(false);
  const [hoveredName, setHoveredName] = useState("");
  const features = useMemo(
    () => lineFeatures(data, selection),
    [data, selection],
  );
  const featuresRef = useRef(features);
  selectRef.current = onSelect;
  selectionRef.current = selection;
  dataRef.current = data;
  featuresRef.current = features;

  useEffect(() => {
    if (
      !host.current ||
      !Number.isFinite(data.center[0]) ||
      !Number.isFinite(data.center[1])
    )
      return;
    setMapError(false);
    const map = new MapLibreMap({
      container: host.current,
      center: data.center,
      zoom: 13,
      style: createBaseStyle(
        "photo",
        getRasterTone({
          variant: "photo",
          monochrome: false,
          isDetailView: false,
          courseColorMode: "difficulty",
          hasCourses: true,
        }),
      ),
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    const onLoad = () => {
      map.addSource(SOURCE, { type: "geojson", data: featuresRef.current });
      map.addLayer({
        id: LINE_LAYER,
        type: "line",
        source: SOURCE,
        paint: {
          "line-color": [
            "case",
            ["get", "selected"],
            "#facc15",
            ["==", ["get", "kind"], "COURSE"],
            "#16a34a",
            "#2563eb",
          ],
          "line-width": ["case", ["get", "selected"], 7, 4],
          "line-opacity": ["case", ["get", "selected"], 1, 0.88],
          "line-gap-width": 1,
        },
      });
      map.addLayer({
        id: HIT_LAYER,
        type: "line",
        source: SOURCE,
        paint: { "line-color": "#000", "line-width": 18, "line-opacity": 0.01 },
      });
      const bounds = coordinatesBounds(featuresRef.current);
      if (bounds)
        map.fitBounds(bounds, { padding: 42, maxZoom: 15, duration: 0 });
      setReady(true);
    };
    const onClick = (event: {
      lngLat: { lng: number; lat: number };
      point: { x: number; y: number };
    }) => {
      if (!map.getLayer(HIT_LAYER)) return;
      const current = selectionRef.current;
      if (current?.kind === "MOGUL" || current?.kind === "ITEM") {
        const coordinates: [number, number] = [
          event.lngLat.lng,
          event.lngLat.lat,
        ];
        selectRef.current({
          kind: "POINT",
          coordinates,
          courseId: nearestCourseId(coordinates, dataRef.current.courses),
        });
        return;
      }
      const hits = map.queryRenderedFeatures([event.point.x, event.point.y], {
        layers: [HIT_LAYER],
      });
      const wanted =
        current?.kind === "COURSE"
          ? "COURSE"
          : current?.kind === "LIFT"
            ? "LIFT"
            : null;
      const hit = hits
        .map(feature => feature.properties as { kind?: string; id?: string })
        .find(feature => !wanted || feature.kind === wanted);
      if (!hit?.id || (wanted && hit.kind !== wanted)) return;
      selectRef.current({ kind: hit.kind as "COURSE" | "LIFT", id: hit.id });
    };
    map.on("load", onLoad);
    map.on("error", event => {
      const sourceId = (event as typeof event & { sourceId?: string }).sourceId;
      if (sourceId?.startsWith("gsi-")) return;
      setMapError(true);
    });
    map.on("click", onClick);
    map.on("mousemove", event => {
      if (!map.getLayer(HIT_LAYER)) return;
      const hit = map
        .queryRenderedFeatures(event.point, { layers: [HIT_LAYER] })
        .find(
          feature =>
            !selectionRef.current ||
            feature.properties?.kind === selectionRef.current.kind,
        );
      const name =
        typeof hit?.properties?.name === "string" ? hit.properties.name : "";
      setHoveredName(name);
      map.getCanvas().style.cursor =
        name ||
        selectionRef.current?.kind === "MOGUL" ||
        selectionRef.current?.kind === "ITEM"
          ? "pointer"
          : "";
    });
    map.on("mouseout", () => setHoveredName(""));
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Create the map once for this resort; updates are applied through the GeoJSON source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.center[0], data.center[1]]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource(SOURCE) as
      | { setData: (value: FeatureCollection<LineString>) => void }
      | undefined;
    source?.setData(features);
  }, [features, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (
      selection?.latitude != null &&
      selection.longitude != null &&
      (selection.kind === "MOGUL" || selection.kind === "ITEM")
    ) {
      const point: [number, number] = [selection.longitude, selection.latitude];
      if (!markerRef.current)
        markerRef.current = new Marker({ color: "#f97316" })
          .setLngLat(point)
          .addTo(map);
      else markerRef.current.setLngLat(point);
    } else {
      markerRef.current?.remove();
      markerRef.current = null;
    }
  }, [selection, ready]);

  useEffect(() => {
    const element = host.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => mapRef.current?.resize());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative h-full min-h-64 w-full overflow-hidden rounded-md bg-muted">
      <div
        ref={host}
        className="h-full w-full"
        role="application"
        aria-label={`${data.name}のコース・リフト選択地図`}
      />
      <div className="sr-only" aria-live="polite">
        {mapError
          ? "地図を読み込めませんでした。"
          : ready
            ? "地図を表示しました。"
            : "地図を読み込み中です。"}
      </div>
      {selection?.kind !== "MOGUL" && selection?.kind !== "ITEM" && (
        <details className="absolute left-2 top-2 max-h-32 max-w-[70%] rounded bg-background/90 p-2 text-xs shadow">
          <summary className="cursor-pointer">名前から選択</summary>
          <nav
            className="mt-1 max-h-24 overflow-auto"
            aria-label="地図上の選択候補"
          >
            <ul className="space-y-1">
              {(selection?.kind === "LIFT" ? [] : data.courses).map(item => (
                <li key={`c-${item.id}`}>
                  <button
                    type="button"
                    className="text-left underline"
                    onClick={() =>
                      selectRef.current({ kind: "COURSE", id: item.id })
                    }
                  >
                    {item.name}
                  </button>
                </li>
              ))}
              {(selection?.kind === "COURSE" ? [] : data.lifts).map(item => (
                <li key={`l-${item.id}`}>
                  <button
                    type="button"
                    className="text-left underline"
                    onClick={() =>
                      selectRef.current({ kind: "LIFT", id: item.id })
                    }
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </details>
      )}
      <div
        className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-7rem)] rounded bg-white/95 px-2 py-1 text-xs text-slate-700 shadow"
        aria-live="polite"
      >
        <div className="flex gap-2">
          <span className="text-green-700">━ コース</span>
          <span className="text-blue-700">━ リフト</span>
        </div>
        <p className="truncate">
          {hoveredName ||
            (selection?.kind === "COURSE"
              ? data.courses.find(item => item.id === selection.courseId)
                  ?.name || "コースをタップして選択"
              : selection?.kind === "LIFT"
                ? data.lifts.find(item => item.id === selection.liftId)?.name ||
                  "リフトをタップして選択"
                : selection
                  ? selection.latitude != null
                    ? "場所を指定済み"
                    : "地図をタップして場所を指定"
                  : "コース・リフトをタップして追加")}
        </p>
      </div>
      {mapError && (
        <div className="absolute inset-x-2 bottom-7 rounded bg-background/95 p-2 text-center text-sm">
          地図を表示できません。再読み込みしてください。
        </div>
      )}
    </div>
  );
}

function coordinatesBounds(
  collection: FeatureCollection<LineString>,
): [[number, number], [number, number]] | null {
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  for (const feature of collection.features)
    for (const [lng, lat] of feature.geometry.coordinates) {
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  return Number.isFinite(west)
    ? [
        [west, south],
        [east, north],
      ]
    : null;
}
