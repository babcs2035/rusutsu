"use client";
import { Button } from "@/components/ui/button";
import { useFavorites } from "./FavoritesProvider";
export function FavoriteCompareButton({
  onCompare,
}: {
  onCompare: () => void;
}) {
  const favorites = useFavorites();
  if (!favorites?.ready || favorites.ids.length < 2) return null;
  return (
    <div className="shrink-0 px-4 py-2 border-b border-gray-100">
      <Button
        type="button"
        variant="outline"
        className="w-full min-h-10 h-auto whitespace-normal text-sm"
        onClick={onCompare}
      >
        お気に入りのスキー場を比較（{favorites.ids.length}件）
      </Button>
    </div>
  );
}
