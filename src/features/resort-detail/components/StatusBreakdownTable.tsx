import type { ReactNode } from "react";
import type { CourseStatusSummary } from "@/lib/courseStatusSummary";
import { formatKilometers } from "../utils/detailMetrics";
import { NotFetchedBadge, StatusMark } from "./CompactInfo";
import { StatusLegendDialog } from "./CourseStatusTable";

export type StatusBreakdownRow = {
  label: string;
  summary: CourseStatusSummary;
  distance: number | null;
};

/**
 * 区分（レベル・種別）ごとの営業状況を1枚の表にまとめる。
 * 区分ごとにカードを並べると同じ見出しと記号が何度も出て縦に伸びるため、
 * 見出しと記号は表の1行だけに持たせる。
 */
export function StatusBreakdownTable({
  rows,
  kind = "course",
  countLabel,
  unavailable = false,
  source,
}: {
  rows: StatusBreakdownRow[];
  kind?: "course" | "lift";
  /** 件数列の見出し（例: 区間 / 本数） */
  countLabel: string;
  /** 出典が未登録で、営業状況そのものが取得できていない */
  unavailable?: boolean;
  source?: ReactNode;
}) {
  const isLift = kind === "lift";
  // 未取得のときは○△×が全部0にしかならないので、件数だけの列にする
  const statusColumns = unavailable
    ? ([["unknown", "text-slate-600"]] as const)
    : ([
        ["open", "text-emerald-700"],
        ["partial", "text-amber-800"],
        ["closed", "text-slate-800"],
        ["unknown", "text-slate-600"],
      ] as const);
  return (
    <div className="space-y-1">
      {/* 出典は見出しの右へそのまま続ける（右端に飛ばすと見出しと離れて読みにくい） */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="text-sm font-bold text-slate-900">営業状況</h2>
        {unavailable ? (
          <NotFetchedBadge
            title={`${isLift ? "リフト" : "コース"}の営業状況はまだ取得できていません`}
          />
        ) : (
          <StatusLegendDialog name={isLift ? "リフト" : "コース"} kind={kind} />
        )}
        {source && <div className="min-w-0">{source}</div>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th scope="col" className="px-2 py-1.5 text-left font-medium">
                区分
              </th>
              <th
                scope="col"
                className="px-2 py-1.5 text-right font-medium whitespace-nowrap"
              >
                {countLabel}
              </th>
              {!unavailable &&
                (["○", "△", "×"] as const).map(symbol => (
                  <th key={symbol} scope="col" className="px-2 py-1.5">
                    <span className="flex justify-center">
                      <StatusMark symbol={symbol} lift={isLift} />
                    </span>
                  </th>
                ))}
              <th scope="col" className="px-2 py-1.5 text-center font-medium">
                不明
              </th>
              <th
                scope="col"
                className="px-2 py-1.5 text-right font-medium whitespace-nowrap"
              >
                距離
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.label}
                className={`border-t border-slate-200 ${index === 0 ? "bg-slate-50 font-semibold" : ""}`}
              >
                <th
                  scope="row"
                  className={`px-2 py-1.5 text-left whitespace-nowrap ${index === 0 ? "font-semibold" : "font-normal"}`}
                >
                  {row.label}
                </th>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {row.summary.total}
                </td>
                {statusColumns.map(([key, tone]) => (
                  <td
                    key={key}
                    className={`px-2 py-1.5 text-center tabular-nums ${row.summary[key] ? tone : "text-slate-300"}`}
                  >
                    {row.summary[key]}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                  {formatKilometers(row.distance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
