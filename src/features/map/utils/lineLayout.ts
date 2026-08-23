/**
 * 線状フィーチャ（コース・リフト）の上にラベルや方向記号を置くための幾何計算。
 *
 * Leaflet に依存しない純関数だけを置く（単体テストのため）。呼び出し側は
 * 緯度経度を画面ピクセルへ投影した点列を渡す。
 *
 * 設計の要点（FR-3.1 / FR-3.3）:
 * 配置は「線の長さとズーム」だけで決まり、地図をどこにパンしているかには
 * 依存しない。こうすることでパン中の再配置が不要になり、長い線でも
 * 一定間隔で名前が現れる（拡大しても名前が消えない）。
 */

export type LayoutPoint = {
  x: number;
  y: number;
};

export type ProjectedLine = {
  points: LayoutPoint[];
  /** points[i] → points[i + 1] の長さ */
  segmentLengths: number[];
  /** 始点から points[i] までの累積距離 */
  cumulativeLengths: number[];
  length: number;
};

export type OrientedRect = {
  cx: number;
  cy: number;
  halfWidth: number;
  halfHeight: number;
  /** 度。時計回り（画面座標系） */
  angle: number;
};

export type LineAnchor = {
  /** 線の始点からの距離（px） */
  distance: number;
  point: LayoutPoint;
  /** 線の接線方向（度・-180〜180） */
  angle: number;
  /** anchor 周辺の線の曲がり具合（px）。小さいほど直線的 */
  deviation: number;
};

const distanceBetween = (a: LayoutPoint, b: LayoutPoint) =>
  Math.hypot(b.x - a.x, b.y - a.y);

export const createProjectedLine = (
  points: LayoutPoint[],
): ProjectedLine | null => {
  if (points.length < 2) return null;

  const segmentLengths: number[] = [];
  const cumulativeLengths: number[] = [0];
  let total = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;

    const length = distanceBetween(start, end);
    segmentLengths.push(length);
    total += length;
    cumulativeLengths.push(total);
  }

  if (total <= 0) return null;
  return { points, segmentLengths, cumulativeLengths, length: total };
};

export const getPointAtDistance = (
  line: ProjectedLine,
  distance: number,
): LayoutPoint => {
  const target = Math.max(0, Math.min(line.length, distance));

  for (let index = 0; index < line.segmentLengths.length; index += 1) {
    const segmentLength = line.segmentLengths[index] ?? 0;
    const walked = line.cumulativeLengths[index] ?? 0;
    if (segmentLength <= 0) continue;

    if (walked + segmentLength >= target) {
      const start = line.points[index];
      const end = line.points[index + 1];
      if (!start || !end) break;

      const ratio = (target - walked) / segmentLength;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    }
  }

  return line.points[line.points.length - 1] ?? { x: 0, y: 0 };
};

/** start..end 区間の点が、両端を結ぶ弦からどれだけ離れるか（px） */
export const getChordDeviation = (
  line: ProjectedLine,
  startDistance: number,
  endDistance: number,
): number => {
  const start = getPointAtDistance(line, startDistance);
  const end = getPointAtDistance(line, endDistance);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const chordLength = Math.hypot(dx, dy);
  if (chordLength <= 0) return 0;

  let deviation = 0;
  for (let index = 0; index < line.points.length; index += 1) {
    const walked = line.cumulativeLengths[index] ?? 0;
    if (walked <= startDistance || walked >= endDistance) continue;

    const point = line.points[index];
    if (!point) continue;

    const distanceToChord =
      Math.abs(
        dy * point.x - dx * point.y + end.x * start.y - end.y * start.x,
      ) / chordLength;
    deviation = Math.max(deviation, distanceToChord);
  }

  return deviation;
};

