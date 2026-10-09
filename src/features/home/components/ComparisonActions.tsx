"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FavoriteCompareButton } from "@/features/favorites/FavoriteCompareButton";
import { useFavorites } from "@/features/favorites/FavoritesProvider";
import { cn } from "@/lib/utils";

type Props = {
  compareCount: number;
  isCompareOpen?: boolean;
  className?: string;
  onOpenCompare: () => void;
  onClearCompare: () => void;
  onCompareFavorites: () => void;
};

export function ComparisonActions({
  compareCount,
  isCompareOpen = false,
  className,
  onOpenCompare,
  onClearCompare,
  onCompareFavorites,
}: Props) {
  const favorites = useFavorites();
  if (compareCount === 0 && !(favorites?.ready && favorites.ids.length >= 2)) {
    return null;
  }

  return (
    <div
      data-comparison-actions="true"
      className={cn(
        "pointer-events-auto flex shrink-0 items-center gap-2 overflow-x-auto px-4 pb-2",
        className,
      )}
    >
      <FavoriteCompareButton
        onCompare={onCompareFavorites}
        presentation="chip"
      />
      {compareCount > 0 && (
        <div className="flex h-8 shrink-0 items-center rounded-full bg-primary text-primary-foreground shadow-md">
          <Button
            type="button"
            variant="ghost"
            className="h-8 rounded-l-full rounded-r-none px-2.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground"
            onClick={onOpenCompare}
            disabled={isCompareOpen}
          >
            比較を見る（{compareCount}件）
          </Button>
          <Button
            type="button"
            variant="ghost"
            aria-label="比較の選択をクリア"
            className="h-8 w-6 rounded-l-none rounded-r-full border-l border-white/30 p-0 text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground"
            onClick={onClearCompare}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
