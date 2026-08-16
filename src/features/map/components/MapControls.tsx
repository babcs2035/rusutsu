"use client";

import { ChevronDown, ChevronUp, Home } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { useMap } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  COURSE_DIFFICULTY_META,
  SLOPE_COLOR_STOPS,
} from "@/lib/finalizedResortGeojsonShared";
import { cn } from "@/lib/utils";
import { GSI_TILE_LAYERS, INITIAL_CENTER } from "../constants";
import type { CourseColorMode, MapTileVariant } from "../types";

export const MapControls = ({
  initialZoom,
  bottomPaddingRatio,
  mapTileVariant,
  onMapTileVariantChange,
  hideMobileTileVariantControl = false,
  onUserMapInteraction,
  onUserMapZoomInteraction,
}: {
  initialZoom: number;
  bottomPaddingRatio: number;
  mapTileVariant: MapTileVariant;
  onMapTileVariantChange: (variant: MapTileVariant) => void;
  hideMobileTileVariantControl?: boolean;
  onUserMapInteraction?: () => void;
  onUserMapZoomInteraction?: () => void;
}) => {
  const map = useMap();
  const mobileBottomOffset =
    bottomPaddingRatio > 0
      ? `clamp(1rem, calc(${bottomPaddingRatio * 100}dvh + 1rem), calc(100dvh - 11rem))`
      : "1rem";

  return (
    <div
      className="absolute z-[750] flex flex-col gap-2 items-start right-4 bottom-[var(--map-controls-bottom)] md:left-4 md:right-auto md:bottom-4"
      style={
        { "--map-controls-bottom": mobileBottomOffset } as React.CSSProperties
      }
    >
      {/* ズーム・リセットを 1 カードに縦積みし，まとめて 1 つのコントロールに見せる
          （Card の既定 py-(--card-spacing) は p-0 で除去。残すとボタン周囲に余白が生まれる） */}
      <Card className="gap-0 overflow-hidden p-0">
        <CardContent className="p-0">
          <Button
            onClick={() => {
              map.zoomIn();
              window.setTimeout(() => onUserMapZoomInteraction?.(), 0);
            }}
            aria-label="地図を拡大"
            className="flex h-10 w-10 items-center justify-center rounded-none bg-white p-0 text-xl font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 min-w-0"
          >
            +
          </Button>
          <Separator orientation="horizontal" className="bg-gray-100" />
          <Button
            onClick={() => {
              map.zoomOut();
              window.setTimeout(() => onUserMapZoomInteraction?.(), 0);
            }}
            aria-label="地図を縮小"
            className="flex h-10 w-10 items-center justify-center rounded-none bg-white p-0 text-xl font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 min-w-0"
          >
            -
          </Button>
          <Separator orientation="horizontal" className="bg-gray-100" />
          <Button
            onClick={() => {
              onUserMapInteraction?.();
              map.setView(INITIAL_CENTER, initialZoom);
            }}
            aria-label="地図をリセット"
            className="flex h-10 w-10 items-center justify-center rounded-none bg-white p-0 text-gray-700 hover:bg-gray-50 hover:text-gray-900 min-w-0"
          >
            <Home size={18} />
          </Button>
        </CardContent>
      </Card>
      {/* タイル切替: セグメントコントロール（active は塗りつぶし，inactive は薄 hover） */}
      <Card
        className={cn(
          "gap-0 overflow-hidden p-1",
          hideMobileTileVariantControl ? "hidden md:flex" : "flex",
        )}
      >
        <CardContent className="flex gap-1 p-0">
          {Object.entries(GSI_TILE_LAYERS).map(([variant, layer]) => {
            const tileVariant = variant as MapTileVariant;
            const isActive = mapTileVariant === tileVariant;

            return (
              <Button
                key={variant}
                onClick={() => onMapTileVariantChange(tileVariant)}
                aria-label={`${layer.label}に切り替え`}
                aria-pressed={isActive}
                variant={isActive ? "default" : "ghost"}
                className={cn(
                  "h-8 w-16 rounded-md px-3 text-xs font-semibold",
                  !isActive &&
                    "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
                )}
              >
                {layer.label}
              </Button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export const FinalizedMapModeControl = ({
  mode,
  onModeChange,
  hasCourses,
  hasLifts,
  showOpenOnly,
  onShowOpenOnlyChange,
}: {
  mode: CourseColorMode;
  onModeChange: (mode: CourseColorMode) => void;
  hasCourses: boolean;
  hasLifts: boolean;
  showOpenOnly: boolean;
  onShowOpenOnlyChange: (showOpenOnly: boolean) => void;
}) => {
  if (!hasCourses && !hasLifts) return null;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {hasCourses && (
          <div className="flex">
            {(["difficulty", "slope"] as const).map(value => (
              <Button
                key={value}
                type="button"
                aria-label={`コースの色分けを${value === "difficulty" ? "難易度" : "斜度"}に切り替え`}
                aria-pressed={mode === value}
                variant={mode === value ? "default" : "outline"}
                className={cn(
                  "h-[2.25rem] rounded-none px-2.5 text-xs font-medium",
                  mode !== value &&
                    "text-gray-700 hover:bg-gray-50 hover:text-gray-900",
                )}
                onClick={() => onModeChange(value)}
              >
                {value === "difficulty" ? "難易度" : "斜度"}
              </Button>
            ))}
          </div>
        )}
        <Label
          className={cn(
            "flex h-[2.25rem] items-center gap-2 px-2.5 md:px-3 cursor-pointer bg-white text-gray-700 text-xs font-medium hover:bg-gray-50 hover:text-gray-900",
            hasCourses ? "border-l border-gray-100" : "",
          )}
        >
          <Checkbox
            id="map-show-open-only"
            checked={showOpenOnly}
            onCheckedChange={checked => onShowOpenOnlyChange(checked === true)}
            className="h-[14px] w-[14px] data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
          />
          <Label
            htmlFor="map-show-open-only"
            className="ml-2 text-sm font-medium"
          >
            営業中のみ
          </Label>
        </Label>
      </CardContent>
    </Card>
  );
};

export const FinalizedMapLegend = ({
  mode,
  hasCourses,
  hasLifts,
}: {
  mode: CourseColorMode;
  hasCourses: boolean;
  hasLifts: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!hasCourses && !hasLifts) return null;

  return (
    <Card className="max-w-[calc(100vw-2rem)] md:max-w-[620px] bg-white">
      <CardContent className="px-2.5 md:px-3 py-1 text-xs">
        {hasCourses && mode === "difficulty" && (
          <div className="flex gap-2 flex-wrap items-center">
            {(
              [
                "beginner",
                "beginnerIntermediate",
                "intermediate",
                "intermediateAdvanced",
                "advanced",
              ] as const
            ).map(key => (
              <div key={key} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-full border border-black/18"
                  style={{ background: COURSE_DIFFICULTY_META[key].color }}
                />
                <span className="font-medium">
                  {COURSE_DIFFICULTY_META[key].label}
                </span>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-6 px-2 text-gray-600 font-medium"
              onClick={() => setIsExpanded(current => !current)}
            >
              <div className="flex items-center gap-1">
                <span>詳細</span>
                {isExpanded ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </div>
            </Button>
          </div>
        )}
        {hasCourses && mode === "slope" && (
          <div className="flex items-center gap-2">
            <div className="w-[220px] md:w-[300px] max-w-[calc(100vw-9rem)]">
              <div
                className="h-2.5 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${SLOPE_COLOR_STOPS.map(
                    stop => `${stop.color} ${(stop.slope / 40) * 100}%`,
                  ).join(", ")})`,
                }}
              />
              <div className="flex mt-1 justify-between font-medium">
                <span>0°</span>
                <span>10°</span>
                <span>20°</span>
                <span>30°</span>
                <span>40°+</span>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-6 px-2 text-gray-600 font-medium"
              onClick={() => setIsExpanded(current => !current)}
            >
              <div className="flex items-center gap-1">
                <span>詳細</span>
                {isExpanded ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </div>
            </Button>
          </div>
        )}
        {isExpanded && (
          <>
            {hasCourses && (
              <div className="mt-2 flex gap-3 flex-wrap text-gray-600">
                <div className="flex items-center gap-1.5">
                  <div className="w-8 h-2 border-b-[5px] border-sky-300/42" />
                  <span>非圧雪</span>
                </div>
              </div>
            )}
            {(hasCourses || hasLifts) && (
              <div
                className={cn(
                  "mt-0 flex gap-3 flex-wrap",
                  hasCourses ? "mt-2" : "",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-[3px] bg-blue-800" />
                  <span>Open</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-[3px] bg-[repeating-linear-gradient(90deg,#94A3B8_0_8px,transparent_8px_14px)]" />
                  <span>一部・準備中</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-[3px] bg-slate-300 opacity-58" />
                  <span>Close</span>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
