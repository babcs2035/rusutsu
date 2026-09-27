"use client";

import type React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusMark } from "@/features/resort-detail/components/CompactInfo";
import { StatusLegendDialog } from "@/features/resort-detail/components/CourseStatusTable";
import {
  COURSE_DIFFICULTY_META,
  SLOPE_COLOR_STOPS,
  SLOPE_MAX_DEG,
  SLOPE_MIN_DEG,
} from "@/lib/finalizedResortGeojsonShared";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/shared/components/SegmentedControl";
import { GSI_TILE_LAYERS } from "../constants";
import type {
  CourseColorMode,
  FinalizedFeatureStatus,
  MapTileVariant,
} from "../types";
import {
  ALL_COURSE_STATUSES,
  COURSE_STATUS_OPTIONS,
  DEFAULT_MAP_DISPLAY_SETTINGS,
  type MapDisplaySettings,
  OPEN_COURSE_STATUSES,
} from "../utils/mapDisplaySettings";
import {
  LIFT_STATUS_LEGEND,
  LiftFlowSample,
  MapLineLegendDialog,
} from "./MapLineLegendDialog";
import { MapSettingsDialog } from "./MapSettingsDialog";

/** 目盛りは 5° 刻み。幅が足りないときは 10° 刻みまで間引く */
const SLOPE_TICKS = (() => {
  const ticks: number[] = [];
  const first = Math.ceil(SLOPE_MIN_DEG / 5) * 5;
  for (let slope = first; slope <= SLOPE_MAX_DEG; slope += 5) ticks.push(slope);
  return ticks;
})();

const toSlopeRatio = (slope: number) =>
  ((slope - SLOPE_MIN_DEG) / (SLOPE_MAX_DEG - SLOPE_MIN_DEG)) * 100;

/**
 * 斜度の色スケール。
 * 帯は行いっぱいに広げて、目盛りは実際の位置に合わせて置く。
 * 等間隔に並べると -12°〜40° の範囲と目盛りの位置がずれる。
 */
const SlopeScale = () => (
  <div className="@container w-full min-w-[150px]">
    <div
      className="h-2.5 rounded-full"
      style={{
        background: `linear-gradient(90deg, ${SLOPE_COLOR_STOPS.map(
          stop => `${stop.color} ${toSlopeRatio(stop.slope).toFixed(1)}%`,
        ).join(", ")})`,
      }}
    />
    <div className="relative mt-1 h-3 text-[10px] leading-none text-gray-600">
      {SLOPE_TICKS.map((slope, index) => {
        const isEdgeStart = index === 0;
        const isEdgeEnd = index === SLOPE_TICKS.length - 1;
        const isMajor = slope % 10 === 0;

        return (
          <span
            key={slope}
            className={cn(
              "absolute top-0 whitespace-nowrap tabular-nums",
              isEdgeStart
                ? "translate-x-0"
                : isEdgeEnd
                  ? "-translate-x-full"
                  : "-translate-x-1/2",
              // 狭いときは 10° 刻みまで間引く
              !isMajor && "hidden @[19rem]:block",
            )}
            style={{ left: `${toSlopeRatio(slope)}%` }}
          >
            {isEdgeEnd ? `${slope}°+` : `${slope}°`}
          </span>
        );
      })}
    </div>
  </div>
);

const LegendItem = ({
  children,
  sample,
}: {
  children: React.ReactNode;
  sample: React.ReactNode;
}) => (
  <div className="flex shrink-0 items-center gap-1">
    {sample}
    <span className="whitespace-nowrap">{children}</span>
  </div>
);

const DIFFICULTY_KEYS = [
  "beginner",
  "beginnerIntermediate",
  "intermediate",
  "intermediateAdvanced",
  "advanced",
] as const;

const MODE_OPTIONS = [
  { value: "difficulty", label: "難易度" },
  { value: "slope", label: "斜度" },
] as const satisfies readonly { value: CourseColorMode; label: string }[];

const SEGMENT_ITEM_CLASS =
  "h-6 flex-1 px-1.5 text-[11px] @[25rem]:px-2 @[25rem]:text-xs";

/**
 * コースマップ用のツールバー。
 *
 * 表示切替と凡例をまとめたもの。地図の右下に浮かせる形（floating）と、
 * 地図の上の白い帯に並べる形（bar）で中身を変えないことで、
 * どこから見ても同じ操作・同じ凡例になるようにする。
 * 上段の操作は狭い画面でも必ず一列に並べる。
 */
