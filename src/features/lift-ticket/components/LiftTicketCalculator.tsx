"use client";

import { useMemo } from "react";
import { filtersSchema } from "@/features/map/session/storage";
import { useScreenState } from "@/features/map/session/useScreenState";
import type { LiftTicketData, LiftTicketSearchInput } from "../types";
import {
  calculateLiftTicketPlan,
  DEFAULT_LIFT_TICKET_SEARCH_INPUT,
  selectLiftTicketSeason,
} from "../utils/calculateLiftTicket";
import { TicketPartyEditor } from "./TicketPartyEditor";
import { TicketPlanCard } from "./TicketPlanCard";

export const LiftTicketCalculator = ({
  seasons,
  sessionKey,
  initialInput = DEFAULT_LIFT_TICKET_SEARCH_INPUT,
}: {
  seasons: LiftTicketData[];
  sessionKey?: string;
  initialInput?: LiftTicketSearchInput;
}) => {
  const [input, setInput] = useScreenState<LiftTicketSearchInput>(
    sessionKey ?? null,
    filtersSchema.shape.liftTicket,
    initialInput,
  );
  const data =
    selectLiftTicketSeason(seasons, input.visitDate) ?? seasons[0] ?? null;

  // 日ごとの計画から合計を出す。2日以上なら「連続2日券」と「1日券×2」を比べる
  const plan = useMemo(
    () => (data ? calculateLiftTicketPlan(data, input) : null),
    [data, input],
  );

  return (
    <section className="rounded-2xl bg-gray-50 border border-gray-200 p-4 md:p-5">
      <h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">
        日付・人数から料金を計算
      </h2>
      <div className="mt-4 flex flex-col gap-4">
        <TicketPartyEditor value={input} onChange={setInput} />
        {plan && <TicketPlanCard plan={plan} />}
      </div>
    </section>
  );
};
