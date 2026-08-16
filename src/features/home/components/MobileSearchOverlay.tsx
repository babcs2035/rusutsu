"use client";

import { Search, X } from "lucide-react";
import type {
  ChangeEvent as ReactChangeEvent,
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterPanel } from "@/features/filters/FilterPanel";
import type { Filters } from "@/features/filters/types";
import type { MapSkiResort } from "@/types/skiResorts";
import {
  MOBILE_SEARCH_TOP_BAR_HEIGHT,
  MobileSearchTopBarShell,
} from "./MobileSearchTopBarShell";

type Props = {
  filters: Filters;
  resorts: MapSkiResort[];
  filteredResortCount: number;
  isOpen: boolean;
  isSidePanelLayout: boolean;
  overlayRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  filterBottomPadding: string;
  hasChanges: boolean;
  onClose: () => void;
  onFilterAreaPointerDown: (
    event: ReactPointerEvent<HTMLElement> | ReactTouchEvent<HTMLElement>,
  ) => void;
  onFilterChange: (filters: Filters) => void;
  onInputBlur: () => void;
  onInputFocus: () => void;
  onKeywordChange: (event: ReactChangeEvent<HTMLInputElement>) => void;
  onKeywordClear: () => void;
  onSearch: () => void;
  onSubmit: (event: ReactFormEvent<HTMLElement>) => void;
};

export const MobileSearchOverlay = ({
  filters,
  resorts,
  filteredResortCount,
  isOpen,
  isSidePanelLayout,
  overlayRef,
  inputRef,
  scrollRef,
  filterBottomPadding,
  hasChanges,
  onClose,
  onFilterAreaPointerDown,
  onFilterChange,
  onInputBlur,
  onInputFocus,
  onKeywordChange,
  onKeywordClear,
  onSearch,
  onSubmit,
}: Props) => {
  if (!isOpen || isSidePanelLayout) return null;

  const handleKeywordKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    event.currentTarget.blur();
  };

  return (
    <div
      ref={overlayRef}
      data-mobile-search-panel="true"
      className="hide-desktop h-screen min-h-0 flex-col bg-gray-50 overflow-hidden"
    >
      <div className="flex-shrink-0 flex-grow-0">
        <MobileSearchTopBarShell
          onSubmit={onSubmit}
          action={
            <div className="flex min-w-0 h-10 items-center gap-2 overflow-hidden">
              <Button
                type="submit"
                variant="default"
                className="flex-1 min-w-0 h-10 px-4 rounded-lg whitespace-nowrap disabled:bg-blue-200 disabled:text-blue-100 disabled:cursor-not-allowed"
                disabled={!hasChanges}
                aria-label="検索条件を適用"
              >
                適用
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-label="検索を閉じる"
                onClick={onClose}
                className="flex-shrink-0 w-10 h-10 min-w-10 p-0 rounded-full border border-gray-200 bg-white shadow-sm hover:bg-gray-50 text-gray-700 hover:text-gray-900"
              >
                <X size={18} strokeWidth={2.5} />
              </Button>
            </div>
          }
        >
          <div className="relative min-w-0 h-12 rounded-full bg-white border border-gray-200 shadow-[0_10px_30px_rgba(15,23,42,0.12)] overflow-hidden outline-none">
            <div className="absolute left-[8.5px] top-1/2 -translate-y-1/2 text-gray-500 tap-highlight-transparent pointer-events-none">
              <Search size={18} />
            </div>
            <Input
              ref={inputRef}
              aria-label="スキー場を検索"
              type="text"
              value={filters.keyword}
              placeholder="スキー場名を入力"
              className="h-12 w-full rounded-full border-0 bg-transparent text-gray-800 text-base font-medium outline-none shadow-none appearance-none"
              style={{ MozAppearance: "textfield" }}
              autoComplete="off"
              onFocus={onInputFocus}
              onBlur={onInputBlur}
              onChange={onKeywordChange}
              onKeyDown={handleKeywordKeyDown}
            />
            {filters.keyword && (
              <Button
                type="button"
                variant="ghost"
                aria-label="検索キーワードをクリア"
                className="absolute top-1/2 -translate-y-1/2 right-2.5 z-10 flex items-center justify-center w-7 h-7 min-w-7 p-0 rounded-full bg-transparent text-gray-600 shadow-none hover:bg-gray-50 hover:text-gray-700 active:bg-gray-50 active:text-gray-700"
                onClick={onKeywordClear}
              >
                <X size={15} strokeWidth={2.5} />
              </Button>
            )}
          </div>
        </MobileSearchTopBarShell>
      </div>
      <div
        ref={scrollRef}
        data-mobile-search-filter-scroll="true"
        className="flex-1 min-h-0 flex flex-col overflow-y-auto overscroll-contain"
        style={{
          WebkitOverflowScrolling: "touch",
          paddingBottom: filterBottomPadding,
          // MOBILE_SEARCH_TOP_BAR_HEIGHT は calc() 完結の値のため単位を付加しない
          // （`calc(...)px` は不正 CSS で宣言が破棄されていた）
          scrollPaddingTop: MOBILE_SEARCH_TOP_BAR_HEIGHT,
          scrollPaddingBottom: filterBottomPadding,
        }}
        onPointerDown={onFilterAreaPointerDown}
        onTouchStart={onFilterAreaPointerDown}
      >
        <FilterPanel
          filters={filters}
          resorts={resorts}
          resultCount={filteredResortCount}
          isExpanded
          canCollapse={false}
          onExpandedChange={() => undefined}
          onFilterChange={onFilterChange}
          onKeyboardInputBlur={onInputBlur}
          onKeyboardInputFocus={onInputFocus}
          onSearch={onSearch}
          scrollContent={false}
          showKeywordSearch={false}
          title="絞り込み"
        />
      </div>
    </div>
  );
};
