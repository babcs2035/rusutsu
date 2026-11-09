"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getResortLabelName } from "@/lib/resortAliases";
import { getResortLabelLines } from "@/lib/resortLabelWrap";
import { cn } from "@/lib/utils";
import type { Resort } from "./types";

/**
 * 比較表の先頭列。地図のラベルと同じ表示名を、決めた位置で折り返して出す。
 * 都道府県・市町村は幅を食うだけなので出さない。
 */
export const CompareResortNameCell = ({
  resort,
  onSelectResort,
  className,
  layout = "stacked",
}: {
  resort: Resort;
  onSelectResort?: (id: string) => void;
  className?: string;
  /**
   * "stacked" は表の狭い先頭列向け（6 文字で折り返し、詳細は名前の下）。
   * "inline" はカード向け（名前は幅なりに折り返し、詳細は名前の右）
   */
  layout?: "stacked" | "inline";
}) => {
  const labelName = getResortLabelName(
    resort.id,
    resort.nameJa,
    resort.shortName,
  );
  const lines = getResortLabelLines(labelName, 6, resort.id);
  const detailButton = onSelectResort && (
    <Button
      type="button"
      variant="outline"
      onClick={() => onSelectResort(resort.id)}
      className={cn(
        "h-6 shrink-0 gap-0 px-1.5 text-[11px] font-semibold text-blue-700",
        layout === "stacked" && "mt-1",
      )}
    >
      詳細
      <ChevronRight size={11} strokeWidth={2.5} />
    </Button>
  );

  if (layout === "inline") {
    return (
      <div className={cn("flex min-w-0 items-center gap-2", className)}>
        <p className="min-w-0 text-sm leading-tight font-bold break-words text-gray-900 font-[var(--font-heading)]">
          {labelName}
        </p>
        {detailButton}
      </div>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[13px] leading-[1.25] font-bold text-gray-900 font-[var(--font-heading)]">
        {lines.map(line => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </p>
      {detailButton}
    </div>
  );
};
