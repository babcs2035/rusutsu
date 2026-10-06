import {
  calculateCoordinateSlopes,
  type FinalizedCourseFeature,
  type GeoCoordinate,
} from "@/lib/finalizedResortGeojsonShared";

export const RECOMMENDATION = {
  version: 2,
  binDegrees: 3,
  bins: 16,
  slopeNormalization: 18,
  distanceRatio: 3,
  steepSlopeNormalization: 12,
  steepWindowMeters: 50,
  steepFraction: 0.8,
  steepSlopeWeight: 0.5,
  steepDistanceWeight: 0.25,
  slopeWeight: 0.15,
  distanceWeight: 0.1,
  gradeA: 80,
  gradeB: 60,
  limit: 3,
  sampleMeters: 10,
  maximumInputGap: 100,
  maximumJoinGap: 15,
  minimumDistance: 40,
  curveWindow: 50,
  curveAngle: 45,
  curveSeparation: 75,
  minimumCurves: 3,
  minimumCurvesPerKm: 2,
} as const;
export type Grooming = "groomed" | "partial" | "ungroomed" | "unknown";
export type CourseFeature = {
  resortId: string;
  key: string;
  groupId: string;
  courseIds: string[];
  name: string;
  routeKey: string | null;
  histogram: number[];
  cumulative: number[];
  distance: number;
  logDistance: number;
  meanSlope: number;
  steepSlope: number;
  steepDistance: number;
  shape: "normal" | "winding";
  grooming: Grooming;
};
export const hasCourseName = (name: unknown): name is string =>
  typeof name === "string" &&
  !!name.trim() &&
  !/^(?:名前不明|名称不明|無名|unnamed|unknown)(?:$|[_\s＃#])/iu.test(
    name.trim(),
  );
export const routeNumber = (key: string | undefined): number | null => {
  const match = key && /:route:(\d+)$/u.exec(key);
  const value = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
};
/** A list selects a whole group; explicitly request its main route, never a mixture. */
export function recommendationSelection(
  groupId: string,
  courses: FinalizedCourseFeature[],
) {
  if (!courses.length || courses.some(c => c.recommendationGroupingInvalid))
    return null;
  if (!courses.some(c => c.groupKind === "routes"))
    return { kind: "course" as const, id: groupId };
  if (
    courses.some(
      c => c.groupKind !== "routes" || routeNumber(c.routeKey) === null,
    )
  )
    return null;
  const main = Math.min(...courses.map(c => routeNumber(c.routeKey) as number));
  const keys = new Set(
    courses.filter(c => routeNumber(c.routeKey) === main).map(c => c.routeKey),
  );
  if (keys.size !== 1) return null;
  return { kind: "course" as const, id: groupId, routeId: [...keys][0] };
}

export function aggregateGrooming(symbols: Array<string | null>): Grooming {
  const known = new Set(
    symbols.filter(s => s === "○" || s === "△" || s === "×"),
  );
  if (known.has("△") || (known.has("○") && known.has("×"))) return "partial";
  // Missing sections do not imply that the whole course is definitively groomed/ungroomed.
  if (symbols.some(s => s !== "○" && s !== "△" && s !== "×")) return "unknown";
  return known.has("○") ? "groomed" : known.has("×") ? "ungroomed" : "unknown";
}
export const groomingCompatible = (a: Grooming, b: Grooming) =>
  !(a === "groomed" && b === "ungroomed") &&
  !(a === "ungroomed" && b === "groomed");

export function horizontalDistance(a: GeoCoordinate, b: GeoCoordinate) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 +
    Math.cos(a[1] * rad) *
      Math.cos(b[1] * rad) *
      Math.sin(((b[0] - a[0]) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
const finiteCoordinate = (c: GeoCoordinate) =>
  c.length === 3 &&
  c.every(Number.isFinite) &&
  Math.abs(c[0]) <= 180 &&
  Math.abs(c[1]) <= 85;
const downhill = (coordinates: GeoCoordinate[]) =>
  (coordinates[0][2] as number) >= (coordinates.at(-1)?.[2] as number)
    ? coordinates
    : [...coordinates].reverse();

/** Regular distance sampling makes both slope and curve windows independent of source point density. */
export function resample(
  coordinates: GeoCoordinate[],
  spacing: number,
): GeoCoordinate[] {
  const distances = [0];
  for (let i = 1; i < coordinates.length; i++)
    distances.push(
      distances[i - 1] + horizontalDistance(coordinates[i - 1], coordinates[i]),
    );
  const total = distances.at(-1) ?? 0;
  const points: GeoCoordinate[] = [];
  let segment = 1;
  for (let d = 0; d < total; d += spacing) {
    while (segment < distances.length - 1 && distances[segment] < d) segment++;
    const a = coordinates[segment - 1],
      b = coordinates[segment];
    const length = distances[segment] - distances[segment - 1];
    const t = length > 0 ? (d - distances[segment - 1]) / length : 0;
    points.push([
      a[0] + t * (b[0] - a[0]),
      a[1] + t * (b[1] - a[1]),
      (a[2] as number) + t * ((b[2] as number) - (a[2] as number)),
    ]);
  }
  points.push(coordinates[coordinates.length - 1]);
  return points;
}
export function classifyShape(
  coordinates: GeoCoordinate[],
): "normal" | "winding" {
  const points = resample(coordinates, RECOMMENDATION.sampleMeters);
  const radius = RECOMMENDATION.curveWindow / RECOMMENDATION.sampleMeters;
  const events: Array<{ distance: number; angle: number }> = [];
  for (let i = radius; i < points.length - radius; i++) {
    const a = points[i - radius],
      b = points[i],
      c = points[i + radius];
    const scale = Math.cos((b[1] * Math.PI) / 180);
    const x1 = (b[0] - a[0]) * scale,
      y1 = b[1] - a[1];
    const x2 = (c[0] - b[0]) * scale,
      y2 = c[1] - b[1];
    const norm = Math.hypot(x1, y1) * Math.hypot(x2, y2);
    if (norm === 0) continue;
    const angle =
      (Math.acos(Math.min(1, Math.max(-1, (x1 * x2 + y1 * y2) / norm))) * 180) /
      Math.PI;
    if (angle >= RECOMMENDATION.curveAngle)
      events.push({ distance: i * RECOMMENDATION.sampleMeters, angle });
  }
  // Local maxima + non-maximum suppression prevent one broad turn counting several times.
  const selected: typeof events = [];
  for (const event of events.sort(
    (a, b) => b.angle - a.angle || a.distance - b.distance,
  ))
    if (
      selected.every(
        other =>
          Math.abs(other.distance - event.distance) >=
          RECOMMENDATION.curveSeparation,
      )
    )
      selected.push(event);
  const length = points
    .slice(1)
    .reduce((sum, p, i) => sum + horizontalDistance(points[i], p), 0);
  return selected.length >= RECOMMENDATION.minimumCurves &&
    selected.length / (length / 1000) >= RECOMMENDATION.minimumCurvesPerKm
    ? "winding"
    : "normal";
}
export const slopeBin = (slope: number) =>
  Math.min(15, Math.max(0, Math.floor(slope / 3)));

/** Maximum distance-weighted slope over a continuous 50m of sliding distance.
 * Checking every segment boundary and boundary minus the window finds the
 * exact maximum of the piecewise-linear moving integral, including both ends.
 */
export function steepTerrain(
  segments: Array<{ slope: number; length: number }>,
) {
  const distances = [0],
    integrals = [0];
  const positive = segments.filter(s => s.length > 0);
  for (const { slope, length } of positive) {
    distances.push(distances[distances.length - 1] + length);
    integrals.push(
      integrals[integrals.length - 1] + Math.max(0, slope) * length,
    );
  }
  const total = distances[distances.length - 1];
  if (!total) return { steepSlope: 0, steepDistance: 0 };
  const window = Math.min(RECOMMENDATION.steepWindowMeters, total);
  const integralAt = (d: number) => {
    let left = 0,
      right = positive.length;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (distances[mid + 1] < d) left = mid + 1;
      else right = mid;
    }
    if (left === positive.length) return integrals[left];
    return (
      integrals[left] +
      (d - distances[left]) * Math.max(0, positive[left].slope)
    );
  };
  let steepSlope = 0;
  for (const boundary of distances)
    for (const start of [boundary, boundary - window]) {
      const clamped = Math.min(total - window, Math.max(0, start));
      steepSlope = Math.max(
        steepSlope,
        (integralAt(clamped + window) - integralAt(clamped)) / window,
      );
    }
  const steepDistance =
    steepSlope > 0
      ? positive.reduce(
          (sum, segment) =>
            sum +
            (segment.slope >= steepSlope * RECOMMENDATION.steepFraction
              ? segment.length
              : 0),
          0,
        )
      : 0;
  return { steepSlope, steepDistance };
}

function connect(courses: FinalizedCourseFeature[]): GeoCoordinate[] | null {
  if (
    courses.some(
      course =>
        course.coordinates.length < 2 ||
        !course.coordinates.every(finiteCoordinate) ||
        course.coordinateDataInvalid,
    )
  )
    return null;
  const order = (course: FinalizedCourseFeature) =>
    course.sectionOrder ??
    { 上部: 1, 中部: 2, 下部: 3 }[course.sectionName ?? ""];
  if (
    courses.length > 1 &&
    (courses.some(c => !Number.isSafeInteger(order(c))) ||
      new Set(courses.map(order)).size !== courses.length)
  )
    return null;
  const sorted = [...courses].sort((a, b) => (order(a) ?? 0) - (order(b) ?? 0));
  const joined: GeoCoordinate[] = [];
  for (const course of sorted) {
    const points = downhill(course.coordinates);
    if (
      points
        .slice(1)
        .some(
          (p, i) =>
            horizontalDistance(points[i], p) > RECOMMENDATION.maximumInputGap,
        )
    )
      return null;
    const last = joined.at(-1);
    if (last) {
      if (
        horizontalDistance(last, points[0]) > RECOMMENDATION.maximumJoinGap ||
        Math.abs((last[2] as number) - (points[0][2] as number)) > 5
      )
        return null;
      if (
        horizontalDistance(last, points[0]) < 0.1 &&
        Math.abs((last[2] as number) - (points[0][2] as number)) < 0.1
      )
        joined.pop();
    }
    joined.push(...points);
  }
  return joined;
}

/** Main routes only, on both sides of a query. Missing values never enter a zero-degree bin. */
export function extractCourseFeatures(
  resortId: string,
  courses: FinalizedCourseFeature[],
): CourseFeature[] {
  const groups = new Map<string, FinalizedCourseFeature[]>();
  for (const course of courses)
    groups.set(course.groupId, [...(groups.get(course.groupId) ?? []), course]);
  const output: CourseFeature[] = [];
  for (const [groupId, all] of groups) {
    if (
      all.some(
        c =>
          !hasCourseName(c.name) ||
          !hasCourseName(c.originalName ?? c.name) ||
          !hasCourseName(c.displayName) ||
          c.recommendationGroupingInvalid,
      )
    )
      continue;
    let chosen = all;
    let routeKey: string | null = null;
    if (all.some(c => c.groupKind === "routes")) {
      if (
        all.some(
          c => c.groupKind !== "routes" || routeNumber(c.routeKey) === null,
        )
      )
        continue;
      const main = Math.min(...all.map(c => routeNumber(c.routeKey) as number));
      const keys = new Set(
        all.filter(c => routeNumber(c.routeKey) === main).map(c => c.routeKey),
      );
      if (keys.size !== 1) continue;
      routeKey = [...keys][0] ?? null;
      chosen = all.filter(c => c.routeKey === routeKey);
    }
    if (new Set(chosen.map(c => c.displayName)).size !== 1) continue;
    const coordinates = connect(chosen);
    if (!coordinates) continue;
    const samples = resample(coordinates, RECOMMENDATION.sampleMeters);
    if (samples.length < 2) continue;
    const slopes = calculateCoordinateSlopes(samples);
    const histogram = Array<number>(16).fill(0);
    const segments: Array<{ slope: number; length: number }> = [];
    let distance = 0,
      meanSlope = 0;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1],
        b = samples[i];
      const slope = ((slopes[i - 1] ?? NaN) + (slopes[i] ?? NaN)) / 2;
      const length = Math.hypot(
        horizontalDistance(a, b),
        (a[2] as number) - (b[2] as number),
      );
      if (!Number.isFinite(slope) || !Number.isFinite(length)) {
        distance = NaN;
        break;
      }
      histogram[slopeBin(slope)] += length;
      segments.push({ slope, length });
      meanSlope += Math.max(0, slope) * length;
      distance += length;
    }
    if (!Number.isFinite(distance) || distance < RECOMMENDATION.minimumDistance)
      continue;
    const terrain = steepTerrain(segments);
    if (
      !Number.isFinite(terrain.steepSlope) ||
      !Number.isFinite(terrain.steepDistance)
    )
      continue;
    for (let i = 0; i < histogram.length; i++) histogram[i] /= distance;
    let cumulativeSum = 0;
    output.push({
      resortId,
      key: routeKey ?? groupId,
      groupId,
      courseIds: chosen.map(c => c.id).sort(),
      name: chosen[0].displayName,
      routeKey,
      histogram,
      cumulative: histogram.map(p => (cumulativeSum += p)),
      distance,
      logDistance: Math.log(distance),
      meanSlope: meanSlope / distance,
      ...terrain,
      shape: classifyShape(samples),
      grooming: aggregateGrooming(chosen.map(c => c.properties.piste)),
    });
  }
  return output;
}

