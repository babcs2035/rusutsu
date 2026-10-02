"use client";
import type { LatLngTuple } from "leaflet";
import { MapContainer, Polyline, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { EditPlan } from "@/server/edit-requests/contract";

function lines(plan: EditPlan, before: boolean) {
  const documents = before
    ? plan.beforeDocuments.flatMap(item =>
        item.document ? [item.document] : [],
      )
    : plan.documents;
  return documents
    .filter(item => /\/(?:slope_before(?:_osm)?|lift_before)\//.test(item.key))
    .flatMap(document => {
      const parsed = JSON.parse(document.content) as {
        features?: Array<{
          geometry?: { type: string; coordinates: number[][] } | null;
        }>;
      };
      return (parsed.features ?? []).flatMap(feature =>
        feature.geometry?.type === "LineString"
          ? [
              feature.geometry.coordinates
                .filter(pair => pair.length >= 2 && pair.every(Number.isFinite))
                .map(pair => [pair[1], pair[0]] as LatLngTuple),
            ]
          : [],
      );
    })
    .filter(line => line.length >= 2)
    .slice(0, 1000);
}
export default function RequestMap({ plan }: { plan: EditPlan }) {
  const before = lines(plan, true),
    after = lines(plan, false);
  const all = [...before, ...after];
  if (!all.length) return null;
  const flat = all.flat();
  const extent = flat.reduce(
    (box, pair) => [
      Math.min(box[0], pair[0]),
      Math.min(box[1], pair[1]),
      Math.max(box[2], pair[0]),
      Math.max(box[3], pair[1]),
    ],
    [90, 180, -90, -180],
  );
  const bounds: [LatLngTuple, LatLngTuple] = [
    [extent[0], extent[1]],
    [extent[2], extent[3]],
  ];

  return (
    <div className="space-y-2">
      <p className="text-sm">
        <span className="text-orange-700">橙: 変更前</span> ／{" "}
        <span className="text-blue-700">青: 反映する内容</span>
        （重なった線は青で表示）
      </p>
      <MapContainer
        className="h-96 w-full rounded"
        bounds={bounds}
        boundsOptions={{ padding: [20, 20] }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        {before.map((line, index) => (
          <Polyline
            // biome-ignore lint/suspicious/noArrayIndexKey: Immutable comparison geometry.
            key={`before-${index}`}
            positions={line}
            pathOptions={{ color: "#c2410c", weight: 6, opacity: 0.7 }}
          />
        ))}
        {after.map((line, index) => (
          <Polyline
            // biome-ignore lint/suspicious/noArrayIndexKey: Immutable comparison geometry.
            key={`after-${index}`}
            positions={line}
            pathOptions={{ color: "#1d4ed8", weight: 3 }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
