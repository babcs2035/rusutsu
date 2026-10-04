"use client";

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { Map as MapLibreMapClass, Popup } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/features/map/maplibre/mapWorker";
import { createEditorStyle } from "@/features/slope/components/EditorMap/editorTiles";
import type { EditPlan } from "@/server/edit-requests/contract";
import { featureIdentity } from "@/shared/course-lift/identity";
import { candidateLiftId, liftCandidate } from "./liftCandidate";
import type { RequestCourseLine } from "./mapContext";
import { candidateCourseId, slopeCandidate } from "./slopeCandidate";
import { isSlopeFeatureDocument } from "./slopeReview";

export type RequestMapKind = "lift" | "slope";

type Position = [number, number];
type MapLine = { id: string; name: string; positions: Position[] };
const NOUN = { lift: "リフト", slope: "コース" } as const;
const CONTEXT = {
  lift: { label: "コース", color: "#bef264", className: "bg-lime-400" },
  slope: { label: "リフト", color: "#e879f9", className: "bg-fuchsia-400" },
} as const;
const SOURCE = {
  courses: "request-courses",
  previous: "request-previous",
  after: "request-after",
};
const LAYER = {
  outline: "request-course-outline",
  courses: "request-course-lines",
  previous: "request-previous-lines",
  after: "request-after-lines",
  selected: "request-selected-line",
};

function documentLines(
  plan: EditPlan,
  before: boolean,
  kind: RequestMapKind,
): MapLine[] {
  const documents = before
    ? plan.beforeDocuments.flatMap(item =>
        item.document
          ? [{ key: item.key, content: item.document.content }]
          : [],
      )
    : plan.documents;
  return documents
    .filter(item =>
      kind === "lift"
        ? item.key.includes("/lift_before/")
        : isSlopeFeatureDocument(item.key),
    )
    .flatMap(document => {
      const parsed = JSON.parse(document.content) as {
        features?: Array<{
          properties?: Record<string, unknown> | null;
          geometry?: { type: string; coordinates: number[][] } | null;
        }>;
      };
      return (parsed.features ?? []).flatMap((feature, index) => {
        if (feature.geometry?.type !== "LineString") return [];
        const positions = feature.geometry.coordinates
          .filter(pair => pair.length >= 2 && pair.every(Number.isFinite))
          .map(pair => [pair[0], pair[1]] as Position);
        if (positions.length < 2) return [];
        return [
          {
            id: featureIdentity(
              feature.properties ?? null,
              document.key,
              index,
            ),
            name:
              typeof feature.properties?.name === "string"
                ? feature.properties.name
                : `名称未設定の${NOUN[kind]}`,
            positions,
          },
        ];
      });
    })
    .slice(0, 1000);
}

function submittedLines(payload: unknown, kind: RequestMapKind): MapLine[] {
  const lift = kind === "lift" ? liftCandidate(payload) : null;
  const slope = kind === "slope" ? slopeCandidate(payload) : null;
  const items: Array<{
    id: string;
    properties: Record<string, unknown>;
    coordinates: unknown;
  }> = lift
    ? lift.lifts.map((item, index) => ({
        id: candidateLiftId(lift, item, index),
        properties: item.properties,
        coordinates: item.coordinates,
      }))
    : slope
      ? slope.courses.map((item, index) => ({
          id: candidateCourseId(slope, item, index),
          properties: item.properties,
          coordinates: item.coordinates,
        }))
      : [];
  return items.flatMap(item => {
    const properties = item.properties;
    const coordinates = item.coordinates;
    if (!Array.isArray(coordinates)) return [];
    const positions = coordinates
      .filter(
        pair =>
          Array.isArray(pair) &&
          pair.length >= 2 &&
          pair.every(Number.isFinite),
      )
      .map(pair => [pair[0], pair[1]] as Position);
    if (positions.length < 2) return [];
    return [
      {
        id: item.id,
        name:
          typeof properties?.name === "string"
            ? properties.name
            : `名称未設定の${NOUN[kind]}`,
        positions,
      },
    ];
  });
}

function collection(lines: MapLine[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: lines.map(line => ({
      type: "Feature",
      properties: { id: line.id, name: line.name },
      geometry: { type: "LineString", coordinates: line.positions },
    })),
  };
}

function updateSource(
  map: MapLibreMap,
  id: string,
  data: GeoJSON.FeatureCollection,
) {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
}

