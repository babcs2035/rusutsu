import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  LngLat,
  SlopeBeforeFeature,
  SlopeBeforeGeojson,
} from "@/features/slope/types";
import { distanceM } from "@/features/slope/utils/geo";
import { parseSlopeBeforeGeojson, readSlopeBeforeRaw } from "./slopeFiles";

const DATA_ROOT = path.join(
  process.cwd(),
  "src",
  "private",
  "data",
  "resorts-temporary",
);

export const sampleLineEvery = (
  coordinates: LngLat[],
  intervalM = 10,
): { coordinates: LngLat[]; horizontalDistanceM: number } => {
  if (!Number.isFinite(intervalM) || intervalM <= 0) {
    throw new Error("サンプリング間隔は0より大きい有限値が必要です。");
  }
  if (coordinates.length < 2) {
    return { coordinates: [...coordinates], horizontalDistanceM: 0 };
  }

  const sampled: LngLat[] = [[...coordinates[0]]];
  let traversedM = 0;
  let nextTargetM = intervalM;

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const segmentM = distanceM(start, end);
    if (segmentM === 0) continue;

    while (traversedM + segmentM >= nextTargetM) {
      const ratio = (nextTargetM - traversedM) / segmentM;
      sampled.push([
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
      ]);
      nextTargetM += intervalM;
    }
    traversedM += segmentM;
  }

  const last = coordinates[coordinates.length - 1];
  const sampledLast = sampled[sampled.length - 1];
  if (sampledLast[0] !== last[0] || sampledLast[1] !== last[1]) {
    sampled.push([...last]);
  }
  return { coordinates: sampled, horizontalDistanceM: traversedM };
};

const toLngLatLine = (feature: SlopeBeforeFeature): LngLat[] | null => {
  if (
    feature.geometry?.type !== "LineString" ||
    !Array.isArray(feature.geometry.coordinates)
  ) {
    return null;
  }
  const coordinates = (feature.geometry.coordinates as unknown[]).flatMap(
    value => {
      if (!Array.isArray(value) || value.length < 2) return [];
      const longitude = Number(value[0]);
      const latitude = Number(value[1]);
      return Number.isFinite(longitude) && Number.isFinite(latitude)
        ? ([[longitude, latitude]] as LngLat[])
        : [];
    },
  );
  return coordinates.length >= 2 ? coordinates : null;
};

export const buildOsmSlope10m = (
  before: SlopeBeforeGeojson,
): SlopeBeforeGeojson => ({
  type: "FeatureCollection",
  features: before.features.flatMap(feature => {
    const coordinates = toLngLatLine(feature);
    if (!coordinates) return [];
    const sampled = sampleLineEvery(coordinates);
    return [
      {
        type: "Feature" as const,
        properties: {
          ...(feature.properties ?? {}),
          horizontal_dist_map: Math.round(sampled.horizontalDistanceM),
        },
        geometry: {
          type: "LineString",
          coordinates: sampled.coordinates,
        },
      },
    ];
  }),
});

export async function syncOsmSlope10m(resortId: string): Promise<void> {
  const raw = await readSlopeBeforeRaw(resortId, "osm");
  if (raw === null) return;
  const before = parseSlopeBeforeGeojson(raw);
  if (!before) throw new Error(`${resortId} の slope_before_osm が不正です。`);

  const outputPath = path.join(
    DATA_ROOT,
    "slope_10m_osm",
    `${resortId}.geojson`,
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(buildOsmSlope10m(before), null, 2)}\n`,
  );
}
