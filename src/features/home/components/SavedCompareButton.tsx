"use client";

import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompareListsButton } from "@/features/compare-lists/CompareListsButton";
import { useCompareLists } from "@/features/compare-lists/CompareListsProvider";
import { useFavorites } from "@/features/favorites/FavoritesProvider";
import { cn } from "@/lib/utils";
import { useHomeCompare } from "../compareContext";

const SAVED_BUTTON_CLASS =
  "h-8 shrink-0 gap-1 rounded-md px-2 text-xs font-semibold whitespace-nowrap shadow-md";
const FAVORITE_CLASS =
  "bg-pink-500 text-white hover:bg-pink-600 hover:text-white focus-visible:ring-pink-500/20 border-pink-500";

/**
 * 検索欄の右に置く「♥ お気に入り」。保存した比較リストが無ければ押すとそのまま
 * お気に入りの比較を開き、あればお気に入りと比較リストの一覧を開く。
 * お気に入りが2件未満で比較リストだけあるときは「比較リスト ›」にする。
 */
export function SavedCompareButton({
  onCompareFavorites,
  className,
}: {
  onCompareFavorites: () => void;
  className?: string;
}) {
  const favorites = useFavorites();
  const compareLists = useCompareLists();
  const homeCompare = useHomeCompare();
  const hasFavorites = Boolean(
    favorites && (!favorites.ready || favorites.ids.length >= 2),
  );
  const hasLists = (compareLists?.lists.length ?? 0) > 0;
  if (!hasFavorites && !hasLists) return null;

  const favoriteLabel = (
    <>
      <Heart className="size-3.5" />
      お気に入り
    </>
  );
  if (!hasLists) {
    return (
      <Button
        type="button"
        variant="default"
        aria-label="お気に入りを比較"
        className={cn(SAVED_BUTTON_CLASS, FAVORITE_CLASS, className)}
        disabled={!favorites?.ready}
        aria-busy={!favorites?.ready}
        onClick={onCompareFavorites}
      >
        {favoriteLabel}
      </Button>
    );
  }
  return (
    <CompareListsButton
      onOpenList={list => homeCompare?.openList(list)}
      favorites={
        hasFavorites && favorites?.ready
          ? { count: favorites.ids.length, onCompare: onCompareFavorites }
          : null
      }
      label={hasFavorites ? favoriteLabel : undefined}
      className={cn(
        SAVED_BUTTON_CLASS,
        hasFavorites
          ? FAVORITE_CLASS
          : "gap-0 border-blue-600 bg-white pr-1 text-blue-700 hover:bg-blue-50 hover:text-blue-800",
        className,
      )}
    />
  );
}
