import { setTimeout as delay } from "node:timers/promises";
import type { LiftBeforeGeojson } from "../types";

type Position = [number, number, ...number[]];
export type ElevationLookup = (
  longitude: number,
  latitude: number,
) => Promise<number>;

// 同じプロセスからの要求を直列化し、国土地理院へのアクセス間隔を空ける。
let requestQueue: Promise<unknown> = Promise.resolve();

export const fetchGsiElevation: ElevationLookup = (longitude, latitude) => {
  const request = requestQueue.then(async () => {
    const url = new URL(
      "https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php",
    );
    url.search = new URLSearchParams({
      lon: String(longitude),
      lat: String(latitude),
      outtype: "JSON",
    }).toString();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await delay(attempt === 0 ? 150 : 1000 * attempt);
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: unknown = await response.json();
        const elevation =
          data && typeof data === "object" && "elevation" in data
            ? data.elevation
            : undefined;
        if (typeof elevation !== "number" || !Number.isFinite(elevation)) {
          throw new Error("この地点の標高を取得できませんでした");
        }
        return elevation;
      } catch (error) {
        if (attempt === 2) {
          throw new Error(
            `国土地理院の標高取得に失敗しました（経度 ${longitude}、緯度 ${latitude}）: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    throw new Error("標高取得に失敗しました");
  });
  requestQueue = request.catch(() => undefined);
  return request;
};

const position = (value: unknown): value is Position =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === "number" &&
  Number.isFinite(value[0]) &&
  Math.abs(value[0]) <= 180 &&
  typeof value[1] === "number" &&
  Number.isFinite(value[1]) &&
  Math.abs(value[1]) <= 90;

const hasElevation = (value: Position) =>
  typeof value[2] === "number" && Number.isFinite(value[2]);

const horizontalDistance = (a: Position, b: Position) => {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 +
    Math.cos(a[1] * rad) *
      Math.cos(b[1] * rad) *
      Math.sin(((b[0] - a[0]) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** 同期済み20m線の不足する標高を補完。force時は全地点を取り直す。 */
export async function enrichLiftElevations(
  geojson: LiftBeforeGeojson,
  {
    force = false,
    lookup = fetchGsiElevation,
  }: { force?: boolean; lookup?: ElevationLookup } = {},
): Promise<LiftBeforeGeojson> {
  const cache = new Map<string, number>();
  const elevate = async (point: Position): Promise<Position> => {
    if (!force && hasElevation(point)) return [...point];
    const key = `${point[0]},${point[1]}`;
    let elevation = cache.get(key);
    if (elevation === undefined) {
      elevation = await lookup(point[0], point[1]);
      if (!Number.isFinite(elevation))
        throw new Error("標高が有限の数値ではありません");
      cache.set(key, elevation);
    }
    return [point[0], point[1], elevation];
  };
  const features: LiftBeforeGeojson["features"] = [];
  for (const feature of geojson.features) {
    const raw = feature.geometry?.coordinates;
    if (
      feature.geometry?.type !== "LineString" ||
      !Array.isArray(raw) ||
      raw.length < 2 ||
      !raw.every(position)
    ) {
      throw new Error(
        `リフト「${feature.properties?.name ?? "名前なし"}」の座標が不正です`,
      );
    }
    const coordinates: Position[] = [];
    for (const point of raw) coordinates.push(await elevate(point));
    const properties = { ...feature.properties };
    const midstation = properties.midstation;
    if (midstation !== null && midstation !== undefined && midstation !== "") {
      if (!position(midstation)) throw new Error("中間駅の座標が不正です");
      // 座標順はGeoJSONと同じ経度・緯度・標高に統一する。
      properties.midstation = await elevate(midstation);
    }
    let horizontal = 0;
    let distance = 0;
    for (let i = 1; i < coordinates.length; i += 1) {
      const before = coordinates[i - 1];
      const after = coordinates[i];
      const segment = horizontalDistance(before, after);
      horizontal += segment;
      distance += Math.hypot(segment, after[2] - before[2]);
    }
    properties.horizontal_dist_map = Math.round(horizontal);
    properties.slope_dist_map = Math.round(distance);
    properties.elevation_diff_map =
      Math.round(
        Math.abs(coordinates[coordinates.length - 1][2] - coordinates[0][2]) *
          10,
      ) / 10;
    features.push({
      ...feature,
      properties,
      geometry: { type: "LineString", coordinates },
    });
  }
  return { type: "FeatureCollection", features };
}
