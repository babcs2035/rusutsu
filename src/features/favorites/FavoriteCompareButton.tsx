"use client";
import { Heart, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFavorites } from "./FavoritesProvider";
export function FavoriteCompareButton({
  onCompare,
  variant = "default",
  presentation = "panel",
}: {
  onCompare: () => void;
  variant?: "default" | "orange";
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
        className="h-8 gap-1 rounded-full bg-pink-500 px-1 text-xs font-medium text-white shadow-md hover:bg-pink-600 focus-visible:ring-pink-500/20 @min-[24rem]/comparison-actions:px-2 @min-[24rem]/comparison-actions:text-[13px]"
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
        variant={variant}
        className={cn(
          "w-full min-w-0 h-10 rounded-lg whitespace-nowrap bg-pink-500 text-sm text-white hover:bg-pink-600 focus-visible:ring-pink-500/20",
          variant === "orange" ? "font-medium" : "font-semibold shadow-sm",
        )}
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
