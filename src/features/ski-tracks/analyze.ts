import { nearestFeature } from "@/features/community/location";
import type { TrackAnalysis, TrackCourse } from "./contract";
import type { SkizParseResult } from "./parseSkiz";

export type MatchingCourse = {
  id: string;
  name: string;
  resortId: string;
  resortName: string;
  coordinates: number[][];
  lines?: number[][][];
};

export function distanceMeters(a: number[], b: number[]) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function nearbyResortIds(
  track: SkizParseResult,
  resorts: { id: string; longitude: number; latitude: number }[],
) {
  let cursor = 0;
  const samples = track.segments
    .filter(segment => segment.type === "ski_run")
    .flatMap(segment => {
      const midpoint = (segment.start + segment.end) / 2;
      while (cursor < track.nodes.length && track.nodes[cursor].time < midpoint)
        cursor++;
      const node = track.nodes[cursor];
      return node && node.time <= segment.end
        ? [[node.longitude, node.latitude]]
        : [];
    });
  return resorts
    .map(resort => ({
      id: resort.id,
      distance: samples.reduce(
        (minimum, point) =>
          Math.min(
            minimum,
            distanceMeters(point, [resort.longitude, resort.latitude]),
          ),
        Infinity,
      ),
    }))
    .filter(candidate => candidate.distance < 15_000)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6)
    .map(candidate => candidate.id);
}

/** Only recorded downhill intervals count. Ambiguous parallel courses stay unmatched. */
export function analyzeTrack(
  track: SkizParseResult,
  geometry: MatchingCourse[],
): TrackAnalysis {
  // A named course can have multiple sections or map sources. Count it once
  // within each resort, and do not give unnamed map lines a false identity.
  const named = new Map<string, MatchingCourse>();
  for (const course of geometry) {
    const name = course.name.normalize("NFKC").trim();
    if (!name || /^(名前不明|無名)(_|$)/u.test(name)) continue;
    const id = JSON.stringify([course.resortId, name]);
    const existing = named.get(id);
    const lines = course.lines ?? [course.coordinates];
    if (existing) existing.lines?.push(...lines);
    else named.set(id, { ...course, id, lines: [...lines] });
  }
  const courses = [...named.values()];
  const ski = track.segments.filter(segment => segment.type === "ski_run");
  const lifts = track.segments.filter(segment => segment.type === "lift");
  const bounded = courses.map(course => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const line of course.lines ?? [course.coordinates]) {
      for (const coordinate of line) {
        minX = Math.min(minX, coordinate[0]);
        maxX = Math.max(maxX, coordinate[0]);
        minY = Math.min(minY, coordinate[1]);
        maxY = Math.max(maxY, coordinate[1]);
      }
    }
    return { course, minX, minY, maxX, maxY };
  });
  const total = new Map<string, TrackCourse>();
  let gpsDistance = 0;
  let maxSpeed = 0;
  let cursor = 0;
  const segments = ski.map(run => {
    while (cursor < track.nodes.length && track.nodes[cursor].time < run.start)
      cursor++;
    const hits = new Map<string, { distance: number; edges: number }>();
    for (let i = cursor + 1; i < track.nodes.length; i++) {
      const a = track.nodes[i - 1];
      const b = track.nodes[i];
      if (b.time > run.end) break;
      const seconds = (b.time - a.time) / 1000;
      const distance = distanceMeters(
        [a.longitude, a.latitude],
        [b.longitude, b.latitude],
      );
      if (seconds <= 0 || seconds > 20 || distance / seconds > 55) continue;
      if (distance < 2) continue;
      for (const speed of [a.speed, b.speed]) {
        if (speed >= 0 && speed <= 55 && speed <= (distance / seconds) * 2 + 3)
          maxSpeed = Math.max(maxSpeed, speed);
      }
      gpsDistance += distance;
      const point: [number, number] = [
        (a.longitude + b.longitude) / 2,
        (a.latitude + b.latitude) / 2,
      ];
      const latitudeMargin = 70 / 111000;
      const longitudeMargin =
        latitudeMargin / Math.max(0.01, Math.cos((point[1] * Math.PI) / 180));
      const nearby = bounded
        .filter(
          bounds =>
            point[0] >= bounds.minX - longitudeMargin &&
            point[0] <= bounds.maxX + longitudeMargin &&
            point[1] >= bounds.minY - latitudeMargin &&
            point[1] <= bounds.maxY + latitudeMargin,
        )
        .map(bounds => bounds.course);
      const nearest = nearestFeature(point, nearby);
      if (!nearest || nearest.distanceMeters > 45) continue;
      const second = nearestFeature(
        point,
        nearby.filter(course => course.id !== nearest.id),
      );
      if (second && second.distanceMeters - nearest.distanceMeters < 8)
        continue;
      const course = nearby.find(course => course.id === nearest.id);
      if (!course) continue;
      const start = nearestFeature([a.longitude, a.latitude], [course]);
      const end = nearestFeature([b.longitude, b.latitude], [course]);
      if (
        !start ||
        !end ||
        Math.max(start.distanceMeters, end.distanceMeters) > 60
      )
        continue;
      const hit = hits.get(course.id) ?? { distance: 0, edges: 0 };
      hit.distance += distance;
      hit.edges++;
      hits.set(course.id, hit);
    }
    const names: string[] = [];
    for (const [id, hit] of hits) {
      // Crossing an intersection is not a course traversal.
      if (hit.distance < 100 || hit.edges < 3) continue;
      const course = courses.find(course => course.id === id);
      if (!course) continue;
      const row = total.get(id) ?? {
        id,
        resortId: course.resortId,
        resortName: course.resortName,
        name: course.name,
        passes: 0,
        distance: 0,
      };
      row.passes++;
      row.distance += hit.distance;
      total.set(id, row);
      names.push(course.name);
    }
    return {
      sequence: run.sequence,
      start: run.start,
      end: run.end,
      distance: run.distance,
      vertical: Math.abs(run.verticalChange),
      courses: names,
    };
  });
  const matched = [...total.values()].sort(
    (a, b) => b.passes - a.passes || b.distance - a.distance,
  );
  return {
    version: 1,
    name: track.metadata.name,
    declaredResort: track.metadata.resort,
    start: track.metadata.start,
    finish: track.metadata.finish,
    runs: ski.length,
    lifts: lifts.length,
    distance: ski.reduce((sum, run) => sum + run.distance, 0),
    vertical: ski.reduce((sum, run) => sum + Math.abs(run.verticalChange), 0),
    skiSeconds: ski.reduce((sum, run) => sum + run.durationSeconds, 0),
    liftSeconds: lifts.reduce((sum, run) => sum + run.durationSeconds, 0),
    maxSpeed: maxSpeed * 3.6,
    gpsDistance,
    matchedDistance: matched.reduce((sum, course) => sum + course.distance, 0),
    courses: matched,
    segments,
  };
}
