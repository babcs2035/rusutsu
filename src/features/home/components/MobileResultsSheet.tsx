"use client";

import type { RefObject } from "react";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import { cn } from "@/lib/utils";
import type { MapSkiResort, SkiResortDetail } from "@/types/skiResorts";
import { SkiResortCompareView } from "./SkiResortCompareView";
import { SkiResortList } from "./SkiResortList";

type Props = {
  compareResorts: SkiResortDetail[];
  filteredResorts: MapSkiResort[];
  isCompareLoading: boolean;
  isCompareOpen: boolean;
  isListSheetOpen: boolean;
  listSheetContentRef: RefObject<HTMLDivElement | null>;
  listSheetSnapPoint: number | string | null;
  snapPoints: (number | string)[];
  selectedCompareIdSet: Set<string>;
  liftTicketInput: LiftTicketSearchInput;
  onCloseCompare: () => void;
  onHoverResortChange: (id: string | null) => void;
  onOpenChange: (open: boolean) => void;
  onSelectResort: (id: string) => void;
  onSetSnapPoint: (snapPoint: number | string | null) => void;
  onToggleCompare: (id: string, selected: boolean) => void;
};

export const MobileResultsSheet = ({
  compareResorts,
  filteredResorts,
  isCompareLoading,
  isCompareOpen,
  isListSheetOpen,
  listSheetContentRef,
  selectedCompareIdSet,
  liftTicketInput,
  onCloseCompare,
  onHoverResortChange,
  onSelectResort,
  onToggleCompare,
}: Props) => (
  <div
    ref={listSheetContentRef}
    data-mobile-results-panel="true"
    className={cn(
      "relative h-full min-h-0 flex flex-col bg-white overflow-hidden",
      !isListSheetOpen && "hidden",
    )}
  >
    {isCompareOpen ? (
      <SkiResortCompareView
        resorts={compareResorts}
        isLoading={isCompareLoading}
        initialLiftTicketInput={liftTicketInput}
        onClose={onCloseCompare}
        presentation="inline"
        canScrollContent
      />
    ) : (
      <div
        data-ski-resort-list-scroll-container="true"
        className="h-full min-h-0 overflow-y-auto"
      >
        <SkiResortList
          resorts={filteredResorts}
          liftTicketInput={liftTicketInput}
          onSelectResort={onSelectResort}
          selectedCompareIdSet={selectedCompareIdSet}
          onToggleCompare={onToggleCompare}
          onHoverResortChange={onHoverResortChange}
          showHeader={false}
        />
      </div>
    )}
  </div>
);
