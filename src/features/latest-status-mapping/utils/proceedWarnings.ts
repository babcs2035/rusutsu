import type { LatestStatusMappingState } from "../hooks/useLatestStatusMapping";
import type { NamedGeometry } from "./editedRows";
import { hasMappingNameOverlap } from "./rows";

export function mappingProceedWarnings(
  items: NamedGeometry[],
  mapping: Pick<
    LatestStatusMappingState,
    "crawledNameByGeometryId" | "crawledNameByGeojsonName"
  >,
): string[] {
  return items.flatMap((item, index) => {
    const name = item.name.trim();
    const label = name || `${index + 1} 番目（名前なし）`;
    const crawledName = mapping.crawledNameByGeometryId.has(item.id)
      ? mapping.crawledNameByGeometryId.get(item.id)
      : mapping.crawledNameByGeojsonName.get(name);
    if (!crawledName) return [`${label}：クローラーの対応がありません。`];
    if (!hasMappingNameOverlap(name, crawledName)) {
      return [`${label} → ${crawledName}：名前に共通部分がありません。`];
    }
    return [];
  });
}
