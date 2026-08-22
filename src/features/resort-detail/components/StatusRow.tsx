"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import {
  COURSE_STATUS_DESCRIPTION,
  LIFT_STATUS_DESCRIPTION,
  PISTE_STATUS_DESCRIPTION,
  type StatusSymbol,
} from "../utils/detailMetrics";

const SYMBOL_COLOR: Record<StatusSymbol, string> = {
  "○": "#15803D",
  "△": "#B45309",
  "×": "#B91C1C",
};

const StatusItem = ({
  label,
  symbol,
  text,
  color,
}: {
  label: string;
  symbol?: StatusSymbol | null;
  text?: string;
  color?: string;
}) => (
  <div className="flex min-w-0 items-baseline gap-1.5">
    <span className="text-xs font-semibold text-gray-500">{label}</span>
    <span
      className="text-base font-bold leading-none"
      style={{ color: color ?? (symbol ? SYMBOL_COLOR[symbol] : "#6B7280") }}
    >
      {text ?? symbol ?? "--"}
    </span>
  </div>
);

/**
 * 営業状況・圧雪・難易度をまとめて 1 行に並べる。
 *
 * 記号だけを出して縦の場所を取らないようにし、意味は「凡例」を開いたときだけ出す。
 */
export const StatusSummary = ({
  statusSymbol,
  pisteSymbol,
  difficultyLabel,
  difficultyColor,
  extras = [],
  statusKind = "course",
}: {
  statusSymbol: StatusSymbol | null;
  pisteSymbol?: StatusSymbol | null;
  difficultyLabel?: string;
  difficultyColor?: string;
  /** 難易度以外に横に並べたい項目（リフトの種別・速度など） */
  extras?: { label: string; text: string }[];
  statusKind?: "course" | "lift";
}) => {
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const statusDescription =
    statusKind === "course"
      ? COURSE_STATUS_DESCRIPTION
      : LIFT_STATUS_DESCRIPTION;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <StatusItem
          label={statusKind === "course" ? "営業状況" : "運行状況"}
          symbol={statusSymbol}
        />
        {pisteSymbol !== undefined && (
          <StatusItem label="圧雪" symbol={pisteSymbol} />
        )}
        {difficultyLabel && (
          <StatusItem
            label="難易度"
            text={difficultyLabel}
            color={difficultyColor}
          />
        )}
        {extras.map(extra => (
          <StatusItem key={extra.label} label={extra.label} text={extra.text} />
        ))}
      </div>

      <button
        type="button"
        aria-expanded={isLegendOpen}
        className="flex w-fit items-center gap-0.5 text-xs font-semibold text-gray-500 hover:text-gray-800"
        onClick={() => setIsLegendOpen(current => !current)}
      >
        凡例
        {isLegendOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {isLegendOpen && (
        <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          <LegendLine
            title={statusKind === "course" ? "営業状況" : "運行状況"}
            descriptions={statusDescription}
          />
          {pisteSymbol !== undefined && (
            <LegendLine title="圧雪" descriptions={PISTE_STATUS_DESCRIPTION} />
          )}
        </div>
      )}
    </div>
  );
};

const LegendLine = ({
  title,
  descriptions,
}: {
  title: string;
  descriptions: Record<StatusSymbol, string>;
}) => (
  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
    <span className="font-semibold text-gray-500">{title}</span>
    {(["○", "△", "×"] as const).map(symbol => (
      <span key={symbol} className="whitespace-nowrap">
        <span className="font-bold" style={{ color: SYMBOL_COLOR[symbol] }}>
          {symbol}
        </span>
        <span className="ml-1">{descriptions[symbol]}</span>
      </span>
    ))}
  </div>
);
