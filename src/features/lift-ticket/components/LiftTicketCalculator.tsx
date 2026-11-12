"use client";

import { type ReactNode, useMemo } from "react";
import { ReportErrorButton } from "@/features/corrections/ReportErrorButton";
import { filtersSchema } from "@/features/map/session/storage";
import { useScreenState } from "@/features/map/session/useScreenState";
import type { LiftTicketData, LiftTicketSearchInput } from "../types";
import {
  ageRequiredGroupIdsOf,
  calculateLiftTicketPlan,
  DEFAULT_LIFT_TICKET_SEARCH_INPUT,
  selectLiftTicketSeason,
} from "../utils/calculateLiftTicket";
import { buildPlanTiers } from "../utils/planView";
import {
  dataForPurchaseTier,
  firstVisitDateOf,
  purchaseTierKeysOf,
} from "../utils/purchaseTiers";
import { calculateRentalPlan, SEARCH_RENTAL_OPTIONS } from "../utils/rental";
import { calculateRentalBundle } from "../utils/rentalBundle";
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
  const data =
    selectLiftTicketSeason(seasons, input.visitDate) ?? seasons[0] ?? null;

  // 買い方（早割・Web・通常）ごとに、その買い方で買える料金だけで計算する。
  // Web・前売の料金が無いスキー場は通常の1回だけ
  const tierInputs = useMemo(() => {
    if (!data) return null;
    const visitDate = firstVisitDateOf(input);
    return purchaseTierKeysOf(data, visitDate).map(key => {
      const tierData = dataForPurchaseTier(data, key, visitDate);
      // 日ごとの計画から合計を出す。2日以上なら「連続2日券」と「1日券×2」を比べる
      const plan = calculateLiftTicketPlan(tierData, input);
      // 選べる用具は検索画面と同じにする（検索で選んだ条件をそのまま残す）。
      // このスキー場で借りられない物は、合計の横に「＋ゴーグル」と添えて知らせる
      const rental = calculateRentalPlan(tierData, input);
      // リフト券とレンタルのセット券が、別々に買うより安ければ使う
      const bundle = calculateRentalBundle(tierData, input, plan, rental);
      return { key, plan, rental, bundle };
    });
  }, [data, input]);
  const tiers = useMemo(
    () => (data && tierInputs ? buildPlanTiers(data, tierInputs) : null),
    [data, tierInputs],
  );
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
