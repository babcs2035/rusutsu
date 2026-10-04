import type { SaveLatestStatusMappingRequest } from "@/features/latest-status-mapping/types";

type NamedItem = { targetSkiId: string; properties: Record<string, unknown> };

/** 線の名前を変えたとき、営業情報との対応表も同じ線を指し続けるようにする。 */
export function renameMappedGeometry(
  mapping: SaveLatestStatusMappingRequest,
  resortId: string,
  id: string,
  previousItems: NamedItem[],
  nextItems: NamedItem[],
  oldName: unknown,
  newName: string,
): SaveLatestStatusMappingRequest {
  const uniqueName =
    previousItems.filter(item => item.properties.name === oldName).length === 1;
  return {
    ...mapping,
    rows: mapping.rows.map(row =>
      row.geometryId === id ||
      (!row.geometryId && uniqueName && row.geojsonName === oldName)
        ? { ...row, geojsonName: newName }
        : row,
    ),
    ...(mapping.geometries && {
      geometries: mapping.geometries.map(line =>
        line.id === id ? { ...line, name: newName } : line,
      ),
    }),
    ...(mapping.geojsonNames && {
      geojsonNames: nextItems
        .filter(item => item.targetSkiId === resortId)
        .map(item => String(item.properties.name ?? ""))
        .filter(Boolean),
    }),
  };
}
