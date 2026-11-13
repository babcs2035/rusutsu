"use client";

import { ChevronRight } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { CompareListResortButton } from "@/features/compare-lists/CompareListResortButton";
import { FavoriteButton } from "@/features/favorites/FavoriteButton";
import { useHomeCompare } from "@/features/home/compareContext";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import { priceText } from "@/features/lift-ticket/utils/priceText";
import { calculateResortPrice } from "@/features/lift-ticket/utils/resortPriceCalculation";
import { SourceLine } from "@/features/resort-detail/components/CompactInfo";
import {
  Fraction,
  formatKm,
} from "@/features/resort-detail/components/DistributionChart";
import {
  ResortFeatureChips,
  resortFeatureDataOf,
} from "@/features/resort-detail/components/ResortFeatureChips";
import { createCourseDistance } from "@/features/resort-detail/utils/courseChartColumns";
import {
  conditionText,
  record,
} from "@/features/resort-detail/utils/currentConditions";
import { getResortLabelName } from "@/lib/resortAliases";
import { cn } from "@/lib/utils";
import {
  getCourseSummary,
  getLiftSummary,
  OperationCount,
} from "./CompareSlopeMapBoard";
import { COMPARE_CARD_GRID_CLASS } from "./constants";
import type { Resort } from "./types";

/** 地点のうち一番多い積雪（cm）と、その値の出典。数値で読めるものが無ければ null */
const maxSnowDepth = (resort: Resort) => {
  let best: { depth: number; urls: string[] } | null = null;
  for (const item of resort.currentConditions ?? []) {
    for (const point of Object.values(record(item.weather?.data))) {
      const text = conditionText(record(point).snowDepth);
      const depth = text === null ? Number.NaN : Number.parseFloat(text);
      if (Number.isFinite(depth) && (!best || depth > best.depth))
        best = { depth, urls: item.weather?.sourceUrls ?? [] };
    }
  }
  return best;
};

const priceOf = (resort: Resort, input: LiftTicketSearchInput) => {
  if (!resort.liftTickets?.length) return null;
  if (!input.visitDate) return "日程を設定";
  const { ticket, rental, bundle } = calculateResortPrice(
    resort.liftTickets,
    input,
  );
  return priceText(ticket, rental, bundle);
};

/** 地図が届いていればそこから、まだならサーバーで集計した値を使う */
const courseDistanceOf = (resort: Resort) =>
  resort.finalizedMapData
    ? createCourseDistance(resort.finalizedMapData.courses)
    : (resort.operationStatus?.courseDistance ?? null);

/**
 * 2×2 のマスの 1 つ。縦に伸ばさないよう、ラベル・値・補足を必ず 1 行に並べる。
 * 値を太く大きくして先に読ませ、補足（標高の範囲）は幅が足りなければ省略する。
 * highlight は一覧カードと同じ青。値が無いマスも枠は残し、マスの位置をカード間でそろえる
 */
const MetricCell = ({
  label,
  note,
  highlight = false,
  aside,
  children,
}: {
  label: string;
  /** 値の右に添える補足（標高の範囲など）。狭いときは省略する */
  note?: ReactNode;
  highlight?: boolean;
  /** 値の右に添えるもの（出典） */
  aside?: ReactNode;
  children?: ReactNode;
}) => (
  <div className="flex h-8 min-w-0 items-center gap-1 overflow-hidden bg-white px-1.5 whitespace-nowrap">
    <span className="shrink-0 text-[11px] font-semibold text-gray-500">
      {label}
    </span>
    <span
      className={cn(
        "shrink-0 text-[15px] leading-none font-bold tabular-nums",
        children === undefined
          ? "font-normal text-gray-400"
          : highlight
            ? "text-blue-700"
            : "text-gray-900",
      )}
    >
      {children ?? "—"}
    </span>
    {note && (
      <span
        data-metric-note
        className="min-w-0 truncate text-[11px] tracking-tight tabular-nums text-gray-500"
      >
        {note}
      </span>
    )}
    {aside && <span className="shrink-0">{aside}</span>}
  </div>
);

