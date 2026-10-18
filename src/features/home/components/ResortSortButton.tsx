"use client";

import { ArrowDownWideNarrow, ChevronDown, LoaderCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ResortSortControls } from "../hooks/useResortSort";
import { RESORT_SORT_OPTIONS } from "../utils/sortResorts";

export function ResortSortButton({
  order,
  onOrderChange,
  locating,
}: ResortSortControls) {
  const selected = RESORT_SORT_OPTIONS.find(option => option.value === order);
  const Icon = locating ? LoaderCircle : ArrowDownWideNarrow;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`並び替え：${selected?.label}`}
        className="flex h-8 w-[7.5rem] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-gray-200 bg-white px-2 text-[13px] font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
      >
        <Icon
          className={`size-3.5 shrink-0 ${locating ? "animate-spin" : ""}`}
        />
        <span>{selected?.shortLabel}</span>
        <ChevronDown className="size-3 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 max-w-[calc(100vw-2rem)] text-[13px] font-medium text-gray-700"
      >
        <DropdownMenuRadioGroup
          value={order}
          onValueChange={value => {
            const option = RESORT_SORT_OPTIONS.find(
              item => item.value === value,
            );
            if (option) onOrderChange(option.value);
          }}
        >
          {RESORT_SORT_OPTIONS.map(option => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              closeOnClick
              className="min-h-9 whitespace-nowrap pl-2 text-[13px] font-medium"
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
