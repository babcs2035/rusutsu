"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TicketCalculationCard } from "@/features/lift-ticket/components/TicketCalculationCard";
import { TicketPartyEditor } from "@/features/lift-ticket/components/TicketPartyEditor";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import { calculateLiftTicketForSeasons } from "@/features/lift-ticket/utils/calculateLiftTicket";
import type { Resort } from "./types";

export const CompareLiftTicketTab = ({
  resorts,
  initialInput,
}: {
  resorts: Resort[];
  initialInput: LiftTicketSearchInput;
}) => {
  const [input, setInput] = useState<LiftTicketSearchInput>(initialInput);
  return (
    <div className="flex flex-col gap-6">
      <Card className="border border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-blue-900 font-[var(--font-heading)]">
            同じ日程・メンバーで比較
          </CardTitle>
          <p className="mt-1.5 mb-4 text-xs text-blue-900">
            詳細料金データがあるスキー場は、同じ条件で合計を比較できます。
          </p>
        </CardHeader>
        <CardContent>
          <TicketPartyEditor value={input} onChange={setInput} />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {resorts.map(resort => {
          const result = calculateLiftTicketForSeasons(
            resort.liftTickets,
            input,
          );
          return (
            <Card key={resort.id}>
              <CardContent className="p-4">
                <p className="mb-3 font-semibold text-gray-900 font-[var(--font-heading)]">
                  {resort.nameJa}
                </p>
                <TicketCalculationCard result={result} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
