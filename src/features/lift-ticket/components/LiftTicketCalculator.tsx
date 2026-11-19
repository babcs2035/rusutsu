"use client";

import { type ReactNode, useMemo } from "react";
import { ReportErrorButton } from "@/features/corrections/ReportErrorButton";
import { filtersSchema } from "@/features/map/session/storage";
import { useScreenState } from "@/features/map/session/useScreenState";
import type { LiftTicketData, LiftTicketSearchInput } from "../types";
import {
  ageRequiredGroupIdsOf,
  DEFAULT_LIFT_TICKET_SEARCH_INPUT,
} from "../utils/calculateLiftTicket";
import { SEARCH_RENTAL_OPTIONS } from "../utils/rental";
import { calculateResortPriceTiers } from "../utils/resortPriceCalculation";
import { TicketPartyEditor } from "./TicketPartyEditor";
import { TicketPlanCard } from "./TicketPlanCard";

export const LiftTicketCalculator = ({
  seasons,
  sessionKey,
  initialInput = DEFAULT_LIFT_TICKET_SEARCH_INPUT,
  categoryControl,
}: {
  seasons: LiftTicketData[];
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
  // 一覧・比較と同じ関数で計算する（画面ごとに金額を変えない）
  const calculated = useMemo(
    () => calculateResortPriceTiers(seasons, input),
    [seasons, input],
  );
  const data = calculated?.data ?? null;
  const tierInputs = calculated?.tierInputs ?? null;
  const tiers = calculated?.tiers ?? null;
  // 一番安い買い方の結果（年齢の入力が要る人の判定と、誤りの報告に使う）
  const cheapest =
    tierInputs?.find(tier => tier.key === tiers?.[0]?.key) ?? null;
  const plan = cheapest?.plan ?? null;
  const rental = cheapest?.rental ?? null;
  const bundle = cheapest?.bundle ?? null;

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
          ageRequiredGroupIds={plan ? ageRequiredGroupIdsOf(plan) : []}
        />
        {tiers && <TicketPlanCard tiers={tiers} />}
        {data && plan && (
          <ReportErrorButton
            resortId={data.resort.id}
            kind="ticket"
            label="この料金が間違っている"
            context={{
              type: "calculation",
              input,
              plan,
              rental,
              bundle,
              seasonId: data.season.id,
              schemaVersion: data.schema_version,
              offers: data.offers,
              calendars: data.calendars,
              fees: data.fees,
            }}
          />
        )}
      </div>
    </section>
  );
};
