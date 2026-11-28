"use client";

import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FavoriteButton } from "@/features/favorites/FavoriteButton";
import type {
  CourseDistanceTotals,
  OperatingCount,
  ResortOperatingCounts,
} from "@/features/home/utils/operatingCounts";
import { LiftTicketConditionsDialog } from "@/features/lift-ticket/components/LiftTicketConditionsDialog";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import { priceText } from "@/features/lift-ticket/utils/priceText";
import { distanceKm } from "@/features/map/utils/distance";
import { cn } from "@/lib/utils";
import { CompareResortButton } from "@/shared/components/CompareResortButton";
import { CopyResortNameButton } from "@/shared/components/CopyResortNameButton";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { MapSkiResort } from "@/types/skiResorts";
import { useGoogleMapsLinks } from "../hooks/useGoogleMapsLinks";
import {
  type ListLiftTicketResults,
  useListLiftTicketResults,
} from "../hooks/useListLiftTicketResults";
import type { ResortSortControls } from "../hooks/useResortSort";
import { groupResortsByRegion } from "../utils/groupResortsByRegion";
import { sortResorts } from "../utils/sortResorts";
import { GroupedResortList } from "./GroupedResortList";
import { ResortSortButton } from "./ResortSortButton";

const HOVER_HIGHLIGHT_MEDIA_QUERY = "(min-width: 48em)";

const canUseHoverHighlight = () =>
  typeof window !== "undefined" &&
  window.matchMedia(HOVER_HIGHLIGHT_MEDIA_QUERY).matches;

type Props = {
  resorts: MapSkiResort[];
  sortControls: ResortSortControls;
  onSelectResort: (id: string) => void;
  selectedCompareIdSet: Set<string>;
  onToggleCompare: (id: string, selected: boolean) => void;
  onHoverResortChange?: (id: string | null) => void;
  showHeader?: boolean;
  liftTicketInput: LiftTicketSearchInput;
  /** 料金の計算条件を変える。検索欄と同じ条件に書き込む */
  onLiftTicketInputChange: (input: LiftTicketSearchInput) => void;
  /** 絞り込みで選んだ項目だけ、コース・リフトの下に1行ずつ出す */
  featureLines?: ResortFeatureLines;
  /** 一覧が見えていない間（詳細を開いている・幅が足りず隠れている）は料金を計算しない */
  liftTicketPaused?: boolean;
  /** 件数を並び替えの右に出すか */
  showResultCount?: boolean;
  /** 親が計算した料金。渡すと一覧では計算しない（地図・予算と同じ結果を使う） */
  liftTicketResults?: ListLiftTicketResults;
  /** 料金欄の名前。条件が初期のままなら「大人1日料金」、変えたら「合計料金」 */
  priceLabel?: string;
};

/**
 * 施設リンクが未登録のスキー場は、名前と都道府県で Google マップを検索する。
 * 座標だけのリンクだと、施設の情報（口コミ・営業時間など）が出ないため。
 */
const googleMapsSearchUrl = (resort: MapSkiResort) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${resort.nameJa} ${resort.prefecture}`)}`;

const hasListCoordinate = (resort: MapSkiResort) =>
  Number.isFinite(resort.latitude) &&
  Number.isFinite(resort.longitude) &&
  !(resort.latitude === 0 && resort.longitude === 0);

export type ResortFeatureLines = { yukiMagi: boolean; evCharger: boolean };

const LIST_LABEL_TYPOGRAPHY = "text-xs font-semibold";
const LIST_VALUE_TYPOGRAPHY = "text-xs font-bold leading-tight tabular-nums";

const ListMetric = ({
  label,
  value,
  description,
  children,
}: {
  label: string;
  value: string;
  description?: string;
  /** 値の見せ方を変えるとき（単位を小さくするなど）。無ければ value を出す */
  children?: ReactNode;
}) => (
  <span className="flex min-w-0 flex-col items-start gap-1">
    <span
      className={cn(
        "leading-tight text-muted-foreground",
        LIST_LABEL_TYPOGRAPHY,
      )}
    >
      {label}
    </span>
    <span
      title={description ?? value}
      className={cn(
        "max-w-full wrap-break-word text-primary",
        LIST_VALUE_TYPOGRAPHY,
      )}
    >
      {children ??
        (value.startsWith("不明") ? (
          <>
            {/* 「不明/5」は不明だけ薄くし、総数は数字として青で見せる。 */}
            <span className="font-semibold text-gray-500">不明</span>
            {value.slice("不明".length)}
          </>
        ) : (
          value
        ))}
    </span>
  </span>
);

