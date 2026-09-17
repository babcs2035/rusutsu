"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Info, X } from "lucide-react";
import { useId } from "react";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CourseStatusSummary } from "@/lib/courseStatusSummary";
import { StatusMark } from "./CompactInfo";

export function CourseStatusTable({
  summary,
  kind = "course",
  title,
}: {
  summary?: CourseStatusSummary | null;
  kind?: "course" | "lift";
  title?: string;
}) {
  const headingId = useId();
  const isLift = kind === "lift";
  const name = title ?? (isLift ? "リフト" : "コース");
  const columns = [
    { label: "○", count: summary?.open, tone: "text-emerald-700" },
    { label: "△", count: summary?.partial, tone: "text-amber-800" },
    { label: "×", count: summary?.closed, tone: "text-slate-600" },
    { label: "不明", count: summary?.unknown, tone: "text-slate-500" },
  ];
  return (
    <section className="min-w-0" aria-labelledby={headingId}>
      <div className="mb-1 flex items-center gap-1">
        <h3
          id={headingId}
          className="text-base font-semibold text-slate-800 sm:text-lg"
        >
          {name}
          <span className="block whitespace-nowrap text-sm font-normal sm:inline">
            {summary
              ? `（${summary.total}${isLift ? "本" : "区間"}）`
              : "（未取得）"}
          </span>
        </h3>
        <Dialog>
          <DialogTrigger
            aria-label={`${name}の記号と集計方法について`}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <Info className="size-4" aria-hidden="true" />
          </DialogTrigger>
          <DialogPortal>
            <DialogOverlay className="z-[900]" />
            <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-[901] max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-700 shadow-xl outline-none">
              <DialogTitle className="pr-7 text-base font-semibold text-slate-900">
                {name} 営業状況
              </DialogTitle>
              <dl className="my-4 grid grid-cols-[2rem_1fr] items-center gap-x-3 gap-y-2 rounded-lg bg-slate-50 p-3 text-sm">
                <dt className="flex items-center justify-center font-semibold text-emerald-700">
                  <StatusMark symbol="○" lift={isLift} />
                </dt>
                <dd>{isLift ? "運行中" : "全面滑走可"}</dd>
                <dt className="flex items-center justify-center font-semibold text-amber-800">
                  <StatusMark symbol="△" lift={isLift} />
                </dt>
                <dd>{isLift ? "待機中・一時停止中" : "一部滑走可・雪不足"}</dd>
                <dt className="flex items-center justify-center font-semibold text-slate-600">
                  <StatusMark symbol="×" lift={isLift} />
                </dt>
                <dd>{isLift ? "運休" : "クローズ"}</dd>
              </dl>
              {isLift ? (
                <p className="text-sm leading-relaxed">
                  地図のリフト数を基準に、運行・待機・運休・不明の件数を表示します。営業状況が取得できないリフトは「不明」に含めます。
                </p>
              ) : (
                <div className="space-y-3 text-sm leading-relaxed">
                  <p>
                    区間数は、公式サイトの営業状況の区分に合わせて数えています。
                    同じコースでも、上部・下部などに分かれている場合は、それぞれ1区間として数えます。
                  </p>
                </div>
              )}
              <DialogClose
                aria-label="説明を閉じる"
                className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                <X className="size-4" />
              </DialogClose>
            </DialogPrimitive.Popup>
          </DialogPortal>
        </Dialog>
      </div>
      <table
        aria-labelledby={headingId}
        className="w-full table-fixed overflow-hidden rounded-md border border-slate-200 text-center"
      >
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map(column => (
              <th
                scope="col"
                key={column.label}
                className={`px-0.5 py-1 text-sm font-semibold ${column.tone}`}
              >
                {column.label === "不明" ? (
                  "不明"
                ) : (
                  <StatusMark
                    symbol={column.label as "○" | "△" | "×"}
                    lift={isLift}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {columns.map(column => (
              <td
                key={column.label}
                className="px-1 py-1 text-xl font-bold tabular-nums text-slate-900"
              >
                {column.count ?? "—"}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </section>
  );
}
