"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TicketPlanCard } from "@/features/lift-ticket/components/TicketPlanCard";
import { useTicketPlans } from "@/features/lift-ticket/components/useTicketPlans";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { CompareResortDetailButton } from "./CompareResortNameCell";
import { COMPARE_CARD_GRID_CLASS } from "./constants";
import type { Resort } from "./types";

export const CompareLiftTicketTab = ({
  resorts,
  input,
  onSelectResort,
}: {
  resorts: Resort[];
  input: LiftTicketSearchInput;
  /** 「詳細」で開くスキー場。渡さなければボタンを出さない */
  onSelectResort?: (id: string) => void;
}) => {
  const entries = useMemo(
    () =>
      resorts.map(resort => ({
        resortId: resort.id,
        seasons: resort.liftTickets,
      })),
    [resorts],
  );
  const plans = useTicketPlans(entries, input);
  return (
    <div className="@container w-full">
      <div className={COMPARE_CARD_GRID_CLASS}>
        {resorts.map((resort, index) => {
          return (
            <Card key={resort.id}>
              <CardContent className="p-4">
                <div className="mb-3 flex min-w-0 items-center gap-2">
                  <p className="min-w-0 font-semibold break-words text-gray-900 font-heading">
                    {resort.nameJa}
                  </p>
                  {onSelectResort && (
                    <CompareResortDetailButton
                      resortId={resort.id}
                      onSelectResort={onSelectResort}
                      className="ml-auto"
                    />
                  )}
                </div>
                {plans === null ? (
                  <LoadingSpinner text="料金を計算中…" className="h-20" />
                ) : (
                  <TicketPlanCard tiers={plans[index]?.tiers ?? []} />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
