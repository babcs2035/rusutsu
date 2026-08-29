"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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

/** コースの滑走方向。地図上と同じ塗りつぶしの矢羽 */
const CourseDirectionSample = () => (
  <svg
    aria-hidden="true"
    className="h-3 w-6 shrink-0"
    viewBox="0 0 24 12"
    role="presentation"
  >
    <line
      x1="1"
      y1="6"
      x2="23"
      y2="6"
      stroke="#94A3B8"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    {[7, 16].map(x => (
      <path
        key={x}
        d={`M ${x + 3} 6 L ${x - 3} 3 L ${x - 1.2} 6 L ${x - 3} 9 Z`}
        fill="#FFFFFF"
        stroke="rgba(15,23,42,0.55)"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
    ))}
  </svg>
);

/** リフトの上り方向。地図上と同じ二重山形（≫） */
const LIFT_CHEVRON_PATHS = [12.5, 17].map(
  x => `M ${x - 3.4} 2.4 L ${x} 6 L ${x - 3.4} 9.6`,
);

const LiftDirectionSample = () => (
  <svg
    aria-hidden="true"
    className="h-3 w-6 shrink-0"
    viewBox="0 0 24 12"
    role="presentation"
  >
    <line
      x1="1"
      y1="6"
      x2="23"
      y2="6"
      stroke="#94A3B8"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    {/* 白だけだと明るい背景で消えるので、暗い縁を先に敷いてから白を重ねる */}
    {LIFT_CHEVRON_PATHS.map(d => (
      <path
        key={`halo-${d}`}
        d={d}
        fill="none"
        stroke="rgba(15,23,42,0.55)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ))}
    {LIFT_CHEVRON_PATHS.map(d => (
      <path
        key={`fill-${d}`}
        d={d}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ))}
  </svg>
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
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  // 帯に並べる形（比較の上部）は場所に余裕があるので、凡例は畳まず常に出す
  const isExpanded = showLegend && (presentation === "bar" || isLegendOpen);

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
        {showLegend && presentation !== "bar" && (
          <Button
            type="button"
            variant="ghost"
            aria-expanded={isExpanded}
            className="h-8 shrink-0 gap-0.5 px-2 text-[13px] font-semibold text-gray-600 hover:bg-gray-50"
            onClick={() => setIsLegendOpen(current => !current)}
          >
            凡例
            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </Button>
        )}
      </div>

      {/* 狭い画面では凡例で高さを取られるので、既定では畳んでおく */}
      <div
        className={cn(
          "scroll-touch items-center gap-2.5 overflow-x-auto text-[11px] font-medium text-gray-700",
          rowAlignClass,
          isExpanded ? "flex" : "hidden md:flex",
          !showLegend && "hidden",
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
        {hasCourses && mode === "slope" && (
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="w-[132px] md:w-[220px]">
              <div
                className="h-2 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${SLOPE_COLOR_STOPS.map(
                    stop =>
                      `${stop.color} ${(
                        ((stop.slope - SLOPE_MIN_DEG) /
                          (SLOPE_MAX_DEG - SLOPE_MIN_DEG)) *
                          100
                      ).toFixed(1)}%`,
                  ).join(", ")})`,
                }}
              />
              <div className="mt-0.5 flex justify-between text-[10px] leading-none">
                <span>平坦</span>
                <span>10°</span>
                <span>25°</span>
                <span>40°+</span>
              </div>
            </div>
          </div>
        )}
        {isExpanded && (
          <>
            {hasCourses && (
              <LegendItem
                sample={
                  <span className="h-[3px] w-7 shrink-0 bg-[repeating-linear-gradient(90deg,#475569_0_6px,transparent_6px_10px)]" />
                }
              >
                非圧雪
              </LegendItem>
            )}
            {hasCourses && (
              <LegendItem sample={<CourseDirectionSample />}>
                滑走方向
              </LegendItem>
            )}
            {hasLifts && (
              <LegendItem sample={<LiftDirectionSample />}>上り方向</LegendItem>
            )}
            {hasLifts && (
              <>
                <LegendItem
                  sample={
                    <span className="h-[3px] w-6 shrink-0 bg-[repeating-linear-gradient(90deg,#7FE3F5_0_5px,#1E40AF_5px_10px)]" />
                  }
                >
                  リフト運行中
                </LegendItem>
                <LegendItem
                  sample={
                    <span className="h-[3px] w-5 shrink-0 bg-[#C2410C]" />
                  }
                >
                  一部運休
                </LegendItem>
                <LegendItem
                  sample={
                    <span className="h-[3px] w-5 shrink-0 bg-[#8A99A8]" />
                  }
                >
                  運休
                </LegendItem>
              </>
            )}
          </>
        )}
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
