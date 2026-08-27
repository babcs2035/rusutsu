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
}: {
  resort: Resort;
  onSelectResort?: (id: string) => void;
  className?: string;
}) => {
  const labelName = getResortLabelName(resort.id, resort.nameJa);
  const lines = getResortLabelLines(labelName, 6, resort.id);

  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[13px] leading-[1.25] font-bold text-gray-900 font-[var(--font-heading)]">
        {lines.map(line => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </p>
      {onSelectResort && (
        <Button
          type="button"
          variant="outline"
          onClick={() => onSelectResort(resort.id)}
          className="mt-1 h-6 gap-0 px-1.5 text-[11px] font-semibold text-blue-700"
        >
          詳細
          <ChevronRight size={11} strokeWidth={2.5} />
        </Button>
      )}
    </div>
  );
};
