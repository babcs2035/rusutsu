import type { LatestStatusMappingRow } from "../types";

export type NamedGeometry = { id: string; name: string };

/** Keep explicit assignments attached to the edited line, including renames. */
export function reconcileEditedRows(
  rows: LatestStatusMappingRow[],
  before: NamedGeometry[],
  after: NamedGeometry[],
): LatestStatusMappingRow[] {
  const nextById = new Map(after.map(item => [item.id, item.name.trim()]));
  const renamed = new Map<string, string | null>();
  for (const item of before) {
    const name = item.name.trim();
    const remaining = before
      .filter(candidate => candidate.name.trim() === name)
      .map(candidate => nextById.get(candidate.id))
      .filter((value): value is string => !!value);
    // 同名の片方だけを改名・削除した場合、残る線の対応を動かさない。
    renamed.set(
      name,
      remaining.includes(name)
        ? name
        : remaining.length === 1
          ? remaining[0]
          : null,
    );
  }
  const names = new Set(after.map(item => item.name.trim()).filter(Boolean));
  const result = rows
    .map(row => {
      if (!row.geojsonName) return row;
      const nextName = renamed.has(row.geojsonName)
        ? renamed.get(row.geojsonName)
        : row.geojsonName;
      return {
        ...row,
        geojsonName: nextName && names.has(nextName) ? nextName : null,
      };
    })
    .filter(row => row.crawledName || row.geojsonName);
  const assigned = new Set(result.map(row => row.geojsonName));
  for (const name of names) {
    if (!assigned.has(name))
      result.push({ crawledName: null, geojsonName: name });
  }
  return result;
}
