import type { CompareSource } from "@/features/compare-lists/types";

/** お気に入り比較だけ、明示的なタブ切り替え時に最新の登録状態へ同期する。 */
export const idsAfterFavoriteCompareTabChange = (
  source: CompareSource,
  compareIds: string[],
  favoriteIds: string[],
) => {
  if (source.kind !== "favorites") return compareIds;
  const favorites = new Set(favoriteIds);
  return compareIds.filter(id => favorites.has(id));
};
