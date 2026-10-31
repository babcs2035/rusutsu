"use client";

import type React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { COURSE_DIFFICULTY_META } from "@/lib/finalizedResortGeojsonShared";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/shared/components/SegmentedControl";
import { GSI_TILE_LAYERS } from "../constants";
import type {
  CourseColorMode,
  FinalizedFeatureStatus,
  MapTileVariant,
} from "../types";
import {
  DEFAULT_MAP_DISPLAY_SETTINGS,
  type MapDisplaySettings,
} from "../utils/mapDisplaySettings";
import { MapCourseStatusOptions } from "./MapCourseStatusControl";
import {
  LIFT_STATUS_LEGEND,
  LiftFlowSample,
  MapLineLegendDialog,
} from "./MapLineLegendDialog";
import { MapSettingsDialog } from "./MapSettingsDialog";
import { SlopeColorScale } from "./SlopeColorScale";

const LegendItem = ({
  children,
  sample,
}: {
  children: React.ReactNode;
  sample: React.ReactNode;
}) => (
  <div className="flex min-w-0 flex-col items-center gap-1">
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
  "h-6 flex-1 px-1.5 text-[11px] md:h-8 md:px-0 md:text-sm @[25rem]:px-2 @[25rem]:text-xs md:@[25rem]:px-2 md:@[25rem]:text-sm";

/**
 * コースマップ用のツールバー。
 *
 * 上段に凡例・フィルター、下段に表示切り替えを置く。地図の右下に浮かせる形（floating）と、
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
  onShowOpenOnlyChange,
  mapTileVariant,
  onMapTileVariantChange,
  presentation = "floating",
  showOpenOnly = false,
  communityFilters,
  className,
}: {
  mode: CourseColorMode;
  onModeChange: (mode: CourseColorMode) => void;
  hasCourses: boolean;
  hasLifts: boolean;
  mapDisplaySettings?: MapDisplaySettings;
  onMapDisplaySettingsChange?: (settings: MapDisplaySettings) => void;
  onShowOpenOnlyChange: (showOpenOnly: boolean) => void;
  mapTileVariant: MapTileVariant;
  onMapTileVariantChange: (variant: MapTileVariant) => void;
  /** "floating" は地図に浮かせるカード、"bar" は白い帯に並べる中身だけ */
  presentation?: "floating" | "bar";
  showOpenOnly?: boolean;
  communityFilters?: (settings: React.ReactNode) => React.ReactNode;
  className?: string;
}) => {
  if (!hasCourses && !hasLifts && !communityFilters) return null;

  const changeSettings = (settings: MapDisplaySettings) => {
    onMapDisplaySettingsChange?.(settings);
    if (settings.showCourses !== mapDisplaySettings.showCourses) {
      onShowOpenOnlyChange(false);
    }
  };
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
    // 個別選択はプリセットと区別し、営業中のみを自動でオンにしない。
    onShowOpenOnlyChange(false);
  };
  // 浮かせるときは地図の右下に寄せる。帯に並べるときは左のボタンの続きにする
  const rowAlignClass =
    presentation === "bar" ? "justify-start" : "justify-end";

  const settingsControl = (
    <MapSettingsDialog
      settings={mapDisplaySettings}
      onChange={changeSettings}
      variant={mapTileVariant}
      onBackgroundChange={changeBackground}
      onStatusChange={changeStatus}
      courseColorMode={mode}
      onCourseColorModeChange={onModeChange}
    />
  );
  const wrapContent = (content: React.ReactNode) =>
    presentation === "bar" ? (
      content
    ) : (
      <Card className="w-[min(27rem,100%)] gap-0 overflow-hidden p-0">
        <CardContent className="p-0">{content}</CardContent>
      </Card>
    );
  if (communityFilters)
    return wrapContent(
      <div
        className={cn(
          "@container flex w-full flex-col gap-1",
          presentation === "floating" && "p-1.5",
          className,
        )}
      >
        {communityFilters(settingsControl)}
      </div>,
    );

  const content = (
    <div
      className={cn(
        "@container flex w-full flex-col gap-1",
        presentation === "floating" && "p-1.5",
        className,
      )}
    >
      <div className="flex min-w-0 items-stretch gap-2" data-map-legends="true">
        {hasCourses && (
          <div className="flex min-w-0 flex-1 items-center">
            {showOpenOnly && onMapDisplaySettingsChange ? (
              <MapCourseStatusOptions
                settings={mapDisplaySettings}
                onChange={onMapDisplaySettingsChange}
              />
            ) : mode === "slope" ? (
              <SlopeColorScale />
            ) : (
              <div className="grid w-full grid-cols-5 gap-0.5 text-[8px] leading-none text-gray-600 @[25rem]:text-[9px]">
                {DIFFICULTY_KEYS.map(key => (
                  <LegendItem
                    key={key}
                    sample={
                      <span
                        className="h-2 w-full rounded-sm"
                        style={{
                          background: COURSE_DIFFICULTY_META[key].color,
                        }}
                      />
                    }
                  >
                    <span title={COURSE_DIFFICULTY_META[key].label}>
                      {key === "beginnerIntermediate"
                        ? "初中級"
                        : key === "intermediateAdvanced"
                          ? "中上級"
                          : COURSE_DIFFICULTY_META[key].label}
                    </span>
                  </LegendItem>
                ))}
              </div>
            )}
          </div>
        )}
        {hasLifts && (
          <div
            className={cn(
              "flex shrink-0 items-center gap-1",
              hasCourses && "border-l border-gray-200 pl-2",
            )}
          >
            <div className="grid grid-cols-2 items-center gap-x-3 gap-y-1.5 text-[11px] leading-none font-medium text-gray-700 @[25rem]:text-xs">
              {LIFT_STATUS_LEGEND.map(item => (
                <div key={item.label} className="flex items-center gap-1">
                  <span className="flex w-7 @[25rem]:w-8">
                    <LiftFlowSample {...item} />
                  </span>
                  <span className="whitespace-nowrap">{item.label}</span>
                </div>
              ))}
            </div>
            <MapLineLegendDialog />
          </div>
        )}
        {!hasLifts && <MapLineLegendDialog />}
      </div>
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
        {settingsControl}
      </div>
    </div>
  );

  return wrapContent(content);
};
