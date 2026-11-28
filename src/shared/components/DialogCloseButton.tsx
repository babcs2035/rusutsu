import { X } from "lucide-react";
import { DialogClose } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * モーダル（ダイアログ）の標準的な閉じる (×) ボタン。
 *
 * ダイアログの右上に絶対配置する。パネルヘッダーの×は PanelCloseButton を使う。
 * 見た目は全モーダルで揃えるため、個別にクラスを書かないこと。
 */
export function DialogCloseButton({
  label = "閉じる",
  disabled = false,
  className,
}: {
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <DialogClose
      aria-label={label}
      disabled={disabled}
      className={cn(
        "absolute top-2 right-2 flex size-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600",
        className,
      )}
    >
      <X size={16} aria-hidden="true" />
    </DialogClose>
  );
}
