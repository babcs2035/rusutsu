"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TicketCalculationCard } from "@/features/lift-ticket/components/TicketCalculationCard";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import { calculateLiftTicketForSeasons } from "@/features/lift-ticket/utils/calculateLiftTicket";
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
}) => (
  <div className="@container w-full">
    <div className={COMPARE_CARD_GRID_CLASS}>
      {resorts.map(resort => {
        const result = calculateLiftTicketForSeasons(resort.liftTickets, input);
        return (
          <Card key={resort.id}>
            <CardContent className="p-4">
              <div className="mb-3 flex min-w-0 items-center gap-2">
                <p className="min-w-0 font-semibold break-words text-gray-900 font-[var(--font-heading)]">
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
              <TicketCalculationCard result={result} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  </div>
);
