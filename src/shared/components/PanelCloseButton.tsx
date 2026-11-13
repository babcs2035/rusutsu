import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <Button
      type="button"
      aria-label={label}
      variant="ghost"
      className="flex size-7 min-h-7 shrink-0 items-center justify-center rounded-full border border-gray-200 p-0 text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-900 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10 md:size-8 md:min-h-8"
      disabled={disabled}
      onClick={onClose}
    >
      <X size={18} strokeWidth={2.5} />
    </Button>
  );
}
