"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ChevronRight, Info, X } from "lucide-react";
import { type ReactNode, useId } from "react";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CourseStatusSummary } from "@/lib/courseStatusSummary";
import { NotFetchedBadge, StatusMark } from "./CompactInfo";

/** ○△×の意味と数え方の説明。表・チップのどちらからも同じ内容を開く。 */
export function StatusLegendDialog({
  name,
  kind = "course",
  className,
}: {
  name: string;
  kind?: "course" | "lift";
  className?: string;
}) {
  const isLift = kind === "lift";
  return (
    <Dialog>
      <DialogTrigger
        aria-label={`${name}の記号と集計方法について`}
        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-blue-600 ${className ?? ""}`}
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
            <dt className="flex items-center justify-center font-semibold text-slate-700">
              <StatusMark symbol="×" lift={isLift} />
            </dt>
            <dd>{isLift ? "運休" : "クローズ"}</dd>
          </dl>
          {isLift ? (
            <p className="text-sm leading-relaxed">
              地図のリフト数を基準に、運行・待機・運休・不明の件数を表示します。営業状況が取得できないリフトは「不明」に含めます。
            </p>
          ) : (
            <p className="text-sm leading-relaxed">
              区間数は、公式サイトの営業状況の区分に合わせて数えています。
              同じコースでも、上部・下部などに分かれている場合は、それぞれ1区間として数えます。
            </p>
          )}
          <DialogClose
            aria-label="説明を閉じる"
            className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <X className="size-4" />
          </DialogClose>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}

export function CourseStatusTable({
  summary,
  kind = "course",
  title,
  source,
  unavailable = false,
  onShowDetail,
  detailLabel = "詳細",
}: {
  summary?: CourseStatusSummary | null;
  kind?: "course" | "lift";
  title?: string;
  source?: ReactNode;
  /** 出典が未登録で、営業状況そのものが取得できていない */
  unavailable?: boolean;
  /** 渡すと見出しの右に「詳細」ボタンを出す（一覧・個別詳細への導線） */
  onShowDetail?: () => void;
  detailLabel?: string;
}) {
  const headingId = useId();
  const isLift = kind === "lift";
  const name = title ?? (isLift ? "リフト" : "コース");
  // 未取得のときは○△×を並べても全部0にしかならないので、件数だけを出す
  const columns = unavailable
    ? [{ label: "不明", count: summary?.unknown, tone: "text-slate-700" }]
    : [
        { label: "○", count: summary?.open, tone: "text-emerald-700" },
        { label: "△", count: summary?.partial, tone: "text-amber-800" },
        { label: "×", count: summary?.closed, tone: "text-slate-700" },
        { label: "不明", count: summary?.unknown, tone: "text-slate-700" },
      ];
  return (
    <section className="min-w-0" aria-labelledby={headingId}>
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <h3
          id={headingId}
          className="whitespace-nowrap text-base font-semibold text-slate-900 sm:text-lg"
        >
          {name}
          {summary && (
            <span className="whitespace-nowrap text-sm font-normal text-slate-700">
              {`（${summary.total}${isLift ? "本" : "区間"}）`}
            </span>
          )}
        </h3>
        {unavailable && (
          <NotFetchedBadge
            title={`${name}の営業状況はまだ取得できていません`}
          />
        )}
        {source && <div className="min-w-0">{source}</div>}
      </div>
      {/* 表だと列が均等割りで間延びするので、中身の幅だけ使うチップを横に並べる */}
      <div
        role="group"
        aria-labelledby={headingId}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 px-2.5 py-1.5"
      >
        {columns.map(column => (
          <div key={column.label} className="flex items-center gap-1.5">
            {column.label === "不明" ? (
              <span className={`text-sm font-semibold ${column.tone}`}>
                不明
              </span>
            ) : (
              <StatusMark
                symbol={column.label as "○" | "△" | "×"}
                lift={isLift}
              />
            )}
            <span className="text-lg font-bold tabular-nums text-slate-900">
              {column.count ?? "—"}
            </span>
          </div>
        ))}
        {!unavailable && (
          <StatusLegendDialog name={name} kind={kind} className="ml-auto" />
        )}
        {onShowDetail && (
          <button
            type="button"
            onClick={onShowDetail}
            className="flex min-h-7 shrink-0 items-center gap-0.5 rounded-full border border-blue-200 bg-blue-50 py-1 pr-2 pl-3 text-sm font-semibold text-blue-700 hover:border-blue-300 hover:bg-blue-100 active:bg-blue-200"
          >
            {detailLabel}
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
