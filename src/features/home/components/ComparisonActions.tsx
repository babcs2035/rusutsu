"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompareListsButton } from "@/features/compare-lists/CompareListsButton";
import { useCompareLists } from "@/features/compare-lists/CompareListsProvider";
import { FavoriteCompareButton } from "@/features/favorites/FavoriteCompareButton";
import { useFavorites } from "@/features/favorites/FavoritesProvider";
import { cn } from "@/lib/utils";
import { useHomeCompare } from "../compareContext";

type Props = {
  compareCount: number;
  isCompareOpen?: boolean;
  className?: string;
  onOpenCompare: () => void;
  onClearCompare: () => void;
  onCompareFavorites: () => void;
};

/** 比較の入口のチップ。丸い部品が多い画面なので、あえて角を立てて目立たせる */
export const COMPARISON_CHIP_CLASS =
  "h-8 rounded-md px-1 text-xs font-semibold shadow-md @min-[21rem]/comparison-actions:px-1.5 @min-[24rem]/comparison-actions:px-2.5 @min-[24rem]/comparison-actions:text-[13px]";

/** 比較チップの行を出すか。検索結果の件数は並び替えの横に出すので、ここでは数えない */
export function useHasComparisonActions(compareCount: number) {
  const favorites = useFavorites();
  const compareLists = useCompareLists();
  return (
    compareCount > 0 ||
    Boolean(favorites && (!favorites.ready || favorites.ids.length >= 2)) ||
    (compareLists?.lists.length ?? 0) > 0
  );
}

export function ComparisonActions({
  compareCount,
  isCompareOpen = false,
  className,
  onOpenCompare,
  onClearCompare,
  onCompareFavorites,
}: Props) {
  const homeCompare = useHomeCompare();
  if (!useHasComparisonActions(compareCount)) return null;

  return (
    <div
      data-comparison-actions="true"
      className={cn(
        "@container/comparison-actions pointer-events-auto flex min-h-9 shrink-0 items-center gap-1 px-2 pb-1 md:px-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto @min-[21rem]/comparison-actions:gap-1 @min-[24rem]/comparison-actions:gap-1.5 [&>*]:shrink-0">
        <FavoriteCompareButton
          onCompare={onCompareFavorites}
          presentation="chip"
        />
        {compareCount > 0 && (
          <div className="flex h-8 shrink-0 items-center rounded-md bg-primary text-primary-foreground shadow-md">
            <Button
              type="button"
              variant="ghost"
              className={cn(
                COMPARISON_CHIP_CLASS,
                "rounded-r-none text-primary-foreground shadow-none hover:bg-primary/80 hover:text-primary-foreground",
              )}
              onClick={onOpenCompare}
              disabled={isCompareOpen}
            >
              {compareCount}件を比較
            </Button>
            <Button
              type="button"
              variant="ghost"
              aria-label="比較の選択をクリア"
              className="h-8 w-5 rounded-l-none rounded-r-md @min-[21rem]/comparison-actions:w-6 border-l border-white/30 p-0 text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground"
              onClick={onClearCompare}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        )}
        <CompareListsButton
          onOpenList={list => homeCompare?.openList(list)}
          className={cn(
            COMPARISON_CHIP_CLASS,
            "gap-0 border-blue-600 bg-white pr-0.5 text-blue-700 hover:bg-blue-50 hover:text-blue-800 @min-[21rem]/comparison-actions:pr-1 @min-[24rem]/comparison-actions:gap-0.5 @min-[24rem]/comparison-actions:pr-1.5",
          )}
        />
      </div>
    </div>
  );
}
