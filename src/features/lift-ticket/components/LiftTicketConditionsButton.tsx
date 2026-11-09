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
    <button
      type="button"
      className={cn(
        "flex h-8 min-w-0 items-center gap-1.5 rounded-full bg-gray-950 px-3 text-left text-[13px] font-medium text-white shadow-md hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500",
        className,
      )}
      onClick={onClick}
      title={label}
      aria-label={`日程と利用者、レンタルの料金計算条件を編集：${label}`}
    >
      <span className="min-w-0 flex-1 truncate">
        {label || "日程・人数を設定"}
      </span>
      <span className="shrink-0 whitespace-nowrap border-l border-white/30 pl-2">
        編集
      </span>
    </button>
  );
};
