"use client";

import { Search, X } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountButton } from "@/features/favorites/AccountButton";
import type { Filters } from "@/features/filters/types";
import { DEFAULT_LIFT_TICKET_SEARCH_INPUT } from "@/features/lift-ticket/utils/calculateLiftTicket";
import { cn } from "@/lib/utils";
import type { MapSkiResort } from "@/types/skiResorts";
import type { ListLiftTicketResults } from "../hooks/useListLiftTicketResults";
import type { ResortSortControls } from "../hooks/useResortSort";
import { SavedCompareButton } from "./SavedCompareButton";
import { SearchConditionBar } from "./SearchConditionBar";
import { SkiResortList } from "./SkiResortList";

type Props = {
  showAccount?: boolean;
  filters: Filters;
  resorts: MapSkiResort[];
  filteredResorts: MapSkiResort[];
  sortControls: ResortSortControls;
  selectedCompareIdSet: Set<string>;
  liftTicketResults: ListLiftTicketResults;
  priceLabel: string;
  /** パネルの下端に浮かせる操作（「N件を比較」） */
  floatingActions?: ReactNode;
  onFilterChange: (filters: Filters) => void;
  onKeyboardInputBlur: () => void;
  onKeyboardInputFocus: () => void;
  onCompareFavorites: () => void;
  onSearch: () => void;
  onSelectResort: (id: string) => void;
  onToggleCompare: (id: string, selected: boolean) => void;
  onHoverResortChange: (id: string | null) => void;
};

export const DesktopSearchPanel = ({
  showAccount = true,
  filters,
  resorts,
  filteredResorts,
  sortControls,
  selectedCompareIdSet,
  liftTicketResults,
  priceLabel,
  floatingActions,
  onFilterChange,
  onKeyboardInputBlur,
  onKeyboardInputFocus,
  onCompareFavorites,
  onSearch,
  onSelectResort,
  onToggleCompare,
  onHoverResortChange,
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        "hidden md:block h-full w-[var(--desktop-search-panel-width)] flex-shrink-0 relative z-10",
        "border-l border-gray-200 bg-white",
        "shadow-[4px_0_20px_rgba(0,0,0,0.06)]",
      )}
    >
      <div className="flex h-full flex-col overflow-hidden">
        {/* 名前の入力はその場で一覧と地図に反映する。Enter で地図を結果に寄せる */}
        <form
          className="flex shrink-0 items-center gap-2 px-4 pt-2.5 pb-2"
          onSubmit={event => {
            event.preventDefault();
            inputRef.current?.blur();
            onSearch();
          }}
        >
          <div className="relative h-10 min-w-0 flex-1 overflow-hidden rounded-full border border-gray-200 bg-white shadow-sm focus-within:border-blue-600">
            <Search
              size={17}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <Input
              ref={inputRef}
              aria-label="スキー場を検索"
              type="text"
              name="keyword"
              autoComplete="off"
              placeholder="スキー場を検索"
              value={filters.keyword}
              className={cn(
                "h-10 w-full rounded-full border-0 bg-transparent pl-9 text-sm font-medium text-gray-800 shadow-none focus-visible:ring-0 md:text-sm",
                filters.keyword ? "pr-9" : "pr-3",
              )}
              onChange={event =>
                onFilterChange({ ...filters, keyword: event.target.value })
              }
              onFocus={onKeyboardInputFocus}
              onBlur={onKeyboardInputBlur}
            />
            {filters.keyword && (
              <Button
                type="button"
                variant="ghost"
                aria-label="検索キーワードをクリア"
                className="absolute inset-y-0 right-1.5 my-auto h-7 w-7 min-w-7 rounded-full p-0 text-gray-600 shadow-none hover:bg-gray-50"
                onClick={() => {
                  onFilterChange({ ...filters, keyword: "" });
                  inputRef.current?.focus();
                }}
              >
                <X size={15} strokeWidth={2.5} />
              </Button>
            )}
          </div>
          <SavedCompareButton onCompareFavorites={onCompareFavorites} />
          {showAccount && <AccountButton />}
        </form>
        <SearchConditionBar
          // 一覧の固定見出し（地方・都道府県）より前に出す
          className="z-40 shrink-0 px-4 pb-2"
          filters={filters}
          resorts={resorts}
          resultCount={filteredResorts.length}
          onFilterChange={onFilterChange}
          onCommit={onSearch}
        />
        <div
          data-ski-resort-list-scroll-container="true"
          className="flex-grow min-h-0"
        >
          <SkiResortList
            resorts={filteredResorts}
            sortControls={sortControls}
            liftTicketInput={
              filters.liftTicket ?? DEFAULT_LIFT_TICKET_SEARCH_INPUT
            }
            onSelectResort={onSelectResort}
            selectedCompareIdSet={selectedCompareIdSet}
            onToggleCompare={onToggleCompare}
            onHoverResortChange={onHoverResortChange}
            showHeader={false}
            onLiftTicketInputChange={liftTicket =>
              onFilterChange({ ...filters, liftTicket })
            }
            liftTicketResults={liftTicketResults}
            priceLabel={priceLabel}
            featureLines={{
              yukiMagi: filters.yukiMagi,
              evCharger: filters.evCharger,
            }}
          />
        </div>
        {floatingActions}
      </div>
    </div>
  );
};
