"use client";
import { Heart, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFavorites } from "./FavoritesProvider";
export function FavoriteCompareButton({
  onCompare,
  presentation = "panel",
}: {
  onCompare: () => void;
  presentation?: "panel" | "chip";
}) {
  const favorites = useFavorites();
  if (!favorites || (favorites.ready && favorites.ids.length < 2)) return null;
  const isLoading = !favorites.ready;
  const label = isLoading ? "お気に入りを取得中" : "お気に入りを比較";
  if (presentation === "chip") {
    return (
      <Button
        type="button"
        variant="default"
        className="h-8 gap-0.5 rounded-md bg-pink-700 px-1 text-xs font-semibold text-white shadow-sm hover:bg-pink-800 @min-[21rem]/comparison-actions:gap-1 @min-[21rem]/comparison-actions:px-1.5 @min-[24rem]/comparison-actions:px-2.5"
        onClick={onCompare}
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
        ) : (
          <Heart className="size-3.5" />
        )}
        {label}
      </Button>
    );
  }
  return (
    <div className="shrink-0 px-4 py-2 border-b border-gray-100">
      <Button
        type="button"
        className="h-10 w-full min-w-0 rounded-lg bg-pink-700 text-sm font-semibold text-white shadow-sm hover:bg-pink-800"
        onClick={onCompare}
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {isLoading && (
          <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
        )}
        {label}
      </Button>
    </div>
  );
}
