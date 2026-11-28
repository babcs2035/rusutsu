import { ChevronRight } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

/** 一覧・個別詳細へ進む「詳細」ボタン。画面内のどこでも同じ見た目にする */
export function DetailButton({
  children = "詳細",
  className = "",
  compact = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  /** 見出しの横など、行の高さを増やしたくない場所で使う */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border border-border bg-background font-semibold text-primary hover:bg-muted active:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${compact ? "min-h-6 py-0.5 pr-0.5 pl-1.5 text-xs" : "min-h-7 py-1 pr-2 pl-3 text-sm"} ${className}`}
      {...props}
    >
      {children}
      <ChevronRight
        className={compact ? "size-3.5" : "size-4"}
        aria-hidden="true"
      />
    </button>
  );
}