export const FinalizedMapToolbar = ({
  mode,
  onModeChange,
  hasCourses,
  hasLifts,
  mapDisplaySettings = DEFAULT_MAP_DISPLAY_SETTINGS,
  onMapDisplaySettingsChange,
  showOpenOnly,
  onShowOpenOnlyChange,
  mapTileVariant,
  onMapTileVariantChange,
  presentation = "floating",
  className,
}: {
  mode: CourseColorMode;
  onModeChange: (mode: CourseColorMode) => void;
  hasCourses: boolean;
  hasLifts: boolean;
  mapDisplaySettings?: MapDisplaySettings;
  onMapDisplaySettingsChange?: (settings: MapDisplaySettings) => void;
  showOpenOnly: boolean;
  onShowOpenOnlyChange: (showOpenOnly: boolean) => void;
  mapTileVariant: MapTileVariant;
  onMapTileVariantChange: (variant: MapTileVariant) => void;
  /** "floating" は地図に浮かせるカード、"bar" は白い帯に並べる中身だけ */
  presentation?: "floating" | "bar";
  className?: string;
}) => {
  if (!hasCourses && !hasLifts) return null;

  const changeSettings = (settings: MapDisplaySettings) =>
    onMapDisplaySettingsChange?.(settings);
  const changeBackground = (variant: MapTileVariant, monochrome: boolean) => {
    onMapTileVariantChange(variant);
    changeSettings({ ...mapDisplaySettings, monochrome });
  };
  const changeStatus = (status: FinalizedFeatureStatus, checked: boolean) => {
    const courseStatuses = {
      ...mapDisplaySettings.courseStatuses,
      [status]: checked,
    };
    changeSettings({ ...mapDisplaySettings, courseStatuses });
  };
  const changeOpenOnly = (checked: boolean) => {
    changeSettings({
      ...mapDisplaySettings,
      courseStatuses: checked ? OPEN_COURSE_STATUSES : ALL_COURSE_STATUSES,
    });
    onShowOpenOnlyChange(checked);
  };
  // 浮かせるときは地図の右下に寄せる。帯に並べるときは左のボタンの続きにする
  const rowAlignClass =
    presentation === "bar" ? "justify-start" : "justify-end";

  const content = (
    <div
      className={cn(
        "@container flex w-full flex-col gap-1",
        presentation === "floating" && "p-1.5",
        className,
      )}
    >
      <div className={cn("flex flex-nowrap items-center gap-1", rowAlignClass)}>
        {hasCourses && (
          <SegmentedControl
            className="min-w-0 flex-1"
            options={MODE_OPTIONS}
            value={mode}
            onChange={onModeChange}
            itemClassName={SEGMENT_ITEM_CLASS}
            ariaLabel={option => `コースの色分けを${option.label}に切り替え`}
          />
        )}
        <SegmentedControl
          className="min-w-0 flex-1"
          options={Object.entries(GSI_TILE_LAYERS).map(([value, layer]) => ({
            value: value as MapTileVariant,
            label: layer.label,
          }))}
          value={mapTileVariant}
          onChange={onMapTileVariantChange}
          itemClassName={SEGMENT_ITEM_CLASS}
          ariaLabel={option => `${option.label}に切り替え`}
        />
        {hasCourses && (
          <label className="flex h-[26px] shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-md border border-gray-200 bg-white px-1.5 text-[11px] @[25rem]:text-xs font-semibold text-gray-700 hover:bg-gray-50">
            <Checkbox
              checked={showOpenOnly}
              onCheckedChange={checked => changeOpenOnly(checked === true)}
              className="h-4 w-4 data-[state=checked]:border-green-500 data-[state=checked]:bg-green-500"
            />
            営業中のみ
          </label>
        )}
      </div>

      {hasCourses && showOpenOnly && (
        <div
          className="flex h-7 w-full items-center gap-1.5"
          role="group"
          aria-label="表示するコースの営業状況"
        >
          {COURSE_STATUS_OPTIONS.filter(
            option => option.value !== "closed",
          ).map(option => (
            <label
              key={option.value}
              className={cn(
                "flex h-7 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-md border px-1 text-base font-semibold hover:bg-slate-100",
                mapDisplaySettings.courseStatuses[option.value]
                  ? "border-slate-400 bg-slate-50 text-slate-900"
                  : "border-gray-200 bg-white text-slate-500",
              )}
            >
              <Checkbox
                aria-label={option.label}
                checked={mapDisplaySettings.courseStatuses[option.value]}
                onCheckedChange={checked =>
                  changeStatus(option.value, checked === true)
                }
                className="size-4"
              />
              <span
                aria-hidden="true"
                className="flex h-5 shrink-0 items-center justify-center leading-none"
              >
                {option.value === "unknown" ? (
                  <span className="text-sm leading-none font-semibold text-slate-700">
                    不明
                  </span>
                ) : (
                  <StatusMark symbol={option.symbol as "○" | "△" | "×"} />
                )}
              </span>
            </label>
          ))}
          <StatusLegendDialog name="コース" className="size-7 [&_svg]:size-4" />
        </div>
      )}
      {/* 営業状況の選択中は色の凡例を隠す。 */}
      {!showOpenOnly && (
        <div
          className={cn(
            "h-7 flex-nowrap items-center gap-x-1 text-[10px] font-medium text-gray-700 @[25rem]:gap-x-2 @[25rem]:text-[11px]",
            rowAlignClass,
            "flex",
          )}
        >
          {hasCourses &&
            mode === "difficulty" &&
            DIFFICULTY_KEYS.map(key => (
              <LegendItem
                key={key}
                sample={
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/20"
                    style={{ background: COURSE_DIFFICULTY_META[key].color }}
                  />
                }
              >
                {COURSE_DIFFICULTY_META[key].label}
              </LegendItem>
            ))}
          {hasCourses && mode === "slope" && <SlopeScale />}
        </div>
      )}
      <div className="flex w-full items-center gap-2">
        {hasLifts && (
          <div className="grid min-w-0 flex-1 grid-cols-4 items-center gap-x-2 text-[10px] font-medium text-gray-700 @[25rem]:text-[11px]">
            {LIFT_STATUS_LEGEND.map(item => (
              <div key={item.label} className="flex min-w-0 items-center gap-1">
                <LiftFlowSample {...item} />
                <span className="shrink-0 whitespace-nowrap">{item.label}</span>
              </div>
            ))}
          </div>
        )}
        <MapLineLegendDialog showUngroomed={mapDisplaySettings.showUngroomed} />
        <MapSettingsDialog
          settings={mapDisplaySettings}
          onChange={changeSettings}
          variant={mapTileVariant}
          onBackgroundChange={changeBackground}
          onStatusChange={changeStatus}
        />
      </div>
    </div>
  );

  if (presentation === "bar") return content;

  return (
    <Card className="w-[min(27rem,100%)] gap-0 overflow-hidden p-0">
      <CardContent className="p-0">{content}</CardContent>
    </Card>
  );
};
