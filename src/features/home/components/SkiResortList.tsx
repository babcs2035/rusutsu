"use client";

import { Check, Plus } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { memo, startTransition, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { TicketCalculationCard } from "@/features/lift-ticket/components/TicketCalculationCard";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import { calculateLiftTicketForSeasons } from "@/features/lift-ticket/utils/calculateLiftTicket";
import { CopyResortNameButton } from "@/shared/components/CopyResortNameButton";
import { RubyText } from "@/shared/components/RubyText";
import type { MapSkiResort } from "@/types/skiResorts";

const HOVER_HIGHLIGHT_MEDIA_QUERY = "(min-width: 48em)";

const canUseHoverHighlight = () =>
  typeof window !== "undefined" &&
  window.matchMedia(HOVER_HIGHLIGHT_MEDIA_QUERY).matches;

type Props = {
  resorts: MapSkiResort[];
  onSelectResort: (id: string) => void;
  selectedCompareIdSet: Set<string>;
  onToggleCompare: (id: string, selected: boolean) => void;
  onHoverResortChange?: (id: string | null) => void;
  showHeader?: boolean;
  liftTicketInput: LiftTicketSearchInput;
};

/**
 * 右カラムまたはボトムシートに表示されるスキー場一覧コンポーネント
 */
export const SkiResortList = ({
  resorts,
  onSelectResort,
  selectedCompareIdSet,
  onToggleCompare,
  onHoverResortChange,
  showHeader = true,
  liftTicketInput,
}: Props) => {
  const [localSelectedCompareIdSet, setLocalSelectedCompareIdSet] = useState(
    () => new Set(selectedCompareIdSet),
  );

  useEffect(() => {
    setLocalSelectedCompareIdSet(new Set(selectedCompareIdSet));
  }, [selectedCompareIdSet]);

  const handleToggleCompare = useCallback(
    (id: string, selected: boolean) => {
      setLocalSelectedCompareIdSet(prev => {
        const next = new Set(prev);
        if (selected) next.add(id);
        else next.delete(id);
        return next;
      });

      startTransition(() => {
        onToggleCompare(id, selected);
      });
    },
    [onToggleCompare],
  );

  return (
    <div className="flex h-full flex-col bg-transparent">
      {/* ヘッダーエリア */}
      {showHeader && (
        <div className="border-b border-gray-100 px-4 pt-2 md:pt-6">
          <h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">
            {resorts.length} 件見つかりました
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            選択すると詳細を表示します
          </p>
        </div>
      )}

      {/* スクロール可能なリスト本体 */}
      {resorts.length === 0 ? (
        <div className="flex flex-grow items-center justify-center px-6 py-12 text-center">
          <p className="text-sm font-semibold text-gray-500">
            条件に合うスキー場がありません
          </p>
        </div>
      ) : (
        <ul
          data-ski-resort-list-scroll="true"
          className="flex-grow list-none overflow-y-auto px-4 pt-0 pb-[env(safe-area-inset-bottom,0px)] md:gap-3 md:py-4"
          onScroll={() => onHoverResortChange?.(null)}
        >
          {resorts.map(resort => (
            <SkiResortListItem
              key={resort.id}
              resort={resort}
              isCompareSelected={localSelectedCompareIdSet.has(resort.id)}
              onSelectResort={onSelectResort}
              onToggleCompare={handleToggleCompare}
              onHoverResortChange={onHoverResortChange}
              liftTicketInput={liftTicketInput}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

const SkiResortListItem = memo(
  ({
    resort,
    isCompareSelected,
    onSelectResort,
    onToggleCompare,
    onHoverResortChange,
    liftTicketInput,
  }: {
    resort: MapSkiResort;
    isCompareSelected: boolean;
    onSelectResort: (id: string) => void;
    onToggleCompare: (id: string, selected: boolean) => void;
    onHoverResortChange?: (id: string | null) => void;
    liftTicketInput: LiftTicketSearchInput;
  }) => {
    const highlightResort = () => {
      if (!canUseHoverHighlight()) return;
      onHoverResortChange?.(resort.id);
    };
    const clearHighlight = () => onHoverResortChange?.(null);
    const highlightResortForMouse = (event: ReactPointerEvent) => {
      if (event.pointerType !== "mouse") return;
      highlightResort();
    };
    const handleActionPointerDown = (e: ReactPointerEvent) => {
      e.stopPropagation();
      clearHighlight();
    };
    const handleSelect = () => {
      clearHighlight();
      onSelectResort(resort.id);
    };
    const liftTicketResult =
      resort.liftTickets.length > 0 && liftTicketInput.visitDate
        ? calculateLiftTicketForSeasons(resort.liftTickets, liftTicketInput)
        : null;

    return (
      <li className="block">
        <div
          data-ski-resort-list-item="true"
          role="button"
          tabIndex={0}
          aria-label={`${resort.nameJa}の位置を地図で強調`}
          onPointerEnter={highlightResortForMouse}
          onPointerLeave={event => {
            if (event.pointerType === "mouse") clearHighlight();
          }}
          onFocus={highlightResort}
          onBlur={clearHighlight}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleSelect();
            }
          }}
          onClick={handleSelect}
          className="w-full cursor-pointer text-left transition-all duration-200 ease-in-out border-b border-gray-100 md:border md:rounded-xl md:border-gray-200 md:bg-white md:px-4 md:py-3 md:shadow-sm hover:md:border-blue-600 hover:md:shadow-md hover:md:-translate-y-0.5 focus-visible:outline-none focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10"
        >
          <div className="flex min-h-[48px] md:min-h-auto items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 items-center gap-1">
                <p className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-bold text-base md:text-lg leading-tight text-gray-900 font-[var(--font-heading)]">
                  <RubyText
                    segments={resort.nameRuby}
                    fallback={resort.nameJa}
                  />
                </p>
                <CopyResortNameButton
                  name={resort.nameJa}
                  className="-my-1"
                  onInteract={clearHighlight}
                />
              </div>
              <p className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs md:text-sm font-medium leading-snug text-gray-500">
                {resort.prefecture} · {resort.town}
              </p>
              {resort.formerNames.length > 0 && (
                <p className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[0.6875rem] md:text-xs font-medium leading-snug text-gray-400">
                  旧称:{" "}
                  {resort.formerNames
                    .map(formerName => formerName.name)
                    .join("、")}
                </p>
              )}
              {resort.liftTickets.length > 0 &&
                (liftTicketInput.visitDate ? (
                  <div
                    className="mt-1"
                    onPointerDown={event => event.stopPropagation()}
                  >
                    <TicketCalculationCard result={liftTicketResult} compact />
                  </div>
                ) : (
                  <p className="mt-1 text-xs font-semibold text-blue-600">
                    日付・人数別の料金計算に対応
                  </p>
                ))}
            </div>
            <div className="flex flex-shrink-0 items-center justify-end gap-2 min-w-[5.75rem] md:min-w-[100px]">
              <Button
                type="button"
                size="sm"
                variant={isCompareSelected ? "default" : "outline"}
                className={`flex items-center gap-1 rounded-lg font-semibold h-8 md:h-9 min-w-[5.75rem] md:min-w-[100px] w-auto text-xs transition-smooth`}
                aria-pressed={isCompareSelected}
                aria-label={`${resort.nameJa}を${
                  isCompareSelected ? "比較対象から外す" : "比較対象に追加"
                }`}
                onPointerDown={handleActionPointerDown}
                onClick={e => {
                  e.stopPropagation();
                  onToggleCompare(resort.id, !isCompareSelected);
                }}
              >
                {isCompareSelected ? (
                  <Check className="h-3 w-3" strokeWidth={3} />
                ) : (
                  <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                )}
                <span>{isCompareSelected ? "比較から外す" : "比較に追加"}</span>
              </Button>
            </div>
          </div>
        </div>
      </li>
    );
  },
);

SkiResortListItem.displayName = "SkiResortListItem";
