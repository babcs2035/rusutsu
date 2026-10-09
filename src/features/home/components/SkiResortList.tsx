"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { calculateLiftTicketsForList } from "@/actions/skiResorts";
import { FavoriteButton } from "@/features/favorites/FavoriteButton";
import { TicketCalculationCard } from "@/features/lift-ticket/components/TicketCalculationCard";
import type {
  LiftTicketSearchInput,
  TicketCalculationResult,
} from "@/features/lift-ticket/types";
import { CompareResortButton } from "@/shared/components/CompareResortButton";
import { CopyResortNameButton } from "@/shared/components/CopyResortNameButton";
import { RubyText } from "@/shared/components/RubyText";
import type { MapSkiResort } from "@/types/skiResorts";

const HOVER_HIGHLIGHT_MEDIA_QUERY = "(min-width: 48em)";

const canUseHoverHighlight = () =>
  typeof window !== "undefined" &&
  window.matchMedia(HOVER_HIGHLIGHT_MEDIA_QUERY).matches;

type ListLiftTicketResults =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "done"; results: Record<string, TicketCalculationResult | null> };

/**
 * 日付が入ったときだけ、一覧にある料金データ付きスキー場の料金をサーバーで
 * 計算して受け取る。料金データ本体はブラウザへ送らない。
 */
const useListLiftTicketResults = (
  resorts: MapSkiResort[],
  input: LiftTicketSearchInput,
): ListLiftTicketResults => {
  const requestKey = useMemo(() => {
    const ids = [
      ...new Set(
        resorts.flatMap(resort =>
          resort.liftTicketResortId ? [resort.liftTicketResortId] : [],
        ),
      ),
    ].sort();
    return input.visitDate && ids.length > 0
      ? JSON.stringify({ ids, input })
      : null;
  }, [resorts, input]);
  const [state, setState] = useState<{
    key: string;
    value: ListLiftTicketResults;
  } | null>(null);

  useEffect(() => {
    if (requestKey === null) return;
    const { ids, input: requestInput } = JSON.parse(requestKey) as {
      ids: string[];
      input: LiftTicketSearchInput;
    };
    let cancelled = false;
    calculateLiftTicketsForList(ids, requestInput)
      .then(results => {
        if (!cancelled)
          setState({ key: requestKey, value: { status: "done", results } });
      })
      .catch(() => {
        if (!cancelled)
          setState({ key: requestKey, value: { status: "error" } });
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  if (requestKey === null) return { status: "idle" };
  return state?.key === requestKey ? state.value : { status: "loading" };
};

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
  const liftTicketResults = useListLiftTicketResults(resorts, liftTicketInput);
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
          data-session-scroll="results-list"
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
              liftTicketResults={liftTicketResults}
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
    liftTicketResults,
  }: {
    resort: MapSkiResort;
    isCompareSelected: boolean;
    onSelectResort: (id: string) => void;
    onToggleCompare: (id: string, selected: boolean) => void;
    onHoverResortChange?: (id: string | null) => void;
    liftTicketResults: ListLiftTicketResults;
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
    const liftTicketResortId = resort.liftTicketResortId;

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
            if (
              e.target === e.currentTarget &&
              (e.key === "Enter" || e.key === " ")
            ) {
              e.preventDefault();
              handleSelect();
            }
          }}
          onClick={event => {
            // 無効なボタンは pointer-events:none で操作行へクリックが抜ける。
            // お気に入り・比較の領域では、詳細への遷移を起こさない。
            if (
              event.target instanceof Element &&
              event.target.closest("[data-ski-resort-list-actions='true']")
            ) {
              return;
            }
            handleSelect();
          }}
          className="w-full cursor-pointer text-left transition-all duration-200 ease-in-out border-b border-gray-100 md:border md:rounded-xl md:border-gray-200 md:bg-white md:px-4 md:py-1 md:shadow-sm hover:md:border-blue-600 hover:md:shadow-md hover:md:-translate-y-0.5 focus-visible:outline-none focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10"
        >
          <div className="flex min-w-0 flex-col py-0.5 md:py-0">
            <p className="min-w-0 break-words font-bold text-base md:text-lg leading-tight text-gray-900 font-[var(--font-heading)]">
              <RubyText segments={resort.nameRuby} fallback={resort.nameJa} />
              <CopyResortNameButton
                name={resort.nameJa}
                className="ml-1 size-5 align-middle"
                onInteract={clearHighlight}
              />
            </p>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p className="min-w-0 flex-1 break-words text-xs md:text-sm font-medium leading-snug text-gray-500">
                {resort.prefecture} · {resort.town}
              </p>
              <div
                data-ski-resort-list-actions="true"
                className="flex shrink-0 items-center justify-end gap-1"
              >
                <FavoriteButton
                  resortId={resort.id}
                  name={resort.nameJa}
                  className="size-6 md:size-7"
                />
                <CompareResortButton
                  isSelected={isCompareSelected}
                  resortName={resort.nameJa}
                  size="sm"
                  className="h-6 md:h-7 min-w-16 md:min-w-18 rounded-lg text-xs md:text-sm transition-smooth"
                  onPointerDown={handleActionPointerDown}
                  onClick={e => {
                    e.stopPropagation();
                    onToggleCompare(resort.id, !isCompareSelected);
                  }}
                />
              </div>
            </div>
            {resort.formerNames.length > 0 && (
              <p className="min-w-0 break-words text-[0.6875rem] md:text-xs font-medium leading-tight text-gray-400">
                旧称: {resort.formerNames.map(name => name.name).join("、")}
              </p>
            )}
            {liftTicketResortId &&
              (liftTicketResults.status === "done" ? (
                <div
                  className="mt-1"
                  onPointerDown={event => event.stopPropagation()}
                >
                  <TicketCalculationCard
                    result={
                      liftTicketResults.results[liftTicketResortId] ?? null
                    }
                    compact
                  />
                </div>
              ) : (
                <p className="mt-1 text-xs font-semibold text-blue-600">
                  {liftTicketResults.status === "loading"
                    ? "料金を計算中…"
                    : liftTicketResults.status === "error"
                      ? "料金を計算できませんでした"
                      : "日付・人数別の料金計算に対応"}
                </p>
              ))}
          </div>
        </div>
      </li>
    );
  },
);

SkiResortListItem.displayName = "SkiResortListItem";
