import type { Map as MapLibreMap, Point as MapLibrePoint } from "maplibre-gl";
import type { LngLat } from "../../types";
import type { EditorLinePick, EditorMapLine } from "./types";

/** 当たり判定を広げる余白（画面上のピクセル） */
export const PICK_PADDING = 6;

export const paddedBox = (
  point: MapLibrePoint,
  padding: number,
): [[number, number], [number, number]] => [
  [point.x - padding, point.y - padding],
  [point.x + padding, point.y + padding],
];

/**
 * 指定レイヤーを上から順に当てて、最初に当たったものを返す。
 * 点は円ぴったりだと掴みにくいので、少し広げた四角で当てる。
 */
export const pickFeature = (
  map: MapLibreMap,
  point: MapLibrePoint,
  layers: string[],
  padding = PICK_PADDING,
) => {
  for (const layer of layers) {
    if (!map.getLayer(layer)) continue;
    const [feature] = map.queryRenderedFeatures(paddedBox(point, padding), {
      layers: [layer],
    });
    if (feature) return feature;
  }
  return null;
};

const distanceToSegment = (
  point: { x: number; y: number },
  from: { x: number; y: number },
  to: { x: number; y: number },
): { distance: number; t: number } => {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const squaredLength = deltaX * deltaX + deltaY * deltaY;
  const t =
    squaredLength === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((point.x - from.x) * deltaX + (point.y - from.y) * deltaY) /
              squaredLength,
          ),
        );
  const nearestX = from.x + deltaX * t;
  const nearestY = from.y + deltaY * t;
  return {
    distance: Math.hypot(point.x - nearestX, point.y - nearestY),
    t,
  };
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * カーソルにいちばん近い線と、その線上の位置を返す。
 *
 * 判定用レイヤーを太くしただけだと、線が重なったところで
 * 「描画順で上にある線」が勝ってしまい、狙った線を選べない。
 * 当たった線を候補として集め直し、画面上の距離で選び直す。
 */
export const pickNearestLine = (
  map: MapLibreMap,
  point: MapLibrePoint,
  candidateIds: Set<string>,
  lines: EditorMapLine[],
  tolerancePx: number,
): EditorLinePick | null => {
  let best: EditorLinePick | null = null;
  let bestDistance = tolerancePx;

  for (const line of lines) {
    if (!candidateIds.has(line.id) || line.coordinates.length < 2) continue;
    const projected = line.coordinates.map(coordinate =>
      map.project(coordinate),
    );
    for (let index = 0; index < projected.length - 1; index += 1) {
      const { distance, t } = distanceToSegment(
        point,
        projected[index],
        projected[index + 1],
      );
      if (distance >= bestDistance) continue;
      const from = line.coordinates[index];
      const to = line.coordinates[index + 1];
      const lngLat: LngLat = [lerp(from[0], to[0], t), lerp(from[1], to[1], t)];
      bestDistance = distance;
      best = { lineId: line.id, segmentIndex: index, t, lngLat };
    }
  }

  return best;
};

/** 判定用レイヤーに当たった線の id を集める */
export const queryLineCandidateIds = (
  map: MapLibreMap,
  point: MapLibrePoint,
  layer: string,
  padding = PICK_PADDING,
): Set<string> => {
  if (!map.getLayer(layer)) return new Set();
  const ids = new Set<string>();
  for (const feature of map.queryRenderedFeatures(paddedBox(point, padding), {
    layers: [layer],
  })) {
    const lineId = feature.properties?.lineId;
    if (typeof lineId === "string") ids.add(lineId);
  }
  return ids;
};