/** 雪マジ・EV充電の1行。必ず1行に収め、はみ出す分は省略（…）にする */
const FeatureLine = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "pink" | "green";
}) => (
  <p
    className={cn(
      "@container mt-1 flex min-w-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-xs leading-4",
      tone === "pink" ? "bg-pink-50" : "bg-emerald-50",
    )}
  >
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-white",
        LIST_LABEL_TYPOGRAPHY,
        tone === "pink" ? "bg-pink-600" : "bg-emerald-700",
      )}
    >
      {label}
    </span>
    <span
      title={value}
      className={cn("min-w-0 truncate text-gray-700", LIST_VALUE_TYPOGRAPHY)}
    >
      {value}
    </span>
  </p>
);

/** 近い順のときの1行。現在地からの距離と Google マップへのリンク */
const DistanceLine = ({
  distance,
  mapsUrl,
}: {
  distance: number;
  mapsUrl: string;
}) => (
  <p className="mt-1 flex min-w-0 items-center gap-1 whitespace-nowrap rounded-md bg-gray-100 px-1.5 py-1 text-xs leading-4">
    <span className="min-w-0 flex-1 truncate text-xs font-medium tabular-nums text-gray-600 @min-[300px]:text-xs">
      現在地から{" "}
      <span className="font-bold text-gray-900">
        {distance < 10 ? distance.toFixed(1) : Math.round(distance)}km
      </span>
    </span>
    <ExternalLinkComponent
      href={mapsUrl}
      data-ski-resort-list-actions="true"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 underline underline-offset-2",
        LIST_LABEL_TYPOGRAPHY,
      )}
    >
      Google マップ
    </ExternalLinkComponent>
  </p>
);

/** 一覧の距離は小数1桁（0.0km/41.0km）でそろえる */
const formatKm = (meters: number) => (meters / 1000).toFixed(1);

/** 単位の km は数字より小さくして、数字を読みやすくする */
const KmValue = ({ meters }: { meters: number | null }) =>
  meters === null ? (
    <span className="font-semibold text-gray-500">不明</span>
  ) : (
    <>
      {formatKm(meters)}
      <span className="ml-px text-xs font-semibold">km</span>
    </>
  );

/** 距離の並び（総滑走距離・滑走可能距離）のとき、コースの欄を「可能/総距離」にする */
const CourseDistanceMetric = ({
  distance,
  isLoading,
}: {
  distance: CourseDistanceTotals | null | undefined;
  isLoading: boolean;
}) => {
  const value = isLoading
    ? "集計中…"
    : distance
      ? `${distance.open === null ? "不明" : `${formatKm(distance.open)}km`}/${formatKm(distance.total)}km`
      : "不明";
  return (
    <ListMetric
      label="コース"
      value={value}
      description={
        distance && !isLoading
          ? `コース ${value}：滑走可能なコースの距離／全コースの滑走距離`
          : undefined
      }
    >
      {distance && !isLoading ? (
        <>
          <KmValue meters={distance.open} />/
          <KmValue meters={distance.total} />
        </>
      ) : undefined}
    </ListMetric>
  );
};

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
  return (
    <ListMetric
      label={label}
      value={value}
      description={
        hasMap && count && count.active !== null && !isLoading
          ? `${label} ${value}：営業情報と対応済みの${label}のうち、${label === "コース" ? "滑走可能" : "運行中・待機中"}な数／対応済みの総数`
          : undefined
      }
    />
  );
};

/** 検索結果の件数。比較チップの行の右端か、並び替えの右に出す */
export const ResultCount = ({ count }: { count: number }) => (
  <span className="shrink-0 whitespace-nowrap pl-0.5 text-sm font-bold tabular-nums text-gray-900">
    {count.toLocaleString("ja-JP")}件
  </span>
);

/**
 * 右カラムまたはボトムシートに表示されるスキー場一覧コンポーネント
 */
