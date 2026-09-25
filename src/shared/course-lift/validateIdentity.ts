import { readCourseGrouping } from "./identity";

/** Validate metadata before saving, including before the relational backfill. */
export function validateEntityMetadata(
  entries: { targetSkiId: string; properties: Record<string, unknown> }[],
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const groups = new Map<string, string>();
  const orders = new Set<string>();
  for (const entry of entries) {
    const properties = entry.properties;
    if (!properties || typeof properties !== "object") continue;
    const id = properties.entityId;
    if (id !== undefined) {
      if (typeof id !== "string" || !id || id.length > 1024 || ids.has(id))
        errors.push("線IDが不正または重複しています。");
      else ids.add(id);
    }
    if (properties.courseGrouping == null) continue;
    const group = readCourseGrouping(properties.courseGrouping);
    if (!group) {
      errors.push("コースのまとめ方が不正です。");
      continue;
    }
    const definition = JSON.stringify([
      entry.targetSkiId,
      group.name,
      group.kind,
    ]);
    if (groups.has(group.id) && groups.get(group.id) !== definition)
      errors.push("同じグループの所属・名称・扱いが一致しません。");
    groups.set(group.id, definition);
    const order = `${group.id}:${group.order}`;
    if (orders.has(order)) errors.push("区間番号が重複しています。");
    orders.add(order);
  }
  return errors;
}
