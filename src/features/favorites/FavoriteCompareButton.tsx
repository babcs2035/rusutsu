"use client";
import { Heart } from "lucide-react";
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
  if (!favorites?.ready || favorites.ids.length < 2) return null;
  if (presentation === "chip") {
    return (
      <Button
        type="button"
        variant="default"
        className="h-8 gap-1.5 rounded-full bg-pink-500 px-3 text-[13px] font-medium text-white shadow-md hover:bg-pink-600 focus-visible:ring-pink-500/20"
        onClick={onCompare}
      >
        <Heart className="size-3.5" />
        お気に入りを比較
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
      >
        お気に入りを比較
      </Button>
    </div>
  );
}
