import type { LngLat } from "../types";
import { distanceM } from "./geo";

/** 線上の一点。segmentIndex 番目の区間を t（0〜1）だけ進んだ位置 */
export type LinePosition = {
  segmentIndex: number;
  t: number;
};

/** 線のどちら側を残すか。"start" は始点〜指定位置、"end" は指定位置〜終点 */
export type LineSide = "start" | "end";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const positionToCoordinate = (
  coordinates: LngLat[],
  position: LinePosition,
): LngLat | null => {
  const from = coordinates[position.segmentIndex];
  const to = coordinates[position.segmentIndex + 1];
  if (!from) return null;
  if (!to) return [...from] as LngLat;
  return [lerp(from[0], to[0], position.t), lerp(from[1], to[1], position.t)];
};

/**
 * 経度緯度を平面とみなして、点を線分へ落とす。
 * スキー場ひとつ分の広がりなら緯度による経度の縮みは無視できるが、
 * 縦横比だけは合わせないと南北方向へ寄って落ちるので、cos(緯度) を掛ける。
 */
const projectOnSegment = (
  point: LngLat,
  from: LngLat,
  to: LngLat,
): { t: number; squaredDistance: number } => {
  const scale = Math.cos((point[1] * Math.PI) / 180) || 1;
  const fromX = from[0] * scale;
  const toX = to[0] * scale;
  const pointX = point[0] * scale;
  const deltaX = toX - fromX;
  const deltaY = to[1] - from[1];
  const squaredLength = deltaX * deltaX + deltaY * deltaY;
  const t =
    squaredLength === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((pointX - fromX) * deltaX + (point[1] - from[1]) * deltaY) /
              squaredLength,
          ),
        );
  const nearestX = fromX + deltaX * t;
  const nearestY = from[1] + deltaY * t;
  return {
    t,
    squaredDistance: (pointX - nearestX) ** 2 + (point[1] - nearestY) ** 2,
  };
};

/** 線上でいちばん近い位置を返す。点が 2 つ未満の線では null */
export const findNearestPosition = (
  coordinates: LngLat[],
  point: LngLat,
): LinePosition | null => {
  if (coordinates.length < 2) return null;
  let best: LinePosition | null = null;
  let bestSquaredDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const { t, squaredDistance } = projectOnSegment(
      point,
      coordinates[index],
      coordinates[index + 1],
    );
    if (squaredDistance < bestSquaredDistance) {
      bestSquaredDistance = squaredDistance;
      best = { segmentIndex: index, t };
    }
  }
  return best;
};

/**
 * 既存の頂点にじゅうぶん近ければ、その頂点そのものへ寄せる。
 * 端の頂点へ寄せられると「線まるごと」を選んだことになるので、
 * 端どうしをつなぐ普通の結合が、位置をきっちり合わせなくても決まる。
 */
export const snapPositionToVertex = (
  coordinates: LngLat[],
  position: LinePosition,
  toleranceM: number,
): LinePosition => {
  const point = positionToCoordinate(coordinates, position);
  if (!point) return position;
  const candidates: LinePosition[] = [
    { segmentIndex: position.segmentIndex, t: 0 },
    { segmentIndex: position.segmentIndex, t: 1 },
  ];
  for (const candidate of candidates) {
    const vertex = positionToCoordinate(coordinates, candidate);
    if (vertex && distanceM(point, vertex) <= toleranceM) return candidate;
  }
  return position;
};

/** 線上の位置を頂点インデックスへ丸める（t が 0.5 未満なら手前の頂点） */
export const positionToVertexIndex = (position: LinePosition): number =>
  position.t < 0.5 ? position.segmentIndex : position.segmentIndex + 1;

/**
 * 線を指定位置で 2 本の腕に分ける。分割点はどちらの腕にも含める。
 * "start" は始点から分割点まで、"end" は分割点から終点まで。
 */
export const takeSide = (
  coordinates: LngLat[],
  position: LinePosition,
  side: LineSide,
): LngLat[] => {
  const point = positionToCoordinate(coordinates, position);
  if (!point) return [];
  if (side === "start") {
    const head = coordinates.slice(0, position.segmentIndex + 1);
    return position.t === 0 ? head : [...head, point];
  }
  const tail = coordinates.slice(position.segmentIndex + 1);
  return position.t === 1 ? tail : [point, ...tail];
};

export const lineLengthM = (coordinates: LngLat[]): number => {
  let total = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    total += distanceM(coordinates[index], coordinates[index + 1]);
  }
  return total;
};

/** 長いほうの腕を既定にする。端を指した場合はまるごと残る側になる */
export const defaultSideToKeep = (
  coordinates: LngLat[],
  position: LinePosition,
): LineSide =>
  lineLengthM(takeSide(coordinates, position, "start")) >=
  lineLengthM(takeSide(coordinates, position, "end"))
    ? "start"
    : "end";

const isSameCoordinate = (a: LngLat, b: LngLat): boolean =>
  a[0] === b[0] && a[1] === b[1];

/** 連続する重複点を落として 1 本につなぐ */
export const concatWithoutDuplicates = (...parts: LngLat[][]): LngLat[] => {
  const result: LngLat[] = [];
  for (const part of parts) {
    for (const coordinate of part) {
      const last = result[result.length - 1];
      if (last && isSameCoordinate(last, coordinate)) continue;
      result.push(coordinate);
    }
  }
  return result;
};

/**
 * 2 本の線を、それぞれの指定位置でつないだ 1 本を作る。
 *
 * 残す腕は必ず「つなぎ目で終わる向き」「つなぎ目から始まる向き」へそろえる。
 * 1 本目の残す側が "end"（つなぎ目から終点まで）なら、その腕を反転して
 * つなぎ目が末尾に来るようにする。2 本目は逆に、つなぎ目が先頭に来るよう
 * "start" 側を反転する。こうすると、途中どうしをつないでも線が折り返さない。
 */
export const joinLines = (
  first: { coordinates: LngLat[]; position: LinePosition; keep: LineSide },
  second: { coordinates: LngLat[]; position: LinePosition; keep: LineSide },
): LngLat[] => {
  const firstArm = takeSide(first.coordinates, first.position, first.keep);
  const secondArm = takeSide(second.coordinates, second.position, second.keep);
  return concatWithoutDuplicates(
    first.keep === "start" ? firstArm : [...firstArm].reverse(),
    second.keep === "end" ? secondArm : [...secondArm].reverse(),
  );
};
