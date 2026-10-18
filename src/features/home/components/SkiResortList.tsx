"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { calculateLiftTicketAndRentalForList } from "@/actions/skiResorts";
import { FavoriteButton } from "@/features/favorites/FavoriteButton";
import type {
  OperatingCount,
  ResortOperatingCounts,
} from "@/features/home/utils/operatingCounts";
import type {
  LiftTicketSearchInput,
  TicketCalculationResult,
} from "@/features/lift-ticket/types";
import { TICKET_PARTY_CATEGORY_LABELS } from "@/features/lift-ticket/utils/calculateLiftTicket";
import type { TicketRentalResult } from "@/features/lift-ticket/utils/rental";
import { cn } from "@/lib/utils";
import { CompareResortButton } from "@/shared/components/CompareResortButton";
import { CopyResortNameButton } from "@/shared/components/CopyResortNameButton";
import { RubyText } from "@/shared/components/RubyText";
import type { MapSkiResort } from "@/types/skiResorts";
import type { ResortSortControls } from "../hooks/useResortSort";
import { formatVisitDates } from "../utils/formatVisitDates";
import { groupResortsByRegion } from "../utils/groupResortsByRegion";
import { GroupedResortList } from "./GroupedResortList";
import { ResortSortButton } from "./ResortSortButton";

const HOVER_HIGHLIGHT_MEDIA_QUERY = "(min-width: 48em)";

const canUseHoverHighlight = () =>
  typeof window !== "undefined" &&
  window.matchMedia(HOVER_HIGHLIGHT_MEDIA_QUERY).matches;

type ListLiftTicketResults =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "done";
      results: Record<
        string,
        {
          ticket: TicketCalculationResult | null;
          rental: TicketRentalResult | null;
        }
      >;
    };

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
    calculateLiftTicketAndRentalForList(ids, requestInput)
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
  sortControls: ResortSortControls;
  onSelectResort: (id: string) => void;
  selectedCompareIdSet: Set<string>;
  onToggleCompare: (id: string, selected: boolean) => void;
  onHoverResortChange?: (id: string | null) => void;
  showHeader?: boolean;
  liftTicketInput: LiftTicketSearchInput;
  onEditLiftTicketConditions: () => void;
};

const dateLabel = (input: LiftTicketSearchInput) => {
  const dates = (
    input.days?.length ? input.days : [{ date: input.visitDate }]
  ).map(day => day.date);
  return formatVisitDates(dates);
};

const conditionsLabel = (input: LiftTicketSearchInput) => {
  const party = input.party
    .filter(group => group.count > 0)
    .map(
      group =>
        `${TICKET_PARTY_CATEGORY_LABELS[group.category]}${group.count}名`,
    )
    .join("・");
  const hasRental = input.party.some(
    group => (group.rental?.items.length ?? 0) > 0,
  );
  return [dateLabel(input), party, hasRental ? "レンタルあり" : null]
    .filter(Boolean)
    .join("　");
};

const priceText = (
  ticket: TicketCalculationResult | null | undefined,
  rental: TicketRentalResult | null | undefined,
) => {
  if (!ticket) return "不明";
  if (["unavailable", "outside_season", "closed"].includes(ticket.status)) {
    return ticket.status === "outside_season" ? "営業期間外" : "不明";
  }
  const ticketAmount = ticket.ticketTotal ?? ticket.knownTicketTotal;
  const rentalAmount = rental?.total ?? rental?.knownTotal ?? 0;
  const uncertain =
    ticket.status === "partial" ||
    (rental != null &&
      rental.status !== "none" &&
      rental.status !== "complete");
  if (uncertain && ticketAmount + rentalAmount === 0) {
    return "料金一部不明";
  }
  return `¥${(ticketAmount + rentalAmount).toLocaleString("ja-JP")}${
    uncertain ? "〜" : ""
  }`;
};

const ListMetric = ({ label, value }: { label: string; value: string }) => (
  <span className="flex min-w-0 items-baseline gap-1 overflow-hidden whitespace-nowrap">
    <span className="shrink-0 text-[11px] font-semibold text-gray-700 @min-[400px]:text-xs">
      {label}
    </span>
    <span
      title={value}
      className="truncate text-[13px] font-bold leading-tight tabular-nums text-blue-700 @min-[300px]:text-sm @min-[400px]:text-base"
    >
      {value}
    </span>
  </span>
);

const OperatingMetric = ({
  label,
  count,
  hasMap,
  isLoading,
  fallbackTotal,
}: {
  label: string;
  count: OperatingCount | null | undefined;
  hasMap: boolean | undefined;
  isLoading: boolean;
  fallbackTotal: number;
}) => {
  const total = count?.total ?? fallbackTotal;
  const value = isLoading
    ? "集計中…"
    : count
      ? count.active == null
        ? `不明/${count.total}`
        : `${count.active}/${count.total}`
      : hasMap === false && total > 0
        ? `不明/${total}`
        : "不明";
  return <ListMetric label={label} value={value} />;
};

/**
 * 右カラムまたはボトムシートに表示されるスキー場一覧コンポーネント
 */
