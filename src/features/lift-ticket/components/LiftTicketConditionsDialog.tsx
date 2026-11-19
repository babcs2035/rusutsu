"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LiftTicketSearchInput } from "../types";
import { SEARCH_RENTAL_OPTIONS } from "../utils/rental";
import { TicketPartyEditor } from "./TicketPartyEditor";

/** 料金の計算条件を編集するモーダル（一覧・比較で共用）。中身は検索欄の「料金を計算する」と同じ。 */
export const LiftTicketConditionsDialog = ({
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
          {/* 検索欄の「料金を計算する」と同じ項目（レンタル含む）を出す */}
          <TicketPartyEditor
            value={value}
            onChange={onChange}
            rentalOptions={SEARCH_RENTAL_OPTIONS}
          />
        </div>
      </DialogPrimitive.Popup>
    </DialogPortal>
  </Dialog>
);
