"use client";

import { type ReactNode, useMemo } from "react";
import { ReportErrorButton } from "@/features/corrections/ReportErrorButton";
import { filtersSchema } from "@/features/map/session/storage";
import { useScreenState } from "@/features/map/session/useScreenState";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import type { LiftTicketData, LiftTicketSearchInput } from "../types";
import { DEFAULT_LIFT_TICKET_SEARCH_INPUT } from "../utils/calculateLiftTicket";
import { SEARCH_RENTAL_OPTIONS } from "../utils/rental";
import { TicketPartyEditor } from "./TicketPartyEditor";
import { TicketPlanCard } from "./TicketPlanCard";
import { useTicketPlans } from "./useTicketPlans";

export const LiftTicketCalculator = ({
  seasons,
  resortId,
  categoryKey,
  sessionKey,
  initialInput = DEFAULT_LIFT_TICKET_SEARCH_INPUT,
  categoryControl,
}: {
  seasons: LiftTicketData[];
  resortId: string;
  categoryKey: string;
  sessionKey?: string;
  initialInput?: LiftTicketSearchInput;
  /** 「高鷲のみ」「ダイナランド共通券」など、計算する券の種類の切り替え */
  categoryControl?: ReactNode;
}) => {
  const [input, setInput] = useScreenState<LiftTicketSearchInput>(
    sessionKey ?? null,
    filtersSchema.shape.liftTicket,
    initialInput,
  );
  const entries = useMemo(
    () => [{ resortId, categoryKey, seasons }],
    [resortId, categoryKey, seasons],
  );
  const plans = useTicketPlans(entries, input);
  const calculated = plans?.[0];
  const report = calculated?.report;

  return (
    <section className="rounded-2xl bg-gray-50 border border-gray-200 p-3 md:p-4">
      <h2 className="text-base font-bold text-gray-900 font-[var(--font-heading)]">
        料金を計算する
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-amber-700">
        正確な金額は公式サイトでご確認ください。
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {categoryControl}
        <TicketPartyEditor
          value={input}
          onChange={setInput}
          rentalOptions={SEARCH_RENTAL_OPTIONS}
          ageRequiredGroupIds={calculated?.ageRequiredGroupIds ?? []}
        />
        {plans === null && (
          <LoadingSpinner text="料金を計算中…" className="h-20" />
        )}
        {calculated && <TicketPlanCard tiers={calculated.tiers} />}
        {report && (
          <ReportErrorButton
            resortId={report.resortId}
            kind="ticket"
            label="この料金が間違っている"
            context={{
              type: "calculation",
              input,
              ...report.context,
            }}
          />
        )}
      </div>
    </section>
  );
};
