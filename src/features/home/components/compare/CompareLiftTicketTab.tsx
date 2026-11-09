"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TicketCalculationCard } from "@/features/lift-ticket/components/TicketCalculationCard";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import { calculateLiftTicketForSeasons } from "@/features/lift-ticket/utils/calculateLiftTicket";
import { COMPARE_CARD_GRID_CLASS } from "./constants";
import type { Resort } from "./types";

export const CompareLiftTicketTab = ({
  resorts,
  input,
}: {
  resorts: Resort[];
  input: LiftTicketSearchInput;
}) => (
  <div className="@container w-full">
    <div className={COMPARE_CARD_GRID_CLASS}>
      {resorts.map(resort => {
        const result = calculateLiftTicketForSeasons(resort.liftTickets, input);
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
