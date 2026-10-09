"use client";

import { Search, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountButton } from "@/features/favorites/AccountButton";
import { FilterPanel } from "@/features/filters/FilterPanel";
import type { Filters } from "@/features/filters/types";
import {
  areFiltersEqual,
  matchesFilters,
} from "@/features/filters/utils/filterResorts";
import { DEFAULT_LIFT_TICKET_SEARCH_INPUT } from "@/features/lift-ticket/utils/calculateLiftTicket";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import type { MapSkiResort } from "@/types/skiResorts";
import { ComparisonActions } from "./ComparisonActions";
import { SearchButton } from "./SearchButton";
import { SkiResortList } from "./SkiResortList";

type Props = {
  showAccount?: boolean;
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
  onKeywordClear: () => void;
  onKeyboardInputBlur: () => void;
  onKeyboardInputFocus: () => void;
  onClearCompare: () => void;
  onOpenCompare: () => void;
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
  compareCount,
  hasSearched,
  isCompareOpen,
  isFilterEditorOpen,
  selectedCompareIdSet,
  onExpandedChange,
  onFilterChange,
  onKeywordClear,
  onKeyboardInputBlur,
  onKeyboardInputFocus,
  onClearCompare,
  onOpenCompare,
  onCompareFavorites,
  onSearch,
  onSelectResort,
  onToggleCompare,
  onHoverResortChange,
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const filterPanelId = useId();
  const [draft, setDraft] = useState({ applied: filters, filters });
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  // 外部の条件変更（スマホからの検索など）に合わせて入力値も更新する。
  if (draft.applied !== filters) {
    setDraft({ applied: filters, filters });
  }
  const draftFilters = draft.applied === filters ? draft.filters : filters;
  const updateDraftFilters = (nextFilters: Filters) => {
    setDraft({ applied: filters, filters: nextFilters });
  };
  const search = () => {
    inputRef.current?.blur();
    onFilterChange(draftFilters);
    onSearch();
  };
  const open = () => {
    updateDraftFilters(filters);
    flushSync(() => onExpandedChange(true));
    inputRef.current?.focus({ preventScroll: true });
  };
  const close = () => {
    inputRef.current?.blur();
    updateDraftFilters(filters);
    onExpandedChange(false);
  };
  const draftResultCount = resorts.filter(resort =>
    matchesFilters(resort, draftFilters),
  ).length;

  return (
    <div
      className={cn(
        "hidden md:block h-full w-[var(--desktop-search-panel-width)] flex-shrink-0 relative z-10",
        "border-l border-gray-200 bg-white",
        "shadow-[4px_0_20px_rgba(0,0,0,0.06)]",
      )}
    >
      <div className="flex h-full flex-col overflow-hidden">
        <form
          className="flex shrink-0 items-center gap-2.5 px-4 pt-2.5 pb-2"
          onSubmit={event => {
            event.preventDefault();
            search();
          }}
        >
          {isFilterEditorOpen ? (
            <div className="relative h-12 min-w-0 flex-1 overflow-hidden rounded-full border border-gray-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.12)]">
              <Search
                size={18}
                className="pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 text-gray-500"
              />
              <Input
                ref={inputRef}
                aria-label="スキー場を検索"
                aria-expanded={isFilterEditorOpen}
                aria-controls={isFilterEditorOpen ? filterPanelId : undefined}
                type="text"
                name="keyword"
                autoComplete="off"
                placeholder="スキー場名を入力"
                value={draftFilters.keyword}
                className={cn(
                  "h-12 w-full rounded-full border-0 bg-transparent pl-10 text-base font-medium text-gray-800 shadow-none md:text-base",
                  draftFilters.keyword ? "pr-11" : "pr-3",
                )}
                onChange={event =>
                  updateDraftFilters({
                    ...draftFilters,
                    keyword: event.target.value,
                  })
                }
                onFocus={() => {
                  onExpandedChange(true);
                  onKeyboardInputFocus();
                }}
                onBlur={onKeyboardInputBlur}
                onKeyDown={event => {
                  if (event.key !== "Enter") return;
                  if (
                    event.nativeEvent.isComposing ||
                    event.nativeEvent.keyCode === 229
                  ) {
                    return;
                  }
                  event.preventDefault();
                  search();
                }}
              />
              {draftFilters.keyword && (
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="検索キーワードをクリア"
                  className="absolute inset-y-0 right-2.5 my-auto h-7 w-7 min-w-7 rounded-full p-0 text-gray-600 shadow-none hover:bg-gray-50"
                  onClick={() => {
                    updateDraftFilters({ ...draftFilters, keyword: "" });
                    inputRef.current?.focus();
                  }}
                >
                  <X size={15} strokeWidth={2.5} />
                </Button>
              )}
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <SearchButton
                keyword={filters.keyword}
                onOpen={open}
                onKeywordClear={onKeywordClear}
              />
            </div>
          )}
          <div className="flex h-10 w-[6.75rem] shrink-0 items-center justify-end gap-2">
            {isFilterEditorOpen ? (
              <>
                <Button type="submit" className="h-10 rounded-lg px-4">
                  検索
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="検索を閉じる"
                  className="h-10 w-10 min-w-10 rounded-full border border-gray-200 bg-white p-0 text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900"
                  onClick={() => {
                    if (!areFiltersEqual(draftFilters, filters)) {
                      setDiscardDialogOpen(true);
                      return;
                    }
                    close();
                  }}
                >
                  <X size={18} strokeWidth={2.5} />
                </Button>
              </>
            ) : (
              showAccount && <AccountButton />
            )}
          </div>
        </form>
        <ConfirmDialog
          open={discardDialogOpen}
          onOpenChange={setDiscardDialogOpen}
          title="変更の破棄"
          description="変更を破棄しますか？"
          onConfirm={close}
          confirmLabel="破棄する"
        />
        {isFilterEditorOpen && (
          <div id={filterPanelId} className="flex min-h-0 flex-1 flex-col">
            <FilterPanel
              filters={draftFilters}
              resorts={resorts}
              resultCount={draftResultCount}
              isExpanded
              canCollapse={false}
              onExpandedChange={onExpandedChange}
              onFilterChange={updateDraftFilters}
              onKeyboardInputBlur={onKeyboardInputBlur}
              onKeyboardInputFocus={onKeyboardInputFocus}
              onSearch={search}
              showKeywordSearch={false}
              title="絞り込み"
            />
          </div>
        )}
        <ComparisonActions
          compareCount={compareCount}
          isCompareOpen={isCompareOpen}
          className="py-2"
          onOpenCompare={onOpenCompare}
          onClearCompare={onClearCompare}
          onCompareFavorites={onCompareFavorites}
        />
        {!isFilterEditorOpen && (
          <>
            <div className="px-4 py-2 text-sm font-semibold text-gray-900">
              {hasSearched ? "検索結果" : "スキー場"}{" "}
              {filteredResorts.length.toLocaleString()}件
            </div>
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
          </>
        )}
      </div>
    </div>
  );
};
