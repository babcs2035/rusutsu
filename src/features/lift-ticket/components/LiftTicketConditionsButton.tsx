import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LiftTicketSearchInput } from "../types";
import { conditionsLabel } from "../utils/priceText";

/** 日程・人数・レンタルの料金計算条件を開く黒い丸角ボタン（一覧・比較で共用）。 */
export const LiftTicketConditionsButton = ({
  input,
  onClick,
  className,
}: {
  input: LiftTicketSearchInput;
  onClick: () => void;
  className?: string;
}) => {
  const label = conditionsLabel(input);
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "flex h-8 min-w-0 shrink items-center justify-start gap-1 rounded-full border-0 bg-gray-950 pr-2 pl-3 text-left text-xs font-medium text-white shadow-sm hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500",
        className,
      )}
      onClick={onClick}
      title={label}
      aria-label={`日程と利用者、レンタルの料金計算条件を編集：${label}`}
    >
      <span className="min-w-0 flex-1 truncate">
        {label || "日程・人数を設定"}
      </span>
      <ChevronRight className="size-4 shrink-0 text-white/70" aria-hidden />
    </Button>
  );
};