export const SkiResortList = ({
  resorts: inputResorts,
  sortControls,
  onSelectResort,
  selectedCompareIdSet,
  onToggleCompare,
  onHoverResortChange,
  showHeader = true,
  liftTicketInput,
  onLiftTicketInputChange,
  featureLines,
  liftTicketPaused = false,
  showResultCount = true,
  liftTicketResults: providedLiftTicketResults,
  priceLabel = "料金",
}: Props) => {
  const listRef = useRef<HTMLUListElement>(null);
  const [isConditionsOpen, setConditionsOpen] = useState(false);
  const sortOrder = sortControls.order;
  const sortKey = `${sortOrder}:${sortControls.prefectureOrder}`;
  const previousSortKey = useRef(sortKey);
  useEffect(() => {
    if (previousSortKey.current === sortKey) return;
    previousSortKey.current = sortKey;
    // 並び替えたあとは、順位の先頭から見せる。
    listRef.current?.scrollTo({ top: 0 });
  }, [sortKey]);
  const googleMapsLinks = useGoogleMapsLinks(
    sortControls.distanceFrom !== null,
  );
  const ownLiftTicketResults = useListLiftTicketResults(
    inputResorts,
    liftTicketInput,
    liftTicketPaused || providedLiftTicketResults !== undefined,
  );
  const liftTicketResults = providedLiftTicketResults ?? ownLiftTicketResults;
  // 料金が安い順は、一覧で計算した合計金額で並べる。金額が出ない（不明・
  // 一部不明・期間外）スキー場は末尾にまとめる
  const resorts = useMemo(() => {
    if (sortOrder !== "liftPrice" || liftTicketResults.status !== "done") {
      return inputResorts;
    }
    const prices = new Map<string, number>();
    for (const resort of inputResorts) {
      const summary = resort.liftTicketResortId
        ? liftTicketResults.results[resort.liftTicketResortId]
        : null;
      if (summary?.kind === "price") prices.set(resort.id, summary.total);
    }
    return sortResorts(inputResorts, "liftPrice", null, "distance", prices);
  }, [inputResorts, sortOrder, liftTicketResults]);
  const priceSortStatus =
    sortOrder !== "liftPrice"
      ? null
      : liftTicketResults.status === "idle"
        ? "idle"
        : liftTicketResults.status === "loading"
          ? "loading"
          : liftTicketResults.status === "error"
            ? "error"
            : null;
  const regions = useMemo(
    () => (sortOrder === "prefecture" ? groupResortsByRegion(resorts) : []),
    [resorts, sortOrder],
  );
  // 検索結果の顔ぶれ。並び替えでは変わらないよう、IDを並べ直してから連結する
  const resultKey = useMemo(
    () =>
      resorts
        .map(resort => resort.id)
        .sort()
        .join(","),
    [resorts],
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
      priceLabel={priceLabel}
      operatingCounts={operatingCounts}
      showYukiMagi={featureLines?.yukiMagi ?? false}
      showEvCharger={featureLines?.evCharger ?? false}
      showCourseDistance={
        sortOrder === "openDistance" || sortOrder === "totalDistance"
      }
      distance={
        sortControls.distanceFrom && hasListCoordinate(resort)
          ? distanceKm(sortControls.distanceFrom, resort)
          : null
      }
      mapsUrl={googleMapsLinks?.[resort.id] ?? googleMapsSearchUrl(resort)}
    />
  );

  return (
    <div className="flex h-full flex-col bg-transparent">
      {/* ヘッダーエリア */}
      {showHeader && (
        <div className="border-b border-gray-100 px-4 pt-2 md:pt-6">
          <h2 className="text-lg font-bold text-gray-900 font-heading">
            {resorts.length} 件見つかりました
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            選択すると詳細を表示します
          </p>
        </div>
      )}

      <div className="@container/sort-row flex min-w-0 shrink-0 items-center gap-1.5 border-b border-gray-100 px-3 pb-2 md:px-4">
        <ResortSortButton {...sortControls} />
        {showResultCount && (
          <span className="ml-auto">
            <ResultCount count={resorts.length} />
          </span>
        )}
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

      {priceSortStatus && (
        <p
          role="status"
          className="shrink-0 px-3 pb-1 text-xs text-gray-600 md:px-4"
        >
          {priceSortStatus === "loading" ? (
            "料金を計算中…"
          ) : priceSortStatus === "error" ? (
            "料金を計算できませんでした"
          ) : (
            <>
              日程を入れると料金の安い順に並びます
              <button
                type="button"
                className="ml-1 whitespace-nowrap font-semibold text-blue-700 underline"
                onClick={() => setConditionsOpen(true)}
              >
                日程を設定
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
            "@container/resort-list flex-grow list-none overflow-y-auto pt-0 pb-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] md:gap-3 md:pt-4 md:pb-[4.5rem]",
            sortOrder === "prefecture"
              ? "scroll-pt-[4.25rem] px-3 md:pt-0"
              : "px-4",
          )}
          onScroll={() => onHoverResortChange?.(null)}
        >
          {sortOrder === "prefecture" ? (
            <GroupedResortList
              regions={regions}
              resultKey={resultKey}
              renderResort={renderResort}
            />
          ) : (
            resorts.map(renderResort)
          )}
        </ul>
      )}
      <LiftTicketConditionsDialog
        open={isConditionsOpen}
        onOpenChange={setConditionsOpen}
        value={liftTicketInput}
        onChange={onLiftTicketInputChange}
      />
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
    priceLabel,
    operatingCounts,
    showYukiMagi,
    showEvCharger,
    showCourseDistance,
    distance,
    mapsUrl,
  }: {
    resort: MapSkiResort;
    isCompareSelected: boolean;
    onSelectResort: (id: string) => void;
    onToggleCompare: (id: string, selected: boolean) => void;
    onHoverResortChange?: (id: string | null) => void;
    liftTicketResults: ListLiftTicketResults;
    priceLabel: string;
    operatingCounts: Record<string, ResortOperatingCounts> | null;
    showYukiMagi: boolean;
    showEvCharger: boolean;
    showCourseDistance: boolean;
    /** 近い順のときだけ、現在地からの直線距離（km） */
    distance: number | null;
    /** そのスキー場の Google マップ（施設のページ） */
    mapsUrl: string;
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
    const operating = operatingCounts?.[resort.id];
    const priceSummary =
      liftTicketResortId && liftTicketResults.status === "done"
        ? liftTicketResults.results[liftTicketResortId]
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
          className="w-full cursor-pointer text-left transition-all duration-200 ease-in-out border-b border-gray-100 md:border md:rounded-xl md:border-gray-200 md:bg-white md:px-4 md:py-2.5 md:shadow-sm hover:md:border-blue-600 hover:md:shadow-md hover:md:-translate-y-0.5 focus-visible:outline-none focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10"
        >
          <div className="flex min-w-0 flex-col gap-y-0.5 py-1 md:py-1">
            <p className="min-w-0 break-words font-bold text-base leading-tight text-gray-900 font-heading">
              {resort.nameJa}
              <CopyResortNameButton
                name={resort.nameJa}
                className="ml-1 size-4 align-middle"
                onInteract={clearHighlight}
              />
            </p>
            {resort.formerNames.length > 0 && (
              <p className="min-w-0 break-words text-xs font-medium leading-tight text-muted-foreground">
                旧称: {resort.formerNames.map(name => name.name).join("、")}
              </p>
            )}
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p className="min-w-0 flex-1 break-words text-xs font-medium leading-snug text-gray-500">
                {resort.prefecture} · {resort.town}
              </p>
              <div
                data-ski-resort-list-actions="true"
                className="flex shrink-0 items-center justify-end gap-1"
              >
                <FavoriteButton
                  resortId={resort.id}
                  name={resort.nameJa}
                  className="size-6"
                />
                <CompareResortButton
                  isSelected={isCompareSelected}
                  resortName={resort.nameJa}
                  size="sm"
                  className="h-6 min-w-16 rounded-lg text-xs transition-smooth"
                  onPointerDown={handleActionPointerDown}
                  onClick={e => {
                    e.stopPropagation();
                    onToggleCompare(resort.id, !isCompareSelected);
                  }}
                />
              </div>
            </div>
            <div
              className={cn(
                "mt-1 grid min-w-0 gap-x-1 rounded-lg bg-muted px-2 py-2",
                // 距離（12km/41km）は件数より長い。3等分の並びは保ったまま、
                // 「期間外」などで短く済む料金の幅をコースへ回す
                showCourseDistance
                  ? "grid-cols-[minmax(0,1.3fr)_minmax(0,0.75fr)_minmax(0,1.3fr)]"
                  : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]",
              )}
              onPointerDown={event => event.stopPropagation()}
              role="group"
              aria-label="営業コース、運行リフト、料金"
            >
              {showCourseDistance ? (
                <CourseDistanceMetric
                  distance={operating?.courseDistance}
                  isLoading={operatingCounts === null}
                />
              ) : (
                <OperatingMetric
                  label="コース"
                  count={operating?.courses}
                  hasMap={operating?.hasMap}
                  isLoading={operatingCounts === null}
                  fallbackTotal={resort.numberOfCourses}
                />
              )}
              <OperatingMetric
                label="リフト"
                count={operating?.lifts}
                hasMap={operating?.hasMap}
                isLoading={operatingCounts === null}
                fallbackTotal={resort.numberOfLifts}
              />
              <ListMetric
                label={priceLabel}
                value={
                  liftTicketResults.status === "done"
                    ? priceText(priceSummary, { compact: true })
                    : liftTicketResults.status === "loading"
                      ? "計算中…"
                      : liftTicketResults.status === "error"
                        ? "不明"
                        : "日程を設定"
                }
              />
            </div>
            {showYukiMagi && resort.yukiMagiSummary && (
              <FeatureLine
                label="雪マジ"
                value={resort.yukiMagiSummary}
                tone="pink"
              />
            )}
            {showEvCharger && resort.evChargerSummary && (
              <FeatureLine
                label="EV"
                value={resort.evChargerSummary}
                tone="green"
              />
            )}
            {distance !== null && (
              <DistanceLine distance={distance} mapsUrl={mapsUrl} />
            )}
          </div>
        </div>
      </li>
    );
  },
);

SkiResortListItem.displayName = "SkiResortListItem";
