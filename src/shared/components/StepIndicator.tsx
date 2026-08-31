"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = { id: string; label: string };

type StepIndicatorProps = {
  steps: Step[];
  currentStepId: string;
  /** 押すと戻れる工程。渡さなければ表示だけ */
  onSelectStep?: (stepId: string) => void;
  canSelectStep?: (stepId: string) => boolean;
};

/**
 * 工程の現在地。
 *
 * バッジを横並びにするだけだと、今どこにいるのかも、あと何が残っているのかも
 * 読み取りにくい。番号・済んだ工程・現在地を描き分けて、狭い幅では
 * 横スクロールへ逃がす（折り返して画面外に出さない）。
 */
export function StepIndicator({
  steps,
  currentStepId,
  onSelectStep,
  canSelectStep,
}: StepIndicatorProps) {
  const currentIndex = steps.findIndex(step => step.id === currentStepId);

  return (
    <ol className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
      {steps.map((step, index) => {
        const isCurrent = step.id === currentStepId;
        const isDone = index < currentIndex;
        const isSelectable =
          onSelectStep !== undefined &&
          !isCurrent &&
          (canSelectStep?.(step.id) ?? isDone);

        return (
          <li key={step.id} className="flex shrink-0 items-center">
            {index > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-0.5 h-px w-2",
                  isDone || isCurrent ? "bg-blue-400" : "bg-gray-300",
                )}
              />
            )}
            <button
              type="button"
              aria-current={isCurrent ? "step" : undefined}
              disabled={!isSelectable}
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs whitespace-nowrap transition-colors",
                isCurrent
                  ? "bg-blue-600 font-bold text-white"
                  : isDone
                    ? "bg-blue-50 text-blue-900"
                    : "text-gray-500",
                isSelectable && "hover:bg-blue-100 hover:text-blue-900",
              )}
              onClick={() => isSelectable && onSelectStep?.(step.id)}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full text-[10px]",
                  isCurrent
                    ? "bg-white/25"
                    : isDone
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-600",
                )}
              >
                {isDone ? <Check className="size-2.5" /> : index + 1}
              </span>
              {step.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
