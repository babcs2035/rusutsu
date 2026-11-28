"use client";

import { ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  FilterAreaFields,
  FilterDetailFields,
} from "@/features/filters/components/FilterConditionFields";
import { DEFAULT_FILTERS } from "@/features/filters/constants";
import type { Filters } from "@/features/filters/types";
import {
  hasNumericFilterValue,
  isLiftTicketFilterActive,
} from "@/features/filters/utils/filterLabels";
import { areFiltersEqual } from "@/features/filters/utils/filterResorts";
import { TicketPartyEditor } from "@/features/lift-ticket/components/TicketPartyEditor";
import { DEFAULT_LIFT_TICKET_SEARCH_INPUT } from "@/features/lift-ticket/utils/calculateLiftTicket";
import { conditionsLabel } from "@/features/lift-ticket/utils/priceText";
import { SEARCH_RENTAL_OPTIONS } from "@/features/lift-ticket/utils/rental";
import { cn } from "@/lib/utils";
import { PanelCloseButton } from "@/shared/components/PanelCloseButton";
import type { MapSkiResort } from "@/types/skiResorts";

type ConditionKind = "area" | "price" | "filter";

const TITLES: Record<ConditionKind, string> = {
  area: "エリア",
  price: "料金の条件",
  filter: "絞り込み",
};

const areaLabelOf = (prefectures: string[]) => {
  if (prefectures.length === 0) return "エリア";
  const names = prefectures.map(name => name.replace(/[府県]$/, ""));
  return `${names.slice(0, 2).join("・")}${
    names.length > 2 ? ` ほか${names.length - 2}` : ""
  }`;
};

const detailFilterCountOf = (filters: Filters) =>
  [
    filters.yukiMagi,
    filters.evCharger,
    ...filters.passPrograms.map(() => true),
    hasNumericFilterValue(filters.minVertical),
    hasNumericFilterValue(filters.minBaseElevation),
    hasNumericFilterValue(filters.maxBaseElevation),
    hasNumericFilterValue(filters.minTopElevation),
    hasNumericFilterValue(filters.maxTopElevation),
    hasNumericFilterValue(filters.minCourses),
    hasNumericFilterValue(filters.minLifts),
    hasNumericFilterValue(filters.minCourseDistance),
  ].filter(Boolean).length;

/** そのモーダルが持つ条件だけを初期値に戻す */
const clearedFilters = (filters: Filters, kind: ConditionKind): Filters => {
  if (kind === "area") return { ...filters, prefectures: [] };
  if (kind === "price")
    return {
      ...filters,
      liftTicket: DEFAULT_FILTERS.liftTicket,
      maxPrice: null,
    };
  return {
    ...DEFAULT_FILTERS,
    keyword: filters.keyword,
    prefectures: filters.prefectures,
    liftTicket: filters.liftTicket,
    maxPrice: filters.maxPrice,
  };
};

