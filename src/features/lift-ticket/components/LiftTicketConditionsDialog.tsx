"use client";

import { Modal } from "@/shared/components/Modal";
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
  <Modal
    open={open}
    onOpenChange={onOpenChange}
    title="料金の計算条件"
    className="p-3 md:p-4"
  >
    {/* 検索欄の「料金を計算する」と同じ項目（レンタル含む）を出す */}
    <TicketPartyEditor
      value={value}
      onChange={onChange}
      rentalOptions={SEARCH_RENTAL_OPTIONS}
    />
  </Modal>
);
