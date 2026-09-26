import type { LatestStatusMappingRow } from "../types";
import { rowCrawledNames, withCrawledNames } from "./aliases";
import type { NamedGeometry } from "./editedRows";
import { assignGeojsonName } from "./rows";

export type GeometryAssignments = Record<string, string | null>;

/** 分割で新しく作られた線に、分割元の現在の対応（明示的な未対応も含む）を渡す。 */
export function splitGeometryAssignments(
  source: NamedGeometry,
  before: NamedGeometry[],
  after: NamedGeometry[],
  byId: Map<string, string | null>,
  byName: Map<string, string>,
): GeometryAssignments {
  const crawledName = byId.has(source.id)
    ? (byId.get(source.id) ?? null)
    : (byName.get(source.name.trim()) ?? null);
  const previousIds = new Set(before.map(item => item.id));
  return Object.fromEntries(
    after
      .filter(item => !previousIds.has(item.id))
      .map(item => [item.id, crawledName]),
  );
}

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
  const byName = new Map(
    rows
      .filter(row => !row.geometryId)
      .map(row => [row.geojsonName, row.crawledName]),
  );
  const byId = new Map(
    rows
      .filter(row => row.geometryId)
      .map(row => [row.geometryId, row.crawledName]),
  );
  return Object.fromEntries(
    geometries.map(item => [
      item.id,
      byId.has(item.id)
        ? (byId.get(item.id) ?? null)
        : (byName.get(item.name.trim()) ?? null),
    ]),
  );
}

/** 同名の線を区別できる間はIDで保持し、一意な名前だけ対応表へ反映する。 */
export function applyGeometryAssignments(
  rows: LatestStatusMappingRow[],
  geometries: NamedGeometry[],
  assignments: GeometryAssignments,
  useIds = false,
): LatestStatusMappingRow[] {
  if (useIds) {
    const currentIds = new Set(geometries.map(item => item.id));
    const currentNames = new Set(geometries.map(item => item.name.trim()));
    const prior = geometryAssignmentsFromRows(rows, geometries);
    const assignedRows = geometries.map(item => {
      const previous =
        rows.find(row => row.geometryId === item.id) ??
        rows.find(
          row => !row.geometryId && row.geojsonName === item.name.trim(),
        );
      const primary = Object.hasOwn(assignments, item.id)
        ? assignments[item.id]
        : prior[item.id];
      return withCrawledNames(
        {
          geometryId: item.id,
          geojsonName: item.name.trim() || null,
          crawledName: primary,
        },
        primary
          ? [primary, ...(previous ? rowCrawledNames(previous) : [])]
          : [],
      );
    });
    const used = new Set(assignedRows.flatMap(rowCrawledNames));
    return [
      ...rows.filter(row =>
        row.geometryId
          ? !currentIds.has(row.geometryId)
          : row.geojsonName
            ? !currentNames.has(row.geojsonName)
            : !!row.crawledName && !used.has(row.crawledName),
      ),
      ...assignedRows,
    ];
  }
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
