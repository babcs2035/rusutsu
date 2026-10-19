"use client";

import { useId, useState } from "react";
import { DetailButton } from "@/shared/components/DetailButton";

type Metric = {
  title: string;
  value: string;
  detail?: string | null;
  width?: "wide";
  titleParts?: string[];
};

/** 基本情報と設備情報をひと続きの帯にし、スマホだけ追加行を折り畳む。 */
export function LiftMetrics({
  items,
  specifications,
}: {
  items: Metric[];
  specifications: Metric[];
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const renderMetric = (item: Metric, supplementary = false) => (
    <div
      key={item.title}
      className={
        supplementary ? "row-span-2 grid min-w-0 grid-rows-subgrid" : "min-w-0"
      }
    >
      <dt
        className={`${supplementary ? "text-balance" : "whitespace-nowrap"} text-[10px] leading-tight text-slate-500 @min-[420px]:text-xs`}
      >
        {item.titleParts
          ? item.titleParts.map(part => (
              <span key={part} className="inline-block max-w-full">
                {part}
              </span>
            ))
          : item.title}
      </dt>
      <dd
        className={`font-bold tabular-nums tracking-tight text-slate-900 leading-5 @min-[420px]:leading-6 ${supplementary ? "break-words" : "whitespace-nowrap"} ${/^[○〇◯×✕✖]$/u.test(item.value) ? "text-lg @min-[420px]:text-xl" : "text-[clamp(10px,3.8cqw,16px)]"}`}
      >
        {item.value}
      </dd>
      {item.detail && (
        <dd className="whitespace-nowrap text-[10px] tabular-nums tracking-tighter text-slate-500 @min-[420px]:text-xs">
          {item.detail}
        </dd>
      )}
    </div>
  );

  return (
    <section
      aria-label="リフト諸元"
      className="@container rounded-lg bg-slate-50 px-2.5 py-2"
    >
      <div className="relative">
        <dl
          className={`grid items-start gap-x-1 @min-[300px]:gap-x-1.5 ${specifications.length > 0 ? "min-h-[60px] md:min-h-0" : ""}`}
          style={{
            gridTemplateColumns: items
              .map(item => `minmax(0, ${item.width === "wide" ? 2 : 1}fr)`)
              .join(" "),
          }}
        >
          {items.map(item => renderMetric(item))}
        </dl>
        {specifications.length > 0 && (
          <DetailButton
            compact
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded(previous => !previous)}
            className={`absolute right-0 bottom-0 md:hidden ${expanded ? "[&>svg]:-rotate-90" : "[&>svg]:rotate-90"}`}
          >
            {expanded ? "詳細を閉じる" : "詳細を表示"}
          </DetailButton>
        )}
      </div>
      {specifications.length > 0 && (
        <dl
          id={detailsId}
          className={`${expanded ? "grid" : "hidden md:grid"} mt-2 gap-x-2 border-t border-slate-200 pt-2`}
          style={{
            gridTemplateColumns: specifications
              .map(item => `minmax(0, ${item.width === "wide" ? 2 : 1}fr)`)
              .join(" "),
          }}
        >
          {specifications.map(item => renderMetric(item, true))}
        </dl>
      )}
    </section>
  );
}
