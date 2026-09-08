import { reorderItemsByNameOrder } from "@/features/slope/utils/courseOrder";
import type { EditorLift } from "../types";

// 所属外・削除予定のリフトは元の位置に残し、表示中のリフトだけを並べる。
export const reorderVisibleLifts = (
  lifts: EditorLift[],
  orderedIds: string[],
): EditorLift[] => {
  const byId = new Map(lifts.map(lift => [lift.id, lift]));
  const visibleIds = new Set(orderedIds);
  const ordered = orderedIds.flatMap(id => {
    const lift = byId.get(id);
    return lift ? [lift] : [];
  });
  let cursor = 0;
  return lifts.map(lift =>
    visibleIds.has(lift.id) ? ordered[cursor++] : lift,
  );
};

export const reorderLiftsByCrawlerOrder = (
  lifts: EditorLift[],
  visibleIds: string[],
  orderedNames: string[],
): EditorLift[] => {
  const visible = new Set(visibleIds);
  const ordered = reorderItemsByNameOrder(
    lifts.filter(lift => visible.has(lift.id)),
    orderedNames,
    lift => lift.name,
  );
  return reorderVisibleLifts(
    lifts,
    ordered.map(lift => lift.id),
  );
};
