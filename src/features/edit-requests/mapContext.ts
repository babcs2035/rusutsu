export type RequestCourseLine = {
  name: string;
  coordinates: Array<[number, number]>;
};

function validLine(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return [];
  const points = value.flatMap(point =>
    Array.isArray(point) &&
    point.length >= 2 &&
    typeof point[0] === "number" &&
    typeof point[1] === "number" &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1])
      ? [[point[0], point[1]] as [number, number]]
      : [],
  );
  if (points.length <= 400) return points;
  return Array.from(
    { length: 400 },
    (_, index) => points[Math.round((index * (points.length - 1)) / 399)],
  );
}

export function courseLinesFromDocuments(
  documents: Array<{ content: string }>,
): RequestCourseLine[] {
  const lines: RequestCourseLine[] = [];
  for (const document of documents) {
    try {
      const parsed = JSON.parse(document.content) as {
        features?: Array<{
          properties?: { name?: unknown } | null;
          geometry?: { type?: string; coordinates?: unknown } | null;
        }>;
      };
      for (const feature of parsed.features ?? []) {
        const name =
          typeof feature.properties?.name === "string"
            ? feature.properties.name
            : "名称未設定のコース";
        const geometry = feature.geometry;
        const rawLines =
          geometry?.type === "LineString"
            ? [geometry.coordinates]
            : geometry?.type === "MultiLineString" &&
                Array.isArray(geometry.coordinates)
              ? geometry.coordinates
              : [];
        for (const rawLine of rawLines) {
          const coordinates = validLine(rawLine);
          if (coordinates.length >= 2) lines.push({ name, coordinates });
          if (lines.length >= 2000) return lines;
        }
      }
    } catch {
      // A malformed optional course layer must not hide the review itself.
    }
  }
  return lines;
}
