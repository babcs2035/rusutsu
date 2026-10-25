export type PropertySegment = {
  from: number;
  to: number;
  value: "○" | "△" | "×";
};
export function normalizePropertySegments(
  value: unknown,
  allowVariable = true,
): PropertySegment[] {
  if (!Array.isArray(value) || value.length > 100) return [];
  const result: PropertySegment[] = [];
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      !Number.isFinite(item.from) ||
      !Number.isFinite(item.to) ||
      item.from < 0 ||
      item.to > 1 ||
      item.from >= item.to ||
      !["○", "×", ...(allowVariable ? ["△"] : [])].includes(item.value)
    )
      return [];
    result.push({ from: item.from, to: item.to, value: item.value });
  }
  result.sort((a, b) => a.from - b.from);
  if (
    result.some((item, index) => index > 0 && item.from < result[index - 1].to)
  )
    return [];
  return result;
}
export function lineLengthFractions(coordinates: number[][]) {
  const lengths = [0];
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1],
      b = coordinates[i];
    const x = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) * Math.PI) / 360);
    lengths.push(lengths[i - 1] + Math.hypot(x, b[1] - a[1]));
  }
  const total = lengths.at(-1) ?? 0;
  return lengths.map((length, index) =>
    total > 0 ? length / total : index / Math.max(1, coordinates.length - 1),
  );
}
/** Rendering slices only. Input vertices and stored physical geometry never change. */
export function sliceLineByFraction(
  coordinates: number[][],
  from: number,
  to: number,
): number[][] {
  if (coordinates.length < 2) return [];
  const fractions = lineLengthFractions(coordinates);
  const at = (fraction: number) => {
    if (fraction <= 0) return [...coordinates[0]];
    if (fraction >= 1) return [...coordinates[coordinates.length - 1]];
    const end = fractions.findIndex(value => value >= fraction);
    if (end < 1) return [...coordinates[0]];
    const ratio =
      (fraction - fractions[end - 1]) /
      (fractions[end] - fractions[end - 1] || 1);
    return coordinates[end - 1].map(
      (value, index) =>
        value + ((coordinates[end][index] ?? value) - value) * ratio,
    );
  };
  return [
    at(from),
    ...coordinates
      .filter((_, index) => fractions[index] > from && fractions[index] < to)
      .map(value => [...value]),
    at(to),
  ];
}
export function propertyAt(
  segments: PropertySegment[] | undefined,
  fraction: number,
  fallback: string | null,
) {
  return (
    segments?.find(segment => fraction >= segment.from && fraction < segment.to)
      ?.value ?? fallback
  );
}
