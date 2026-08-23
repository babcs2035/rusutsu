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
import { GSI_TILE_LAYERS } from "../constants";
import type { CourseColorMode, MapTileVariant } from "../types";

const SegmentedControl = <T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: (option: { value: T; label: string }) => string;
}) => (
  <div className="flex shrink-0 overflow-hidden rounded-md border border-gray-200">
    {options.map(option => {
      const isActive = value === option.value;
      return (
        <Button
          key={option.value}
          type="button"
          aria-label={ariaLabel(option)}
          aria-pressed={isActive}
          variant={isActive ? "default" : "ghost"}
          className={cn(
            "h-8 min-w-0 rounded-none px-2.5 text-[13px] font-semibold",
            !isActive && "bg-white text-gray-600 hover:bg-gray-50",
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      );
    })}
  </div>
);

const DirectionMarkSample = () => (
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

/**
 * コースマップ用のツールバー。
 *
 * 表示切替と凡例を地図の右下にまとめる。狭い画面でも縦に積み上がらないよう、
 * 各要素は横に並べて折り返し、はみ出す帯は横スクロールさせる。
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
}: {
  mode: CourseColorMode;
  onModeChange: (mode: CourseColorMode) => void;
  hasCourses: boolean;
  hasLifts: boolean;
  showOpenOnly: boolean;
  onShowOpenOnlyChange: (showOpenOnly: boolean) => void;
  mapTileVariant: MapTileVariant;
  onMapTileVariantChange: (variant: MapTileVariant) => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!hasCourses && !hasLifts) return null;

  const tileOptions = Object.entries(GSI_TILE_LAYERS).map(
    ([variant, layer]) => ({
      value: variant as MapTileVariant,
      label: layer.label,
    }),
  );

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <CardContent className="flex flex-col gap-1 p-1.5">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {hasCourses && (
            <SegmentedControl
              options={MODE_OPTIONS}
              value={mode}
              onChange={onModeChange}
              ariaLabel={option => `コースの色分けを${option.label}に切り替え`}
            />
          )}
          <SegmentedControl
            options={tileOptions}
            value={mapTileVariant}
            onChange={onMapTileVariantChange}
            ariaLabel={option => `${option.label}に切り替え`}
          />
          <label className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-50">
            <Checkbox
              checked={showOpenOnly}
              onCheckedChange={checked =>
                onShowOpenOnlyChange(checked === true)
              }
              className="h-3.5 w-3.5 data-[state=checked]:border-green-500 data-[state=checked]:bg-green-500"
            />
            営業中のみ
          </label>
          <Button
            type="button"
            variant="ghost"
            aria-expanded={isExpanded}
            className="h-8 shrink-0 gap-0.5 px-2 text-[13px] font-semibold text-gray-600 hover:bg-gray-50"
            onClick={() => setIsExpanded(current => !current)}
          >
            凡例
            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </Button>
        </div>

        {/* 狭い画面では凡例で高さを取られるので、既定では畳んでおく */}
        <div
          className={cn(
            "items-center justify-end gap-2.5 overflow-x-auto text-[11px] font-medium text-gray-700 scroll-touch",
            isExpanded ? "flex" : "hidden md:flex",
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
              <LegendItem sample={<DirectionMarkSample />}>
                滑走・上り方向
              </LegendItem>
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
      </CardContent>
    </Card>
  );
};