/** 度。画面座標系（y が下向き）での接線方向 */
export const getTangentAngle = (
  line: ProjectedLine,
  distance: number,
  span: number,
): number => {
  const half = Math.max(1, span / 2);
  const start = getPointAtDistance(line, distance - half);
  const end = getPointAtDistance(line, distance + half);
  return (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
};

/** 文字が上下逆さにならないように、角度を -90〜90 度に折り返す */
export const toReadableAngle = (angle: number): number => {
  let normalized = angle;
  while (normalized > 90) normalized -= 180;
  while (normalized < -90) normalized += 180;
  return normalized;
};

/**
 * 画面上で天地が逆さになる角度だけ 180° 回す。
 *
 * 線の向き（山頂側 → 麓側）はできるだけ残したいので、読める範囲に入っている
 * うちは触らない。真下向き（90°）は「上から下へ」読む形なのでそのまま、
 * 真上向き（-90°）だけ裏返して下向きに揃える。
 */
export const toUprightAngle = (angle: number): number => {
  let normalized = angle;
  while (normalized > 180) normalized -= 360;
  while (normalized <= -180) normalized += 360;
  if (normalized > 90) return normalized - 180;
  if (normalized <= -90) return normalized + 180;
  return normalized;
};

/**
 * 線の長さと目標間隔から、配置する距離のリストを返す。
 * 両端から margin だけ離し、間隔は spacing の 0.67〜1.5 倍に収まる。
 */
export const getSpacedDistances = ({
  length,
  spacing,
  margin,
  maxCount,
}: {
  length: number;
  spacing: number;
  margin: number;
  maxCount: number;
}): number[] => {
  if (length <= 0 || maxCount < 1) return [];

  const usable = length - margin * 2;
  if (usable <= 0) {
    return length >= margin * 1.2 ? [length / 2] : [];
  }

  const count = Math.max(
    1,
    Math.min(maxCount, Math.round(usable / Math.max(1, spacing)) + 1),
  );
  if (count === 1) return [length / 2];

  const step = usable / (count - 1);
  return Array.from({ length: count }, (_, index) => margin + step * index);
};

/**
 * ラベルを置く位置（線の始点からの距離）。
 *
 * 基本は中央 1 箇所。名前だらけにならないよう、2 箇所出すのは
 * 十分に長い線だけに絞り、そのときは 1/4 と 3/4 に置く
 * （片側に 2 つ寄ると「同じ名前が並んでいる」ように見えて気持ち悪い）。
 */
export const getLabelDistances = ({
  length,
  labelWidth,
  twoLabelMinLength,
}: {
  length: number;
  labelWidth: number;
  twoLabelMinLength: number;
}): number[] => {
  if (length <= 0) return [];
  // 1/4 と 3/4 の間隔が線長の半分なので、その半分がラベル幅の 2 倍以上ないと
  // 2 つ出す意味がない
  if (
    length >= Math.max(twoLabelMinLength, labelWidth * 6) &&
    length * 0.5 >= labelWidth * 2
  ) {
    return [length * 0.25, length * 0.75];
  }

  return [length * 0.5];
};

/**
 * 目標距離の周辺で、もっとも直線的な位置へ anchor をずらす。
 * ラベルは直線区間に置いたほうが読みやすいが、可視領域に縛られる必要はない
 * （地図はずらして見るものなので）。
 */
export const refineAnchor = ({
  line,
  targetDistance,
  span,
  searchRadius,
  steps = 4,
}: {
  line: ProjectedLine;
  targetDistance: number;
  span: number;
  searchRadius: number;
  steps?: number;
}): LineAnchor => {
  const half = span / 2;
  const candidates: number[] = [targetDistance];
  for (let step = 1; step <= steps; step += 1) {
    const offset = (searchRadius * step) / steps;
    candidates.push(targetDistance - offset, targetDistance + offset);
  }

  const upperBound = Math.max(half, line.length - half);
  let best: { anchor: LineAnchor; penalty: number } | null = null;

  for (const candidate of candidates) {
    const distance = Math.max(half, Math.min(upperBound, candidate));
    const deviation = getChordDeviation(line, distance - half, distance + half);
    const penalty = deviation + Math.abs(distance - targetDistance) * 0.05;
    if (best && penalty >= best.penalty) continue;

    best = {
      penalty,
      anchor: {
        distance,
        point: getPointAtDistance(line, distance),
        angle: getTangentAngle(line, distance, span),
        deviation,
      },
    };
  }

  if (best) return best.anchor;

  const fallbackDistance = Math.max(half, Math.min(upperBound, targetDistance));
  return {
    distance: fallbackDistance,
    point: getPointAtDistance(line, fallbackDistance),
    angle: getTangentAngle(line, fallbackDistance, span),
    deviation: 0,
  };
};

const RECT_CORNER_OFFSETS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

export const getOrientedRectCorners = (rect: OrientedRect): LayoutPoint[] => {
  const radians = (rect.angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return RECT_CORNER_OFFSETS.map(([signX, signY]) => {
    const dx = signX * rect.halfWidth;
    const dy = signY * rect.halfHeight;
    return {
      x: rect.cx + dx * cos - dy * sin,
      y: rect.cy + dx * sin + dy * cos,
    };
  });
};

const projectOntoAxis = (corners: LayoutPoint[], axis: LayoutPoint) => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const corner of corners) {
    const value = corner.x * axis.x + corner.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
};

/**
 * 回転を考慮した矩形同士の重なり判定（分離軸法）。
 * 斜めのラベル同士は軸並行矩形では取りこぼす（FR-3.7）。
 */
export const orientedRectsOverlap = (
  a: OrientedRect,
  b: OrientedRect,
): boolean => {
  const cornersA = getOrientedRectCorners(a);
  const cornersB = getOrientedRectCorners(b);
  const axes: LayoutPoint[] = [];

  for (const rect of [a, b]) {
    const radians = (rect.angle * Math.PI) / 180;
    axes.push({ x: Math.cos(radians), y: Math.sin(radians) });
    axes.push({ x: -Math.sin(radians), y: Math.cos(radians) });
  }

  for (const axis of axes) {
    const projectionA = projectOntoAxis(cornersA, axis);
    const projectionB = projectOntoAxis(cornersB, axis);
    if (
      projectionA.max < projectionB.min ||
      projectionB.max < projectionA.min
    ) {
      return false;
    }
  }

  return true;
};

export const expandOrientedRect = (
  rect: OrientedRect,
  padding: number,
): OrientedRect => ({
  ...rect,
  halfWidth: rect.halfWidth + padding,
  halfHeight: rect.halfHeight + padding,
});

/** 点が矩形の内側（padding 込み）にあるか。方向記号とラベルの衝突判定に使う */
export const isPointInsideOrientedRect = (
  point: LayoutPoint,
  rect: OrientedRect,
  padding = 0,
): boolean => {
  const radians = (rect.angle * Math.PI) / 180;
  const dx = point.x - rect.cx;
  const dy = point.y - rect.cy;
  const localX = dx * Math.cos(radians) + dy * Math.sin(radians);
  const localY = -dx * Math.sin(radians) + dy * Math.cos(radians);

  return (
    Math.abs(localX) <= rect.halfWidth + padding &&
    Math.abs(localY) <= rect.halfHeight + padding
  );
};
