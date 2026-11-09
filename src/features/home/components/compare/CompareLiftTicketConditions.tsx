"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiftTicketConditionsButton } from "@/features/lift-ticket/components/LiftTicketConditionsButton";
import { TicketPartyEditor } from "@/features/lift-ticket/components/TicketPartyEditor";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";

export const CompareLiftTicketConditionsButton = ({
  input,
  onClick,
  className,
}: {
  input: LiftTicketSearchInput;
  onClick: () => void;
  className?: string;
}) => (
  <LiftTicketConditionsButton
    input={input}
    onClick={onClick}
    className={className}
  />
);

export const CompareLiftTicketConditionsDialog = ({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: LiftTicketSearchInput;
  onChange: (value: LiftTicketSearchInput) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogPortal>
      <DialogOverlay className="z-[900]" />
      <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-[901] max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-3 text-slate-700 shadow-xl outline-none md:p-4">
        <DialogTitle className="pr-8 text-base font-semibold text-slate-900">
          料金の計算条件
        </DialogTitle>
        <DialogPrimitive.Close
          aria-label="閉じる"
          className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
        >
          <XIcon size={16} />
        </DialogPrimitive.Close>
        <div className="mt-2">
          <TicketPartyEditor value={value} onChange={onChange} />
        </div>
      </DialogPrimitive.Popup>
    </DialogPortal>
  </Dialog>
);
