"use client";

import { ResortListEditButton } from "@/features/compare-lists/ResortListEditButton";
import type { MapSkiResort } from "@/types/skiResorts";
import { useFavorites } from "./FavoritesProvider";

/**
 * お気に入りの比較から、お気に入りそのものを編集する。
 * 名前は「お気に入り」で固定なので、名前の欄は出さない。
 */
export function EditFavoritesButton({
  resorts,
  onSaved,
  className,
}: {
  resorts: MapSkiResort[];
  /** 保存したあとのお気に入り（並んでいる順） */
  onSaved: (ids: string[]) => void;
  className?: string;
}) {
  const favorites = useFavorites();
  if (!favorites) return null;
  const after = async (task: Promise<string[] | null>) => {
    const ids = await task;
    if (ids) onSaved(ids);
    return !!ids;
  };
  return (
    <ResortListEditButton
      listLabel="お気に入り"
      targetName="お気に入り"
      resorts={resorts}
      memberIds={favorites.ids}
      ready={favorites.ready}
      className={className}
      onAdd={ids => after(favorites.add(ids))}
      onRemove={id => after(favorites.remove(id))}
      onReorder={ids => after(favorites.reorder(ids))}
    />
  );
}
