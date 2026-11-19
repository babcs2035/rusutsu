"use client";

import { ArrowDownWideNarrow, ChevronDown, LoaderCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ResortSortControls } from "../hooks/useResortSort";
import {
  PREFECTURE_INNER_ORDERS,
  RESORT_SORT_OPTIONS,
} from "../utils/sortResorts";

const ITEM_CLASS = "min-h-9 whitespace-nowrap pl-2 text-[13px] font-medium";

export function ResortSortButton({
  order,
  onOrderChange,
  prefectureOrder,
  onPrefectureOrderChange,
  locating,
}: ResortSortControls) {
  const selected = RESORT_SORT_OPTIONS.find(option => option.value === order);
  const inner = PREFECTURE_INNER_ORDERS.find(
    option => option.value === prefectureOrder,
  );
  const Icon = locating ? LoaderCircle : ArrowDownWideNarrow;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`並び替え：${order === "prefecture" ? `${selected?.label}（${inner?.description}）` : selected?.label}`}
        className="flex h-8 min-w-0 shrink items-center justify-center gap-1 whitespace-nowrap rounded-full border border-gray-200 bg-white px-2 text-[13px] font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
      >
        <Icon
          className={`size-3.5 shrink-0 ${locating ? "animate-spin" : ""}`}
        />
        <span className="min-w-0 truncate">
          {/* 都道府県別は県内の並びを添える（例: 都道府県・滑走距離順） */}
          {order === "prefecture"
            ? `都道府県・${inner?.label}`
            : selected?.shortLabel}
        </span>
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
          {RESORT_SORT_OPTIONS.map(option =>
            option.value === "prefecture" ? (
              // 都道府県別の行の右に、県内の並び（距離順／名前順）を選ぶボタンを置く
              <div key={option.value} className="flex items-center gap-1">
                <DropdownMenuRadioItem
                  value={option.value}
                  closeOnClick
                  className={cn(ITEM_CLASS, "min-w-0 flex-1")}
                >
                  {option.label}
                </DropdownMenuRadioItem>
                <div
                  role="group"
                  aria-label="都道府県内の並び"
                  className="flex h-7 shrink-0 items-center rounded-full border border-gray-200 bg-white p-0.5"
                >
                  {PREFECTURE_INNER_ORDERS.map(innerOption => {
                    const active =
                      order === "prefecture" &&
                      innerOption.value === prefectureOrder;
                    return (
                      <DropdownMenuItem
                        key={innerOption.value}
                        closeOnClick
                        aria-pressed={active}
                        aria-label={`都道府県別（${innerOption.description}）`}
                        onClick={() => {
                          onPrefectureOrderChange(innerOption.value);
                          onOrderChange("prefecture");
                        }}
                        className={cn(
                          "h-full rounded-full px-2 py-0 text-[13px] font-medium whitespace-nowrap",
                          active
                            ? "bg-gray-900 text-white focus:bg-gray-800 focus:text-white focus:**:text-white"
                            : "text-gray-700",
                        )}
                      >
                        {innerOption.label}
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              </div>
            ) : (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                closeOnClick
                className={ITEM_CLASS}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ),
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