export const SkiResortList = ({
  resorts,
  sortControls,
  onSelectResort,
  selectedCompareIdSet,
  onToggleCompare,
  onHoverResortChange,
  showHeader = true,
  liftTicketInput,
  onEditLiftTicketConditions,
}: Props) => {
  const listRef = useRef<HTMLUListElement>(null);
  const sortOrder = sortControls.order;
  const previousSortOrder = useRef(sortOrder);
  useEffect(() => {
    if (previousSortOrder.current === sortOrder) return;
    previousSortOrder.current = sortOrder;
    // 並び替えたあとは、順位の先頭から見せる。
    listRef.current?.scrollTo({ top: 0 });
  }, [sortOrder]);
  const liftTicketResults = useListLiftTicketResults(resorts, liftTicketInput);
  const regions = useMemo(
    () => (sortOrder === "prefecture" ? groupResortsByRegion(resorts) : []),
    [resorts, sortOrder],
  );
  const operatingCounts = useMemo(
    () =>
      Object.fromEntries(
        resorts.map(resort => [resort.id, resort.operatingCounts]),
      ),
    [resorts],
  );
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
  const renderResort = (resort: MapSkiResort) => (
    <SkiResortListItem
      key={resort.id}
      resort={resort}
      isCompareSelected={localSelectedCompareIdSet.has(resort.id)}
      onSelectResort={onSelectResort}
      onToggleCompare={handleToggleCompare}
      onHoverResortChange={onHoverResortChange}
      liftTicketResults={liftTicketResults}
      operatingCounts={operatingCounts}
    />
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

      <div className="flex min-w-0 shrink-0 items-center gap-1.5 border-b border-gray-100 px-3 pb-2 md:px-4">
        <button
          type="button"
          className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-gray-950 px-3 text-left text-[13px] font-medium text-white shadow-md hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
          onClick={onEditLiftTicketConditions}
          title={conditionsLabel(liftTicketInput)}
          aria-label={`日程と利用者、レンタルの料金計算条件を編集：${conditionsLabel(liftTicketInput)}`}
        >
          <span className="min-w-0 flex-1 truncate">
            {conditionsLabel(liftTicketInput) || "日程・人数を設定"}
          </span>
          <span className="shrink-0 whitespace-nowrap border-l border-white/30 pl-2">
            編集
          </span>
        </button>
        <ResortSortButton {...sortControls} />
      </div>
      {(sortControls.locating || sortControls.locationError) && (
        <p
          role="status"
          className="shrink-0 px-3 pb-1 text-xs text-gray-600 md:px-4"
        >
          {sortControls.locating ? (
            "現在地を取得中…"
          ) : (
            <>
              {sortControls.locationError}
              <button
                type="button"
                className="ml-1 whitespace-nowrap font-semibold text-blue-700 underline"
                onClick={() => sortControls.onOrderChange("distance")}
              >
                再取得
              </button>
            </>
          )}
        </p>
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
          ref={listRef}
          data-ski-resort-list-scroll="true"
          data-session-scroll="results-list"
          className={cn(
            "@container/resort-list flex-grow list-none overflow-y-auto pt-0 pb-[env(safe-area-inset-bottom,0px)] md:gap-3 md:py-4",
            sortOrder === "prefecture"
              ? "scroll-pt-[4.75rem] px-3 md:pt-0"
              : "px-4",
          )}
          onScroll={() => onHoverResortChange?.(null)}
        >
          {sortOrder === "prefecture" ? (
            <GroupedResortList regions={regions} renderResort={renderResort} />
          ) : (
            resorts.map(renderResort)
          )}
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
    operatingCounts,
  }: {
    resort: MapSkiResort;
    isCompareSelected: boolean;
    onSelectResort: (id: string) => void;
    onToggleCompare: (id: string, selected: boolean) => void;
    onHoverResortChange?: (id: string | null) => void;
    liftTicketResults: ListLiftTicketResults;
    operatingCounts: Record<string, ResortOperatingCounts> | null;
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
    const rentalResult =
      liftTicketResortId && liftTicketResults.status === "done"
        ? liftTicketResults.results[liftTicketResortId]?.rental
        : null;
    const operating = operatingCounts?.[resort.id];
    const ticketResult =
      liftTicketResortId && liftTicketResults.status === "done"
        ? liftTicketResults.results[liftTicketResortId]?.ticket
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
            <div
              className="@container mt-2 grid min-w-0 grid-cols-3 items-baseline gap-1 overflow-hidden rounded-md bg-sky-50 px-1.5 py-1"
              onPointerDown={event => event.stopPropagation()}
              role="group"
              aria-label="営業コース、運行リフト、料金"
            >
              <OperatingMetric
                label="コース"
                count={operating?.courses}
                hasMap={operating?.hasMap}
                isLoading={operatingCounts === null}
                fallbackTotal={resort.numberOfCourses}
              />
              <OperatingMetric
                label="リフト"
                count={operating?.lifts}
                hasMap={operating?.hasMap}
                isLoading={operatingCounts === null}
                fallbackTotal={resort.numberOfLifts}
              />
              <ListMetric
                label="料金"
                value={
                  liftTicketResults.status === "done"
                    ? priceText(ticketResult, rentalResult)
                    : liftTicketResults.status === "loading"
                      ? "計算中…"
                      : liftTicketResults.status === "error"
                        ? "不明"
                        : "日程を設定"
                }
              />
            </div>
          </div>
        </div>
      </li>
    );
  },
);

SkiResortListItem.displayName = "SkiResortListItem";