const ResortCard = ({
  resort,
  price,
  onSelectResort,
}: {
  resort: Resort;
  price: string | null;
  onSelectResort?: (id: string) => void;
}) => {
  const compare = useHomeCompare();
  const status = resort.operationStatus;
  const courseUrls =
    resort.finalizedMapData?.courses?.sourceUrls ?? status?.courseSourceUrls;
  const liftUrls =
    resort.finalizedMapData?.lifts?.sourceUrls ?? status?.liftSourceUrls;
  const distance = courseDistanceOf(resort);
  const snowDepth = maxSnowDepth(resort);
  const location = [resort.prefecture, resort.town].filter(Boolean).join(" ");

  return (
    <section
      // 出典は詳細の営業状況と同じ大きさにする（SourceLine compact は
      // overview コンテナの幅で縮むので、カードにも同じ名前を付ける）
      className="@container/overview flex min-w-0 flex-col gap-2 rounded-xl border border-gray-200 bg-white p-2.5"
    >
      {/* 1 行目: 名前（所在地）・詳細。 */}
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="min-w-0 text-sm leading-tight font-bold break-words text-gray-900 font-[var(--font-heading)]">
          {getResortLabelName(resort.id, resort.nameJa, resort.shortName)}
          {location && (
            // 幅が足りないときは、所在地を途中で折らずに丸ごと次の行へ送る
            <span className="ml-1 inline-block max-w-full truncate align-bottom text-xs font-normal text-gray-500">
              ({location})
            </span>
          )}
        </h3>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {compare?.source.kind === "favorites" && (
            <FavoriteButton
              resortId={resort.id}
              name={resort.nameJa}
              className="-my-1 size-7"
            />
          )}
          {compare?.source.kind === "list" && (
            <CompareListResortButton
              resortId={resort.id}
              name={resort.nameJa}
            />
          )}
          {onSelectResort && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onSelectResort(resort.id)}
              className="h-6 shrink-0 gap-0 px-1.5 text-[11px] font-semibold text-blue-700"
            >
              詳細
              <ChevronRight size={11} strokeWidth={2.5} />
            </Button>
          )}
        </div>
      </div>

      {/* 標高差・滑走距離・積雪・料金を 2×2 のマスに区切る。
          区切り線は 1px の隙間から下地の色を見せて引く */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200">
        <MetricCell
          label="標高差"
          // 桁区切りを省いて幅を詰め、狭いカードでも範囲を省略せずに出す
          note={`${resort.topElevation}–${resort.baseElevation}m`}
        >
          {resort.verticalDrop.toLocaleString()}
          <span className="text-xs font-normal">m</span>
        </MetricCell>
        <MetricCell label="滑走距離">
          {distance ? (
            distance.open === null ? (
              <>
                {formatKm(distance.total)}
                <span className="text-xs font-normal">km</span>
              </>
            ) : (
              <Fraction
                open={formatKm(distance.open)}
                total={formatKm(distance.total)}
                unit="km"
              />
            )
          ) : undefined}
        </MetricCell>
        <MetricCell
          label="積雪"
          aside={
            snowDepth && (
              <SourceLine
                compact
                label="積雪"
                showLabel={false}
                showFetched={false}
                showPublished={false}
                urls={snowDepth.urls}
              />
            )
          }
        >
          {snowDepth ? (
            <>
              {snowDepth.depth}
              <span className="text-xs font-normal">cm</span>
            </>
          ) : undefined}
        </MetricCell>
        <MetricCell label="料金" highlight>
          {price === null ? undefined : price.startsWith("¥") ? (
            price
          ) : (
            // 「営業期間外」などの文言は金額より一回り小さくする
            <span className="text-sm font-semibold">{price}</span>
          )}
        </MetricCell>
      </div>

      {/* 営業状況だけを枠で囲み、特典チップは枠の外の右側に配置。 */}
      <div className="mt-auto flex min-w-0 items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg border border-gray-200 bg-slate-50 px-1.5 py-1">
          {(
            [
              ["コース", getCourseSummary(resort), courseUrls, false],
              ["リフト", getLiftSummary(resort), liftUrls, true],
            ] as const
          ).map(([label, summary, urls, lift]) => (
            <div
              key={label}
              className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5"
            >
              <OperationCount
                label={label}
                summary={summary}
                size="md"
                compact
                lift={lift}
              />
              <div className="ml-auto min-w-0 shrink-0">
                <SourceLine
                  compact
                  label={label}
                  showLabel={false}
                  showFetched={false}
                  showPublished={false}
                  urls={urls}
                />
              </div>
            </div>
          ))}
        </div>
        <ResortFeatureChips
          hasYukiMagi={Boolean(resort.yukiMagi)}
          hasEvCharger={false}
          data={resortFeatureDataOf(resort)}
          size="sm"
          layout="column"
        />
      </div>
    </section>
  );
};

export const CompareOverviewTab = ({
  resorts,
  onSelectResort,
  liftTicketInput,
}: {
  resorts: Resort[];
  /** 「詳細」で開くスキー場。渡さなければボタンを出さない */
  onSelectResort?: (id: string) => void;
  liftTicketInput: LiftTicketSearchInput;
}) => {
  const prices = useMemo(
    () => resorts.map(resort => priceOf(resort, liftTicketInput)),
    [resorts, liftTicketInput],
  );
  return (
    <div className="@container w-full">
      <div className={COMPARE_CARD_GRID_CLASS}>
        {resorts.map((resort, index) => (
          <ResortCard
            key={resort.id}
            resort={resort}
            price={prices[index]}
            onSelectResort={onSelectResort}
          />
        ))}
      </div>
    </div>
  );
};
