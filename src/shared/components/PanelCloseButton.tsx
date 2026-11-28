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
      variant="outline"
      className="size-7 min-h-7 rounded-full p-0 text-muted-foreground shadow-sm md:size-8 md:min-h-8"
      disabled={disabled}
      onClick={onClose}
    >
      <X size={18} strokeWidth={2.5} />
    </Button>
  );
}
