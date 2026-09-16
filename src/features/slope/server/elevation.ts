import {
  type ElevationLookup,
  fetchGsiElevation,
} from "@/features/lift/server/elevation";
import { resampleLineEvery } from "@/server/derivedGeometry";
import type { SlopeBeforeGeojson } from "../types";
import { geodesicDistance as distance } from "./geodesicDistance";

type Point = [number, number, number];

/** distance_10m.py と同じく、高所から10m間隔で標高と距離・斜度を計算する。 */
export async function enrichSlopeElevations(
  source: SlopeBeforeGeojson,
  lookup: ElevationLookup = fetchGsiElevation,
): Promise<SlopeBeforeGeojson> {
  const cache = new Map<string, number>();
  const cachedLookup: ElevationLookup = async (lon, lat) => {
    const key = `${lon},${lat}`;
    let value = cache.get(key);
    if (value === undefined) {
      value = await lookup(lon, lat);
      if (!Number.isFinite(value))
        throw new Error("標高が有限の数値ではありません");
      cache.set(key, value);
    }
    return value;
  };
  const features: SlopeBeforeGeojson["features"] = [];
  for (const feature of source.features) {
    if (feature.geometry?.type !== "LineString") {
      continue;
    }
    const raw = feature.geometry.coordinates as number[][];
    if (!Array.isArray(raw) || raw.length < 2)
      throw new Error("コース座標が不正です");
    const first = raw[0];
    const last = raw[raw.length - 1];
    const start = await cachedLookup(first[0], first[1]);
    const end = await cachedLookup(last[0], last[1]);
    const oriented = (start < end ? [...raw].reverse() : raw).map(
      point => [point[0], point[1]] as [number, number],
    );
    const sampled = resampleLineEvery(oriented, 10, distance);
    const points: Point[] = [];
    for (const [lon, lat] of sampled.coordinates) {
      points.push([lon, lat, await cachedLookup(lon, lat)]);
    }
    const cumulative = [0];
    let slopeDistance = 0;
    for (let i = 1; i < points.length; i += 1) {
      const segment = distance(points[i - 1], points[i]);
      cumulative.push(cumulative[i - 1] + segment);
      slopeDistance += Math.hypot(
        i === points.length - 1 ? segment : 10,
        points[i][2] - points[i - 1][2],
      );
    }
    const elevationDiff = points[0][2] - points[points.length - 1][2];
    const windowSize = Math.min(4, points.length - 1);
    let maxSlope = 0;
    for (let i = 0; i < points.length; i += 1) {
      const from = Math.min(Math.max(0, i - 2), points.length - 1 - windowSize);
      const to = from + windowSize;
      const horizontal = cumulative[to] - cumulative[from];
      const slope =
        horizontal > 0
          ? (Math.atan2(points[from][2] - points[to][2], horizontal) * 180) /
            Math.PI
          : 0;
      maxSlope = Math.max(maxSlope, slope);
    }
    const properties = { ...feature.properties };
    delete properties._source_line_sha256;
    delete properties.slope_deg;
    features.push({
      ...feature,
      geometry: { type: "LineString", coordinates: points },
      properties: {
        ...properties,
        horizontal_dist_map: Math.trunc(sampled.horizontalDistanceM),
        slope_dist_map: Math.trunc(slopeDistance),
        elevation_diff_map: Math.round(elevationDiff * 10) / 10,
        avg_slope_deg_map:
          Math.round(
            (slopeDistance
              ? (Math.atan(elevationDiff / slopeDistance) * 180) / Math.PI
              : 0) * 10,
          ) / 10,
        max_slope_deg_map: Math.round(maxSlope * 10) / 10,
      },
    });
  }
  return { type: "FeatureCollection", features };
}
