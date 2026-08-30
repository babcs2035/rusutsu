"use client";

import type React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  COURSE_DIFFICULTY_META,
  SLOPE_COLOR_STOPS,
  SLOPE_MAX_DEG,
  SLOPE_MIN_DEG,
} from "@/lib/finalizedResortGeojsonShared";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/shared/components/SegmentedControl";
import { GSI_TILE_LAYERS } from "../constants";
import type { CourseColorMode, MapTileVariant } from "../types";

/**
 * リフトの凡例。地図と同じ「地の色＋流れる色」の二色で見せる。
 * 実際の色は maplibre/sources.ts の LIFT_PALETTE と合わせること。
 */
const LIFT_STATUS_LEGEND = [
  { label: "運行中", base: "#1E40AF", flow: "#00E1FF" },
  { label: "待機中", base: "#B91C1C", flow: "#FECACA" },
  { label: "運休", base: "#64748B", flow: "#FFFFFF" },
  { label: "不明", base: "#7C3AED", flow: "#EDE9FE" },
] as const;

const LiftFlowSample = ({ base, flow }: { base: string; flow: string }) => (
  <span
    className="h-[4px] w-8 shrink-0 rounded-full border border-black/5"
    style={{
      background: `repeating-linear-gradient(90deg, ${flow} 0 7px, ${base} 7px 14px)`,
    }}
  />
);

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

const SEGMENT_ITEM_CLASS = "h-8 px-2.5 text-[13px]";

/**
 * コースマップ用のツールバー。
 *
 * 表示切替と凡例をまとめたもの。地図の右下に浮かせる形（floating）と、
 * 地図の上の白い帯に並べる形（bar）で中身を変えないことで、
 * どこから見ても同じ操作・同じ凡例になるようにする。
 * 狭い画面でも縦に積み上がらないよう、各要素は横に並べて折り返す。
 */
export const FinalizedMapToolbar = ({
  mode,
  onModeChange,
  hasCourses,
  hasLifts,
  showOpenOnly,
  onShowOpenOnlyChange,
  mapTileVariant,
  onMapTileVariantChange,
  presentation = "floating",
  showLegend = true,
  className,
}: {
  mode: CourseColorMode;
  onModeChange: (mode: CourseColorMode) => void;
  hasCourses: boolean;
  hasLifts: boolean;
  showOpenOnly: boolean;
  onShowOpenOnlyChange: (showOpenOnly: boolean) => void;
  mapTileVariant: MapTileVariant;
  onMapTileVariantChange: (variant: MapTileVariant) => void;
  /** "floating" は地図に浮かせるカード、"bar" は白い帯に並べる中身だけ */
  presentation?: "floating" | "bar";
  /** 凡例を出すか。狭い帯では切替だけを残す */
  showLegend?: boolean;
  className?: string;
}) => {
  if (!hasCourses && !hasLifts) return null;

  const tileOptions = Object.entries(GSI_TILE_LAYERS).map(
    ([variant, layer]) => ({
      value: variant as MapTileVariant,
      label: layer.label,
    }),
  );
  // 浮かせるときは地図の右下に寄せる。帯に並べるときは左のボタンの続きにする
  const rowAlignClass =
    presentation === "bar" ? "justify-start" : "justify-end";

  const content = (
    <div
      className={cn(
        "flex flex-col gap-1",
        presentation === "floating" && "p-1.5",
        className,
      )}
    >
      <div className={cn("flex flex-wrap items-center gap-1.5", rowAlignClass)}>
        {hasCourses && (
          <SegmentedControl
            options={MODE_OPTIONS}
            value={mode}
            onChange={onModeChange}
            itemClassName={SEGMENT_ITEM_CLASS}
            ariaLabel={option => `コースの色分けを${option.label}に切り替え`}
          />
        )}
        <SegmentedControl
          options={tileOptions}
          value={mapTileVariant}
          onChange={onMapTileVariantChange}
          itemClassName={SEGMENT_ITEM_CLASS}
          ariaLabel={option => `${option.label}に切り替え`}
        />
        <label className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50">
          <Checkbox
            checked={showOpenOnly}
            onCheckedChange={checked => onShowOpenOnlyChange(checked === true)}
            className="h-4 w-4 data-[state=checked]:border-green-500 data-[state=checked]:bg-green-500"
          />
          営業中のみ
        </label>
      </div>

      {/*
        凡例は畳まない。矢印の意味は動きそのもので分かるので出さない。
        1 行目にコースの色、2 行目に非圧雪とリフトの営業状態を置く。
      */}
      <div
        className={cn(
          "flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-medium text-gray-700",
          rowAlignClass,
          showLegend ? "flex" : "hidden",
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

      {/* 非圧雪とリフトの営業状態。畳んで隠すほどの量ではない */}
      <div
        className={cn(
          "flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-medium text-gray-700",
          rowAlignClass,
          showLegend ? "flex" : "hidden",
        )}
      >
        {hasCourses && (
          <LegendItem
            sample={
              <span className="h-[3px] w-7 shrink-0 bg-[repeating-linear-gradient(90deg,#475569_0_6px,transparent_6px_10px)]" />
            }
          >
            非圧雪
          </LegendItem>
        )}
        {hasLifts &&
          LIFT_STATUS_LEGEND.map(item => (
            <LegendItem key={item.label} sample={<LiftFlowSample {...item} />}>
              {item.label}
            </LegendItem>
          ))}
      </div>
    </div>
  );

  if (presentation === "bar") return content;

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <CardContent className="p-0">{content}</CardContent>
    </Card>
  );
};
