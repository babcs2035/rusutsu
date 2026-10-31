export type CourseGeometryOption = {
  id: string;
  coordinates: number[][];
  lines?: number[][][];
};

export const MAX_REPORT_DISTANCE_METERS = 500;
const METERS_PER_DEGREE = (Math.PI * 6371008.8) / 180;
const DISTANCE_EPSILON = 0.000001;

function distanceToSegmentSquared(
  point: [number, number],
  start: number[],
  end: number[],
) {
  const latitudeScale = Math.cos((point[1] * Math.PI) / 180);
  const x = (longitude: number) => longitude * latitudeScale;
  const px = x(point[0]);
  const py = point[1];
  const ax = x(start[0]);
  const ay = start[1];
  const bx = x(end[0]);
  const by = end[1];
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const along =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared),
        );
  const nearestX = ax + along * dx;
  const nearestY = ay + along * dy;
  return (px - nearestX) ** 2 + (py - nearestY) ** 2;
}

export function nearestFeature(
  point: [number, number],
  courses: CourseGeometryOption[],
) {
  if (
    !point.every(Number.isFinite) ||
    Math.abs(point[0]) > 180 ||
    Math.abs(point[1]) > 90
  )
    return null;
  let nearest: { id: string; distance: number } | null = null;
  for (const course of courses) {
    const lines = course.lines?.length ? course.lines : [course.coordinates];
    for (const line of lines) {
      if (line.length === 1) {
        if (
          line[0].length < 2 ||
          !Number.isFinite(line[0][0]) ||
          !Number.isFinite(line[0][1])
        )
          continue;
        const distance = distanceToSegmentSquared(point, line[0], line[0]);
        if (!nearest || distance < nearest.distance)
          nearest = { id: course.id, distance };
      }
      for (let index = 1; index < line.length; index++) {
        const start = line[index - 1];
        const end = line[index];
        if (
          start.length < 2 ||
          end.length < 2 ||
          !Number.isFinite(start[0]) ||
          !Number.isFinite(start[1]) ||
          !Number.isFinite(end[0]) ||
          !Number.isFinite(end[1])
        )
          continue;
        const distance = distanceToSegmentSquared(point, start, end);
        if (!nearest || distance < nearest.distance)
          nearest = { id: course.id, distance };
      }
    }
  }
  return nearest
    ? {
        id: nearest.id,
        distanceMeters: Math.sqrt(nearest.distance) * METERS_PER_DEGREE,
      }
    : null;
}

export function nearestCourseId(
  point: [number, number],
  courses: CourseGeometryOption[],
  maxDistanceMeters = MAX_REPORT_DISTANCE_METERS,
) {
  const nearest = nearestFeature(point, courses);
  return nearest &&
    nearest.distanceMeters <= maxDistanceMeters + DISTANCE_EPSILON
    ? nearest.id
    : null;
}

export function reportLocationError(
  point: [number, number],
  data: { courses: CourseGeometryOption[]; lifts: CourseGeometryOption[] },
) {
  const nearest = nearestFeature(point, [...data.courses, ...data.lifts]);
  if (!nearest)
    return "地図情報を取得できないため場所を確認できません。時間を置いて再度お試しください。";
  return nearest.distanceMeters > MAX_REPORT_DISTANCE_METERS + DISTANCE_EPSILON
    ? "場所がコースマップから500mより離れています。地図で場所を修正してください。"
    : null;
}
