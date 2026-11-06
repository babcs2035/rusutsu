"use client";

import type {
  TicketDurationOption,
  TicketDurationOptions,
} from "../utils/durationOptions";
import { formatHours } from "../utils/durationOptions";

const yen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

/** 「午前券（8:30〜12:30）」「4時間券（3.5時間）」のように、使える時間を添えた券名 */
const optionLabel = (option: TicketDurationOption, showHours: boolean) => {
  const extras = [
    option.windowLabel,
    showHours && !option.windowLabel ? formatHours(option.hours) : null,
    ...option.includedItems.map(item => `${item}付き`),
  ].filter(Boolean);
  return extras.length > 0
    ? `${option.productName}（${extras.join("・")}）`
    : option.productName;
};

const OptionGroup = ({
  title,
  options,
  dayCount,
  showHours = false,
}: {
  title: string;
  options: TicketDurationOption[];
  dayCount: number;
  showHours?: boolean;
}) =>
  options.length === 0 ? null : (
    <div className="mt-1.5">
      <p className="text-xs font-semibold text-gray-600 md:text-sm">{title}</p>
      {options.map(option => (
        <p
          key={option.productIds.join("+")}
          className="flex items-baseline justify-between gap-3 text-xs text-gray-700 md:text-sm"
        >
          <span className="min-w-0">{optionLabel(option, showHours)}</span>
          {Number.isFinite(option.total) && (
            <span className="flex-shrink-0 font-mono">
              {yen(option.total * dayCount)}
            </span>
          )}
        </p>
      ))}
    </div>
  );

/**
 * 一番上の券のほかに比べられる券（仕様書 S4〜S6・S15）と、営業時間の注記。
 * 一番上の券と内訳は TicketPlanCard 側で出すので、ここでは並べない
 */
export const DurationAlternatives = ({
  options,
  dayCount,
}: {
  options: TicketDurationOptions | undefined;
  dayCount: number;
}) => {
  if (!options) return null;
  const notes = [
    ...new Set([...options.notes, ...(options.primary?.extraNotes ?? [])]),
  ];
  const included = options.primary?.includedItems ?? [];
  return (
    <>
      {included.length > 0 && (
        <p className="mt-1 text-xs text-gray-700 md:text-sm">
          {included.map(item => `${item}付き`).join("・")}
        </p>
      )}
      {notes.length > 0 && (
        <div className="mt-1 flex flex-col">
          {notes.map(note => (
            <p key={note} className="text-xs text-orange-900 md:text-sm">
              {note}
            </p>
          ))}
        </div>
      )}
      <OptionGroup
        title="時間帯が決まっていてもよければ"
        options={options.timeRestricted}
        dayCount={dayCount}
      />
      <OptionGroup
        title="1時間短くてもよければ"
        options={options.shorter}
        dayCount={dayCount}
        showHours
      />
      <OptionGroup
        title="1枚で滑れるいちばん長い券"
        options={options.longestSingle ? [options.longestSingle] : []}
        dayCount={dayCount}
        showHours
      />
      <OptionGroup
        title="付いている物がある券"
        options={options.withIncludedItems}
        dayCount={dayCount}
      />
    </>
  );
};
