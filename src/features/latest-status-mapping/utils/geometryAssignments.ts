import type { LatestStatusMappingRow } from "../types";
import type { NamedGeometry } from "./editedRows";
import { assignGeojsonName } from "./rows";

export type GeometryAssignments = Record<string, string | null>;

export function duplicateGeometryNames(geometries: NamedGeometry[]): string[] {
  const counts = new Map<string, number>();
  for (const { name } of geometries) {
    const key = name.trim();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([name]) => name);
}

export function geometryAssignmentsFromRows(
  rows: LatestStatusMappingRow[],
  geometries: NamedGeometry[],
): GeometryAssignments {
  const byName = new Map(rows.map(row => [row.geojsonName, row.crawledName]));
  return Object.fromEntries(
    geometries.map(item => [item.id, byName.get(item.name.trim()) ?? null]),
  );
}

/** 同名の線を区別できる間はIDで保持し、一意な名前だけ対応表へ反映する。 */
export function applyGeometryAssignments(
  rows: LatestStatusMappingRow[],
  geometries: NamedGeometry[],
  assignments: GeometryAssignments,
): LatestStatusMappingRow[] {
  const duplicates = new Set(duplicateGeometryNames(geometries));
  return geometries.reduce((result, item) => {
    const name = item.name.trim();
    if (!name || duplicates.has(name) || !Object.hasOwn(assignments, item.id))
      return result;
    const current = result.filter(row => row.geojsonName === name);
    if (current.length === 1 && current[0].crawledName === assignments[item.id])
      return result;
    return assignGeojsonName(result, name, assignments[item.id]);
  }, rows);
}
