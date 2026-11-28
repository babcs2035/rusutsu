import { X } from "lucide-react";

/**
 * パネル・比較画面のヘッダーの閉じる (×) ボタン。
 *
 * モーダルの DialogCloseButton と同じ見た目（size-8 の丸型，X 16px）で
 * 全画面の×を揃える。DialogCloseButton は Dialog の状態を閉じるため
 * Dialog の中身専用で，ここでは onClick で閉じる。
 */
export function PanelCloseButton({
  onClose,
  label = "閉じる",
  disabled = false,
}: {
  onClose: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClose}
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:pointer-events-none"
    >
      <X size={16} aria-hidden="true" />
    </button>
  );
}
