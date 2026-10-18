"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FavoriteCompareButton } from "@/features/favorites/FavoriteCompareButton";
import { useFavorites } from "@/features/favorites/FavoritesProvider";
import { cn } from "@/lib/utils";

type Props = {
  compareCount: number;
  isCompareOpen?: boolean;
  resultCount?: number;
  className?: string;
  onOpenCompare: () => void;
  onClearCompare: () => void;
  onCompareFavorites: () => void;
};

export function ComparisonActions({
  compareCount,
  isCompareOpen = false,
  resultCount,
  className,
  onOpenCompare,
  onClearCompare,
  onCompareFavorites,
}: Props) {
  const favorites = useFavorites();
  if (
    resultCount === undefined &&
    compareCount === 0 &&
    !(favorites && (!favorites.ready || favorites.ids.length >= 2))
  ) {
    return null;
  }

  return (
    <div
      data-comparison-actions="true"
      className={cn(
        "@container/comparison-actions pointer-events-auto flex min-h-9 shrink-0 items-center gap-1 px-2 pb-1 md:px-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto @min-[20rem]/comparison-actions:gap-1 @min-[24rem]/comparison-actions:gap-1.5 [&>button]:shrink-0">
        <FavoriteCompareButton
          onCompare={onCompareFavorites}
          presentation="chip"
        />
        {compareCount > 0 && (
          <div className="flex h-8 shrink-0 items-center rounded-full bg-primary text-primary-foreground shadow-md">
            <Button
              type="button"
              variant="ghost"
              className="h-8 rounded-l-full rounded-r-none px-1 text-xs font-medium text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground @min-[24rem]/comparison-actions:px-2 @min-[24rem]/comparison-actions:text-[13px]"
              onClick={onOpenCompare}
              disabled={isCompareOpen}
            >
              比較を見る({compareCount}件)
            </Button>
            <Button
              type="button"
              variant="ghost"
              aria-label="比較の選択をクリア"
              className="h-8 w-5 rounded-l-none rounded-r-full border-l border-white/30 p-0 text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground @min-[20rem]/comparison-actions:w-6"
              onClick={onClearCompare}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
      {resultCount !== undefined && (
        <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-gray-900 @min-[24rem]/comparison-actions:text-base">
          {resultCount.toLocaleString("ja-JP")}件
        </span>
      )}
    </div>
  );
}