const ConditionChip = ({
  active,
  open,
  floating,
  light,
  label,
  ariaLabel,
  className,
  onClick,
}: {
  active: boolean;
  open: boolean;
  floating: boolean;
  light: boolean;
  label: string;
  ariaLabel: string;
  className?: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-label={ariaLabel}
    aria-expanded={open}
    aria-haspopup="dialog"
    title={label}
    className={cn(
      "flex h-8 min-w-0 items-center gap-0.5 rounded-full border pr-1.5 pl-3 text-xs font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40",
      // 地図の上でも白い一覧の上でも埋もれないよう、濃い色で塗る。
      // 条件を選んだチップだけ青にして、選んでいないチップと見分ける
      active
        ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
        : light
          ? // 暗い航空写真の上では白にして浮き立たせる
            "border-white bg-white text-gray-950 hover:bg-gray-100"
          : "border-gray-950 bg-gray-950 text-white hover:bg-gray-800",
      floating && "shadow-[0_2px_8px_rgba(15,23,42,0.45)]",
      open && "ring-2 ring-ring/50 ring-offset-1",
      className,
    )}
    onClick={onClick}
  >
    <span className="min-w-0 truncate">{label}</span>
    <ChevronDown
      className="size-3.5 shrink-0 opacity-80 max-[359px]:hidden"
      aria-hidden
    />
  </button>
);

/**
 * 検索条件の入口。「エリア」「料金」「絞り込み」のチップを1行に並べ、
 * 押すとチップのすぐ下にその条件だけのモーダルを開く。
 * 中で変えた条件はすぐ一覧と地図に反映し、×か外側を押して閉じる。
 */
export const SearchConditionBar = ({
  filters,
  resorts,
  resultCount,
  floating = false,
  light = false,
  className,
  trailing,
  onFilterChange,
  onCommit,
}: {
  filters: Filters;
  resorts: MapSkiResort[];
  resultCount: number;
  /** 地図に重ねるとき（スマホの地図）は影を付ける */
  floating?: boolean;
  /** 航空写真の上に重ねるとき。選んでいないチップを白にする */
  light?: boolean;
  className?: string;
  /** チップの行の右端に置くもの（PCの件数など） */
  trailing?: ReactNode;
  onFilterChange: (filters: Filters) => void;
  /** 条件を変えてモーダルを閉じたとき。地図を結果に寄せる */
  onCommit: () => void;
}) => {
  const [openKind, setOpenKind] = useState<ConditionKind | null>(null);
  const filtersAtOpenRef = useRef<Filters | null>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const liftTicket = filters.liftTicket ?? DEFAULT_LIFT_TICKET_SEARCH_INPUT;
  const isPriceActive =
    isLiftTicketFilterActive(liftTicket) ||
    hasNumericFilterValue(filters.maxPrice);
  const detailCount = detailFilterCountOf(filters);

  const close = () => {
    const before = filtersAtOpenRef.current;
    filtersAtOpenRef.current = null;
    setOpenKind(null);
    if (before && !areFiltersEqual(before, filtersRef.current)) onCommit();
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  const toggle = (kind: ConditionKind) => {
    if (openKind === kind) {
      close();
      return;
    }
    filtersAtOpenRef.current ??= filters;
    setOpenKind(kind);
  };

  useEffect(() => {
    if (!openKind) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openKind]);

  // 条件を変えるまでは「日付・人数」とだけ出す（一覧の料金は今日・大人1人・1日券のまま）。
  // 変えたら、その内容をそのまま出す
  const priceLabel = isPriceActive
    ? `${conditionsLabel(liftTicket)}${
        hasNumericFilterValue(filters.maxPrice)
          ? `　〜¥${filters.maxPrice.toLocaleString("ja-JP")}`
          : ""
      }`
    : "日付・人数";

  return (
    <div
      data-search-condition-bar="true"
      className={cn("pointer-events-none relative", className)}
    >
      {openKind && (
        // 外側を押すと閉じる。スマホは後ろの地図・一覧が見える薄さにする
        <button
          type="button"
          aria-label="条件を閉じる"
          tabIndex={-1}
          className="pointer-events-auto fixed inset-0 cursor-default bg-slate-900/10 md:bg-transparent"
          onClick={close}
        />
      )}
      <div className="relative flex min-w-0 items-center gap-1.5 [&>*]:pointer-events-auto">
        <ConditionChip
          active={filters.prefectures.length > 0}
          open={openKind === "area"}
          floating={floating}
          light={light}
          label={areaLabelOf(filters.prefectures)}
          ariaLabel={`エリアを選ぶ：${
            filters.prefectures.length > 0
              ? areaLabelOf(filters.prefectures)
              : "指定なし"
          }`}
          className="shrink-0"
          onClick={() => toggle("area")}
        />
        <ConditionChip
          active={isPriceActive}
          open={openKind === "price"}
          floating={floating}
          light={light}
          label={priceLabel}
          ariaLabel={`日程と利用者、レンタル、予算の料金条件を編集：${
            isPriceActive ? priceLabel : "指定なし"
          }`}
          className="shrink"
          onClick={() => toggle("price")}
        />
        <ConditionChip
          active={detailCount > 0}
          open={openKind === "filter"}
          floating={floating}
          light={light}
          label={`絞り込み${detailCount > 0 ? ` ${detailCount}` : ""}`}
          ariaLabel={`絞り込み条件を選ぶ：${detailCount}件選択中`}
          className="shrink-0"
          onClick={() => toggle("filter")}
        />
        {trailing && <div className="ml-auto shrink-0">{trailing}</div>}
      </div>
      {openKind && (
        <Card
          size="sm"
          role="dialog"
          aria-label={TITLES[openKind]}
          className="pointer-events-auto absolute inset-x-0 top-full z-10 mt-2 max-h-[calc(100dvh-env(safe-area-inset-top,0px)-8rem)] gap-0 bg-popover py-0 text-popover-foreground shadow-lg"
        >
          <div className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-border px-2.5 py-1.5 md:px-3">
            <h2 className="shrink-0 whitespace-nowrap text-base font-semibold text-gray-900 font-heading">
              {TITLES[openKind]}
            </h2>
            <Badge
              variant="secondary"
              className="shrink-0 px-1.5 font-semibold tabular-nums"
            >
              {resultCount.toLocaleString("ja-JP")}件
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto px-1.5 text-muted-foreground"
              aria-label="条件をクリア"
              onClick={() => onFilterChange(clearedFilters(filters, openKind))}
            >
              <span className="max-[359px]:hidden">条件をクリア</span>
              <span className="min-[360px]:hidden">クリア</span>
            </Button>
            <PanelCloseButton onClose={close} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 md:p-4">
            {openKind === "area" && (
              <FilterAreaFields
                filters={filters}
                resorts={resorts}
                onFilterChange={onFilterChange}
                showHeading={false}
              />
            )}
            {openKind === "price" && (
              <div className="flex flex-col gap-4">
                <TicketPartyEditor
                  value={liftTicket}
                  onChange={next =>
                    onFilterChange({ ...filters, liftTicket: next })
                  }
                  rentalOptions={SEARCH_RENTAL_OPTIONS}
                  compact
                />
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <span className="shrink-0">予算</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="任意"
                    aria-label="予算（合計の上限、円）"
                    value={filters.maxPrice == null ? "" : filters.maxPrice}
                    className="h-9 w-28 bg-white text-right text-sm"
                    onChange={event => {
                      const digits = event.target.value.replace(/\D/g, "");
                      onFilterChange({
                        ...filters,
                        maxPrice:
                          digits === "" ? null : Number.parseInt(digits, 10),
                      });
                    }}
                  />
                  <span className="shrink-0 whitespace-nowrap">円まで</span>
                </label>
              </div>
            )}
            {openKind === "filter" && (
              <div className="flex flex-col gap-4">
                <FilterDetailFields
                  filters={filters}
                  resorts={resorts}
                  onFilterChange={onFilterChange}
                />
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};