export function wasserstein(a: readonly number[], b: readonly number[]) {
  let sumA = 0,
    sumB = 0,
    distance = 0;
  // 15 finite intervals; the final >=45 bin contributes no infinite tail.
  for (let i = 0; i < 15; i++) {
    sumA += a[i];
    sumB += b[i];
    distance += 3 * Math.abs(sumA - sumB);
  }
  return distance;
}
export function similarity(a: CourseFeature, b: CourseFeature) {
  const slopeDifference = Math.min(
    1,
    wasserstein(a.histogram, b.histogram) / RECOMMENDATION.slopeNormalization,
  );
  const lengthDifference = Math.min(
    1,
    Math.abs(a.logDistance - b.logDistance) /
      Math.log(RECOMMENDATION.distanceRatio),
  );
  const steepSlopeDifference = Math.min(
    1,
    Math.abs(a.steepSlope - b.steepSlope) /
      RECOMMENDATION.steepSlopeNormalization,
  );
  // A 50m offset makes zero-length steep terrain comparable without log(0),
  // and prevents tiny near-flat patches from dominating the length penalty.
  const steepDistanceDifference = Math.min(
    1,
    Math.abs(
      Math.log(
        (a.steepDistance + RECOMMENDATION.steepWindowMeters) /
          (b.steepDistance + RECOMMENDATION.steepWindowMeters),
      ),
    ) / Math.log(RECOMMENDATION.distanceRatio),
  );
  const score =
    100 *
    (RECOMMENDATION.steepSlopeWeight * (1 - steepSlopeDifference) +
      RECOMMENDATION.steepDistanceWeight * (1 - steepDistanceDifference) +
      RECOMMENDATION.slopeWeight * (1 - slopeDifference) +
      RECOMMENDATION.distanceWeight * (1 - lengthDifference));
  return {
    score,
    steepSlopeDifference,
    steepDistanceDifference,
    slopeDifference,
    lengthDifference,
  };
}
export function recommendationGrade(score: number) {
  if (score >= RECOMMENDATION.gradeA)
    return { grade: "A", label: "近い" } as const;
  if (score >= RECOMMENDATION.gradeB)
    return { grade: "B", label: "やや近い" } as const;
  return { grade: "C", label: "違いが大きい" } as const;
}
export type RecommendationCandidate = CourseFeature & {
  geometryHash: string;
  resortName: string;
};
export function rankCourses(
  source: CourseFeature & { geometryHash: string },
  candidates: RecommendationCandidate[],
) {
  const seen = new Set<string>([source.geometryHash]);
  const priority = (candidate: RecommendationCandidate) =>
    Number(!groomingCompatible(source.grooming, candidate.grooming)) * 2 +
    Number(candidate.shape !== source.shape);
  return candidates
    .filter(
      c =>
        c.resortId !== source.resortId &&
        c.geometryHash !== source.geometryHash,
    )
    .map(course => ({ ...course, ...similarity(source, course) }))
    .sort(
      (a, b) =>
        priority(a) - priority(b) ||
        b.score - a.score ||
        a.resortId.localeCompare(b.resortId, "en") ||
        a.key.localeCompare(b.key, "en"),
    )
    .filter(course => {
      if (seen.has(course.geometryHash)) return false;
      seen.add(course.geometryHash);
      return true;
    })
    .slice(0, RECOMMENDATION.limit);
}
