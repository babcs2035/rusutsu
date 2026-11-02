import type { CourseStatusSummary } from "@/lib/courseStatusSummary";
import { sumKnown } from "../utils/courseDistribution";
import { Fraction, formatKm } from "./DistributionChart";

type StatusKey = "open" | "partial" | "closed" | "unknown";

export type LiftStatusChartRow = {
  label: string;
  summary: CourseStatusSummary;
  distance: number | null;
  /** 営業状況ごとの距離（距離不明のリフトは含めない） */
  statusDistances: Record<StatusKey, number>;
};

/** 地図のリフト線と同じ色相（青・赤・グレー・紫）を、棒で見やすい明るさにする */
const SEGMENTS: Array<{ key: StatusKey; label: string; color: string }> = [
  { key: "open", label: "運行", color: "#38BDF8" },
  { key: "partial", label: "待機", color: "#F87171" },
  { key: "closed", label: "運休", color: "#94A3B8" },
  { key: "unknown", label: "不明", color: "#C4B5FD" },
];

/** DistributionChart と同じ罫線・列の組み方にして、コースタブと見た目をそろえる */
const ROW_CLASS = "border-b border-slate-200 py-0.5";
const NUMBER_CELL_CLASS = `${ROW_CLASS} border-l px-1.5 text-right whitespace-nowrap`;
const HEADER_CLASS = `${NUMBER_CELL_CLASS} text-[11px] leading-5 text-slate-500`;
const VALUE_CLASS = `${NUMBER_CELL_CLASS} font-semibold text-slate-900 tabular-nums`;

/**
 * 種別ごとのリフト距離を横棒で並べ、運行・待機・運休・不明で塗り分ける。
 * 右に距離と本数をそれぞれ「運行/全体」で添え、最後に合計を出す。
 * 運行は○だけを数え、待機（△）は含めない。
 */
export function LiftStatusChart({
  rows,
  unavailable,
}: {
  rows: LiftStatusChartRow[];
  /** 出典が未登録で、営業状況そのものが取得できていない */
  unavailable: boolean;
}) {
  if (!rows.length) return null;
  const barLength = (row: LiftStatusChartRow) =>
    SEGMENTS.reduce((value, s) => value + row.statusDistances[s.key], 0);
  const max = Math.max(0, ...rows.map(barLength));
  const sum = (key: "total" | StatusKey) =>
    rows.reduce((value, row) => value + row.summary[key], 0);
  const sumDistance = (key: StatusKey) =>
    rows.reduce((value, row) => value + row.statusDistances[key], 0);
  const total: LiftStatusChartRow = {
    label: "合計",
    summary: {
      ...rows[0].summary,
      total: sum("total"),
      open: sum("open"),
      partial: sum("partial"),
      closed: sum("closed"),
      unknown: sum("unknown"),
    },
    distance: sumKnown(rows.map(row => row.distance)).total,
    statusDistances: {
      open: sumDistance("open"),
      partial: sumDistance("partial"),
      closed: sumDistance("closed"),
      unknown: sumDistance("unknown"),
    },
  };
  const km = (meters: number | null) =>
    meters == null ? "--" : formatKm(meters);
  const renderValues = (row: LiftStatusChartRow) => (
    <>
      <span className={VALUE_CLASS}>
        {unavailable || row.distance == null ? (
          <>
            {km(row.distance)}
            <span className="text-[0.8em] font-normal">km</span>
          </>
        ) : (
          <Fraction
            open={km(row.statusDistances.open)}
            total={km(row.distance)}
            unit="km"
          />
        )}
      </span>
      <span className={VALUE_CLASS}>
        {unavailable ? (
          row.summary.total
        ) : (
          <>
            {row.summary.open}
            <span className="mx-0.5 font-normal text-slate-400">/</span>
            <span className="font-normal text-slate-500">
              {row.summary.total}
            </span>
          </>
        )}
      </span>
    </>
  );
  return (
    <section className="space-y-1">
      <div
        className="grid border-t border-slate-200 text-sm"
        style={{
          gridTemplateColumns: `auto minmax(0, 1fr) ${unavailable ? "4.25rem" : "6.75rem"} 3.5rem`,
        }}
      >
        <h2
          className={`col-span-2 ${ROW_CLASS} self-stretch text-sm font-bold text-slate-900`}
        >
          種別
        </h2>
        <span className={HEADER_CLASS}>距離</span>
        <span className={HEADER_CLASS}>本数</span>
        {rows.map(row => (
          <div key={row.label} className="contents">
            <span
              className={`${ROW_CLASS} pr-2 whitespace-nowrap text-slate-700`}
            >
              {row.label}
            </span>
            <div
              role="img"
              aria-label={`${row.label}: ${SEGMENTS.filter(
                s => row.summary[s.key],
              )
                .map(s => `${s.label}${row.summary[s.key]}本`)
                .join("・")}`}
              className={`${ROW_CLASS} flex h-full items-center pr-2`}
            >
              <div
                className="flex h-3.5 overflow-hidden rounded-r"
                style={{
                  width: `${max ? (barLength(row) / max) * 100 : 0}%`,
                }}
              >
                {SEGMENTS.map(segment =>
                  row.statusDistances[segment.key] ? (
                    <div
                      key={segment.key}
                      className="h-full border-r border-white last:border-r-0"
                      style={{
                        flexGrow: row.statusDistances[segment.key],
                        flexBasis: 0,
                        background: segment.color,
                      }}
                    />
                  ) : null,
                )}
              </div>
            </div>
            {renderValues(row)}
          </div>
        ))}
        {rows.length > 1 && (
          <>
            <span
              className={`col-span-2 ${ROW_CLASS} font-semibold text-slate-900`}
            >
              合計
            </span>
            {renderValues(total)}
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
        {(unavailable ? SEGMENTS.slice(3) : SEGMENTS).map(segment => (
          <span key={segment.key} className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm"
              style={{ background: segment.color }}
            />
            {segment.label}
          </span>
        ))}
      </div>
    </section>
  );
}
