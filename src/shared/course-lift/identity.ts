/** Stored inside GeoJSON too, so exports keep identity and grouping. */
export type CourseGrouping = {
  id: string;
  name: string;
  kind: "continuous" | "routes";
  order: number;
};
export const featureIdentity = (
  properties: Record<string, unknown> | null,
  documentKey: string,
  index: number,
): string =>
  typeof properties?.entityId === "string" && properties.entityId
    ? properties.entityId
    : `legacy:${encodeURIComponent(documentKey)}:${index}`;

export function readCourseGrouping(value: unknown): CourseGrouping | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== "string" ||
    !v.id ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    (v.kind !== "continuous" && v.kind !== "routes") ||
    !Number.isSafeInteger(v.order) ||
    Number(v.order) < 1
  )
    return null;
  return { id: v.id, name: v.name, kind: v.kind, order: Number(v.order) };
}

/** Only _# means grouping. Plain _ and numeric suffixes remain independent. */
export function legacyCourseGrouping(
  name: string,
  scope: string,
): CourseGrouping | null {
  const match = /^(.*)_#(上部|中部\d*|下部|\d+部)$/u.exec(name);
  if (!match?.[1]) return null;
  const section = match[2];
  const number = /^(\d+)部$/u.exec(section);
  const order = number
    ? Number(number[1])
    : section === "上部"
      ? 1
      : section === "下部"
        ? 10000
        : 2 + Number(section.slice(2) || 0);
  return {
    id: `group:${encodeURIComponent(scope)}:${encodeURIComponent(match[1])}`,
    name: match[1],
    kind: "continuous",
    order,
  };
}