export default function RequestMap({
  kind = "lift",
  plan,
  submittedPayload,
  contextLines = [],
  selectedId,
  fill = false,
  preferSubmittedPayload = false,
  onSelectLine,
}: {
  kind?: RequestMapKind;
  plan?: EditPlan;
  submittedPayload?: unknown;
  /** 参考として下に敷く、もう一方の種類の線 */
  contextLines?: RequestCourseLine[];
  selectedId?: string;
  fill?: boolean;
  preferSubmittedPayload?: boolean;
  onSelectLine?: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectRef = useRef(onSelectLine);
  selectRef.current = onSelectLine;
  const [ready, setReady] = useState(false);

  const before = useMemo(
    () => (plan ? documentLines(plan, true, kind) : []),
    [plan, kind],
  );
  const after = useMemo(
    () =>
      plan && !preferSubmittedPayload
        ? documentLines(plan, false, kind)
        : submittedLines(submittedPayload, kind),
    [plan, preferSubmittedPayload, submittedPayload, kind],
  );
  const previous = useMemo(
    () =>
      before.filter(line => {
        const current = after.find(item => item.id === line.id);
        return (
          !current ||
          JSON.stringify(current.positions) !== JSON.stringify(line.positions)
        );
      }),
    [before, after],
  );
  const courses = useMemo(
    () =>
      contextLines.map((line, index) => ({
        id: `context-${index}`,
        name: line.name,
        positions: line.coordinates.map(pair => [pair[0], pair[1]] as Position),
      })),
    [contextLines],
  );
  const courseData = useMemo(() => collection(courses), [courses]);
  const previousData = useMemo(() => collection(previous), [previous]);
  const afterData = useMemo(() => collection(after), [after]);
  const all = useMemo(
    () => [...courses, ...before, ...after],
    [courses, before, after],
  );
  const hasLines = all.length > 0;

  // MapLibre インスタンスは一度だけ作り、データは下の effect で更新する。
  // biome-ignore lint/correctness/useExhaustiveDependencies: initial center is only used at creation
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current || !hasLines) return;
    const map = new MapLibreMapClass({
      container,
      style: createEditorStyle("gsiPhoto"),
      center: all[0].positions[0],
      zoom: 12,
      maxZoom: 18,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    mapRef.current = map;
    map.scrollZoom.disable();
    const popup = new Popup({ closeButton: false, closeOnClick: false });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
    map.on("load", () => {
      for (const id of Object.values(SOURCE)) {
        map.addSource(id, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      map.addLayer({
        id: LAYER.outline,
        type: "line",
        source: SOURCE.courses,
        paint: {
          "line-color": "#0f172a",
          "line-width": 7,
          "line-opacity": 0.8,
        },
      });
      map.addLayer({
        id: LAYER.courses,
        type: "line",
        source: SOURCE.courses,
        paint: { "line-color": CONTEXT[kind].color, "line-width": 3 },
      });
      map.addLayer({
        id: LAYER.previous,
        type: "line",
        source: SOURCE.previous,
        paint: {
          "line-color": "#f97316",
          "line-width": 4,
          "line-opacity": 0.9,
          "line-dasharray": [1.5, 1.5],
        },
      });
      map.addLayer({
        id: LAYER.after,
        type: "line",
        source: SOURCE.after,
        filter: ["!=", ["get", "id"], ""],
        paint: { "line-color": "#2563eb", "line-width": 4 },
      });
      map.addLayer({
        id: LAYER.selected,
        type: "line",
        source: SOURCE.after,
        filter: ["==", ["get", "id"], ""],
        paint: { "line-color": "#fde047", "line-width": 7 },
      });
      for (const layer of [
        LAYER.courses,
        LAYER.previous,
        LAYER.after,
        LAYER.selected,
      ]) {
        map.on("mousemove", layer, event => {
          const name = event.features?.[0]?.properties?.name;
          if (typeof name !== "string") return;
          map.getCanvas().style.cursor =
            layer === LAYER.courses ? "" : "pointer";
          popup
            .setLngLat(event.lngLat)
            .setText(layer === LAYER.previous ? `変更前: ${name}` : name)
            .addTo(map);
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });
      }
      for (const layer of [LAYER.after, LAYER.selected]) {
        map.on("click", layer, event => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === "string") selectRef.current?.(id);
        });
      }
      setReady(true);
    });
    return () => {
      observer.disconnect();
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [hasLines]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    updateSource(map, SOURCE.courses, courseData);
    updateSource(map, SOURCE.previous, previousData);
    updateSource(map, SOURCE.after, afterData);
    const positions = all.flatMap(line => line.positions);
    if (!positions.length) return;
    const extent = positions.reduce(
      (box, pair) => [
        Math.min(box[0], pair[0]),
        Math.min(box[1], pair[1]),
        Math.max(box[2], pair[0]),
        Math.max(box[3], pair[1]),
      ],
      [180, 90, -180, -90],
    );
    map.fitBounds(
      [
        [extent[0], extent[1]],
        [extent[2], extent[3]],
      ],
      { padding: 28, duration: 0, maxZoom: 17 },
    );
  }, [ready, courseData, previousData, afterData, all]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setFilter(LAYER.after, ["!=", ["get", "id"], selectedId ?? ""]);
    map.setFilter(LAYER.selected, ["==", ["get", "id"], selectedId ?? ""]);
    map.setPaintProperty(LAYER.after, "line-opacity", selectedId ? 0.55 : 1);
    map.setPaintProperty(
      LAYER.previous,
      "line-opacity",
      selectedId ? 0.35 : 0.9,
    );
  }, [ready, selectedId]);

  if (!hasLines) {
    return (
      <p
        className={`${fill ? "flex h-full items-center justify-center" : "rounded-lg"} bg-slate-100 p-4 text-sm text-slate-600`}
      >
        地図に表示できるリフト・コースの線がありません。
      </p>
    );
  }
  return (
    <div
      className={
        fill
          ? "flex h-full min-h-0 flex-col overflow-hidden bg-white"
          : "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      }
    >
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 px-4 py-2 text-[11px] font-medium text-slate-700">
        <span>国土地理院の航空写真</span>
        {courses.length > 0 ? (
          <span className="flex items-center gap-1">
            <i className={`h-0.5 w-5 ${CONTEXT[kind].className}`} />
            {CONTEXT[kind].label}
          </span>
        ) : (
          <span className="text-slate-500">
            {CONTEXT[kind].label}の線は未登録
          </span>
        )}
        <span className="flex items-center gap-1">
          <i className="h-0.5 w-5 bg-blue-500" />
          申請後の{NOUN[kind]}
        </span>
        {previous.length > 0 && (
          <span className="flex items-center gap-1">
            <i className="h-0.5 w-5 bg-orange-400" />
            変更前の線
          </span>
        )}
        {selectedId && (
          <span className="text-amber-800">選択中の{NOUN[kind]}を強調表示</span>
        )}
      </div>
      <div
        ref={containerRef}
        className={
          fill ? "min-h-0 w-full flex-1" : "h-[26rem] w-full md:h-[34rem]"
        }
      />
    </div>
  );
}
