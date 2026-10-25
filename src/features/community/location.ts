export type CourseGeometryOption = {
  id: string;
  coordinates: number[][];
  lines?: number[][][];
};

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

export function nearestCourseId(
  point: [number, number],
  courses: CourseGeometryOption[],
) {
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
  return nearest?.id ?? null;
}
