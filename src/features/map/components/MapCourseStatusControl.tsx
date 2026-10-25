"use client";

import { type ReactNode, useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusMark } from "@/features/resort-detail/components/CompactInfo";
import { cn } from "@/lib/utils";
import {
  MAP_BOTTOM_TOOLBAR_ATTRIBUTE,
  MAP_TOP_CONTROLS_ATTRIBUTE,
} from "../constants";
import {
  ALL_COURSE_STATUSES,
  COURSE_STATUS_OPTIONS,
  isOpenOnlyCourseSelection,
  type MapDisplaySettings,
  OPEN_COURSE_STATUSES,
} from "../utils/mapDisplaySettings";

/** 地図の表示設定バーと独立させ、プレビューでも操作できる営業フィルター。 */
export function MapCourseStatusControl({
  enabled,
  checked,
  settings,
  onCheckedChange,
  onSettingsChange,
  shared = false,
  leading,
  trailing,
  compact = false,
  inline = false,
  placement = "top",
  className,
}: {
  enabled: boolean;
  checked: boolean;
  settings: MapDisplaySettings;
  onCheckedChange: (checked: boolean) => void;
  onSettingsChange: (settings: MapDisplaySettings) => void;
  shared?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  compact?: boolean;
  inline?: boolean;
  placement?: "top" | "bottom";
  className?: string;
}) {
  const descriptionId = useId();
  const active =
    enabled &&
    checked &&
    (inline || placement === "bottom"
      ? settings.showCourses
      : isOpenOnlyCourseSelection(settings));
  return (
    <div
      {...(!inline
        ? {
            [placement === "bottom"
              ? MAP_BOTTOM_TOOLBAR_ATTRIBUTE
              : MAP_TOP_CONTROLS_ATTRIBUTE]: "true",
          }
        : {})}
      className={cn(
        inline
          ? "flex shrink-0 items-center"
          : placement === "bottom"
            ? "pointer-events-none absolute bottom-2 left-2 z-[760] flex items-end gap-1"
            : "pointer-events-none absolute top-2 right-12 left-2 z-[760] flex items-start gap-1",
        className,
      )}
    >
      {leading && <div className="pointer-events-auto shrink-0">{leading}</div>}
      <div
        className={cn(
          "flex min-w-0 flex-1 items-start gap-1",
          placement === "bottom" ? "flex-col-reverse" : "flex-col",
        )}
      >
        {enabled || inline ? (
          <button
            type="button"
            aria-pressed={active}
            aria-label="営業中のコースのみ表示"
            aria-describedby={descriptionId}
            disabled={!enabled}
            onClick={() => {
              if (!enabled) return;
              onSettingsChange({
                ...settings,
                showCourses: true,
                courseStatuses: active
                  ? ALL_COURSE_STATUSES
                  : OPEN_COURSE_STATUSES,
              });
              onCheckedChange(!active);
            }}
            className={cn(
              "pointer-events-auto flex h-9 shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[13px] font-bold whitespace-nowrap text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 md:h-10 md:gap-1.5 md:px-3 md:text-base",
              compact &&
                "h-9 gap-1 px-1.5 text-sm font-semibold md:h-[34px] md:gap-1 md:px-1.5 md:text-[13px]",
              inline &&
                "h-9 gap-1 px-1 text-sm font-semibold min-[375px]:px-1.5 md:h-8 md:gap-1 md:px-1.5 md:text-[13px] disabled:opacity-50",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-4 items-center justify-center rounded-sm border text-xs",
                !compact && !inline && "md:size-5 md:text-sm",
                inline && "size-3.5",
                active
                  ? "border-blue-500 bg-blue-500 text-white"
                  : "border-slate-300 bg-white",
              )}
            >
              {active ? "✓" : ""}
            </span>
            営業中のみ
          </button>
        ) : (
          <span
            role="status"
            className={cn(
              "inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-md border border-slate-200 bg-white/95 px-2 text-xs font-medium text-slate-600 md:h-8 md:text-sm",
              compact && "h-6 px-1.5 text-[11px] md:h-6 md:px-1.5 md:text-xs",
            )}
          >
            コース状況不明
          </span>
        )}
        {active && !inline && (
          <div
            role="group"
            aria-label="表示するコースの営業状況"
            className="pointer-events-auto flex w-max items-center gap-0.5 rounded-md border border-slate-200 bg-white/95 p-0.5 shadow-sm"
          >
            {COURSE_STATUS_OPTIONS.filter(
              option => option.value !== "closed",
            ).map(option => (
              <label
                key={option.value}
                className="flex h-6 cursor-pointer items-center gap-1 rounded px-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-100 md:text-xs"
              >
                <Checkbox
                  aria-labelledby={`${descriptionId}-${option.value}`}
                  checked={settings.courseStatuses[option.value]}
                  onCheckedChange={value =>
                    onSettingsChange({
                      ...settings,
                      courseStatuses: {
                        ...settings.courseStatuses,
                        [option.value]: value === true,
                      },
                    })
                  }
                  className="size-3.5"
                />
                <span
                  id={`${descriptionId}-${option.value}`}
                  className="sr-only"
                >
                  {option.label}
                </span>
                <span
                  aria-hidden="true"
                  className="[&_[role=img]]:size-3 md:[&_[role=img]]:size-3.5"
                >
                  {option.value === "unknown" ? (
                    "不明"
                  ) : (
                    <StatusMark size="sm" symbol={option.symbol as "○" | "△"} />
                  )}
                </span>
              </label>
            ))}
          </div>
        )}
        {enabled && (
          <span
            id={descriptionId}
            className={cn(
              "rounded bg-white/95 px-1.5 py-0.5 text-[10px] text-slate-600",
              !(shared && active) && "sr-only",
            )}
          >
            {shared
              ? "比較中の全地図に適用"
              : "表示するコースを営業状況で絞り込みます"}
          </span>
        )}
      </div>
      {trailing && (
        <div className="pointer-events-auto shrink-0">{trailing}</div>
      )}
    </div>
  );
}

/** 下部パネルの凡例欄で営業状況を個別に選ぶ。 */
export function MapCourseStatusOptions({
  settings,
  onChange,
}: {
  settings: MapDisplaySettings;
  onChange: (settings: MapDisplaySettings) => void;
}) {
  return (
    <div
      role="group"
      aria-label="表示するコースの営業状況"
      className="flex w-full min-w-0 items-center justify-evenly gap-1"
    >
      {COURSE_STATUS_OPTIONS.filter(option => option.value !== "closed").map(
        option => (
          <label
            key={option.value}
            className="flex h-7 cursor-pointer items-center gap-1 rounded px-0.5 text-xs font-semibold whitespace-nowrap hover:bg-slate-100"
          >
            <Checkbox
              checked={settings.courseStatuses[option.value]}
              aria-label={option.label}
              onCheckedChange={checked =>
                onChange({
                  ...settings,
                  courseStatuses: {
                    ...settings.courseStatuses,
                    [option.value]: checked === true,
                  },
                })
              }
              className="size-3.5"
            />
            {option.value === "unknown" ? (
              "不明"
            ) : (
              <StatusMark size="sm" symbol={option.symbol as "○" | "△"} />
            )}
          </label>
        ),
      )}
    </div>
  );
}
