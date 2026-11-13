import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PanelCloseButton } from "./PanelCloseButton";

/**
 * 詳細パネルを投稿・修正の画面に切り替えたときの見出し。
 * 左に「戻る」と題名、右に閉じる×を置く。スキー場詳細の×と同じ形にする。
 */
export function PanelHeader({
  title,
  onBack,
  backLabel = "前の画面に戻る",
  onClose,
  closeLabel = "閉じる",
  closeDisabled = false,
  actions,
}: {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  onClose?: () => void;
  closeLabel?: string;
  closeDisabled?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 py-2 pr-2 pl-3 md:pr-3 md:pl-4">
      <div className="flex min-w-0 items-center gap-1">
        {onBack && (
          <Button
            type="button"
            aria-label={backLabel}
            variant="ghost"
            className="-ml-1.5 size-7 min-w-7 rounded-full p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-900 md:size-8 md:min-w-8"
            onClick={onBack}
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </Button>
        )}
        <h2 className="min-w-0 truncate text-base leading-snug font-bold text-gray-900 font-[var(--font-heading)] md:text-lg">
          {title}
        </h2>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        {onClose && (
          <PanelCloseButton
            label={closeLabel}
            disabled={closeDisabled}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}
