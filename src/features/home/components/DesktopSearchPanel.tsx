"use client";

import { Button } from "@/components/ui/button";
import { FilterPanel } from "@/features/filters/FilterPanel";
import type { Filters } from "@/features/filters/types";
import { DEFAULT_LIFT_TICKET_SEARCH_INPUT } from "@/features/lift-ticket/utils/calculateLiftTicket";
import { cn } from "@/lib/utils";
import type { MapSkiResort } from "@/types/skiResorts";
import { SkiResortList } from "./SkiResortList";

type Props = {
  filters: Filters;
  resorts: MapSkiResort[];
  filteredResorts: MapSkiResort[];
  compareCount: number;
  hasSearched: boolean;
  isCompareOpen: boolean;
  isFilterEditorOpen: boolean;
  selectedCompareIdSet: Set<string>;
  onExpandedChange: (isExpanded: boolean) => void;
  onFilterChange: (filters: Filters) => void;
  onKeyboardInputBlur: () => void;
  onKeyboardInputFocus: () => void;
  onClearCompare: () => void;
  onOpenCompare: () => void;
  onSearch: () => void;
  onSelectResort: (id: string) => void;
  onToggleCompare: (id: string, selected: boolean) => void;
  onHoverResortChange: (id: string | null) => void;
};

export const DesktopSearchPanel = ({
  filters,
  resorts,
  filteredResorts,
  compareCount,
  hasSearched,
  isCompareOpen,
  isFilterEditorOpen,
  selectedCompareIdSet,
  onExpandedChange,
  onFilterChange,
  onKeyboardInputBlur,
  onKeyboardInputFocus,
  onClearCompare,
  onOpenCompare,
  onSearch,
  onSelectResort,
  onToggleCompare,
  onHoverResortChange,
}: Props) => (
  <div
    className={cn(
      "hidden md:block h-full w-[var(--desktop-search-panel-width)] flex-shrink-0 relative z-10",
      "border-l border-gray-200 bg-white",
      "shadow-[4px_0_20px_rgba(0,0,0,0.06)]",
    )}
  >
    <div className="flex h-full flex-col overflow-hidden">
      <FilterPanel
        filters={filters}
        resorts={resorts}
        resultCount={filteredResorts.length}
        isExpanded={isFilterEditorOpen}
        canCollapse={hasSearched}
        onExpandedChange={onExpandedChange}
        onFilterChange={onFilterChange}
        onKeyboardInputBlur={onKeyboardInputBlur}
        onKeyboardInputFocus={onKeyboardInputFocus}
        onSearch={onSearch}
      />
      {compareCount > 0 && (
        <div className="flex w-full flex-shrink-0 gap-2 px-4 py-3 border-b border-gray-100 bg-white">
          <Button
            variant="orange"
            className="flex-1 min-w-0 h-10 rounded-lg font-medium text-sm"
            onClick={onOpenCompare}
            disabled={isCompareOpen}
          >
            {compareCount} 件を比較
          </Button>
          <Button
            variant="outline"
            className="flex-1 min-w-0 h-10 rounded-lg border border-gray-200 text-gray-700 font-medium text-sm hover:bg-gray-50 hover:text-gray-900"
            onClick={onClearCompare}
          >
            比較をクリア
          </Button>
        </div>
      )}
      {hasSearched && !isFilterEditorOpen && (
        <div
          data-ski-resort-list-scroll-container="true"
          className="flex-grow min-h-0"
        >
          <SkiResortList
            resorts={filteredResorts}
            liftTicketInput={
              filters.liftTicket ?? DEFAULT_LIFT_TICKET_SEARCH_INPUT
            }
            onSelectResort={onSelectResort}
            selectedCompareIdSet={selectedCompareIdSet}
            onToggleCompare={onToggleCompare}
            onHoverResortChange={onHoverResortChange}
            showHeader={false}
          />
        </div>
      )}
    </div>
  </div>
);
