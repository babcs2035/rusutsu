"use client";

import { Home, Navigation, RotateCcw, RotateCw } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { GSI_TILE_LAYERS, INITIAL_CENTER } from "../constants";
import type { MapTileVariant } from "../types";

/** 回転ボタン 1 回あたりの角度 */
const ROTATE_STEP_DEG = 30;

const CONTROL_BUTTON_CLASS =
  "flex h-10 w-10 items-center justify-center rounded-none bg-white p-0 text-xl font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 min-w-0";

/**
 * ズーム・回転・ホーム・地図種別のボタン。
 *
 * 回転はスキー場詳細の地図だけに出す。PC はドラッグ回転が気づかれにくいので
 * +/- の隣にボタンを置き、スマホは 2 本指で回せるぶん、
 * 北からずれているときだけ「北に戻す」を出す。
 */
export const MapLibreControls = ({
  map,
  initialZoom,
  bottomPaddingRatio,
  mapTileVariant,
  onMapTileVariantChange,
  showTileVariantControl,
  showHomeButton,
  canRotate,
  isMobile,
  onUserMapInteraction,
  onUserMapZoomInteraction,
}: {
  map: MapLibreMap | null;
  initialZoom: number;
  bottomPaddingRatio: number;
  mapTileVariant: MapTileVariant;
  onMapTileVariantChange: (variant: MapTileVariant) => void;
  /** コースマップのツールバー側に地図/写真がある場合は false */
  showTileVariantControl: boolean;
  showHomeButton: boolean;
  canRotate: boolean;
  isMobile: boolean;
  onUserMapInteraction?: () => void;
  onUserMapZoomInteraction?: () => void;
}) => {
  const [bearing, setBearing] = useState(0);

  useEffect(() => {
    if (!map) return;

    const syncBearing = () => setBearing(map.getBearing());
    syncBearing();
    map.on("rotate", syncBearing);
    return () => {
      map.off("rotate", syncBearing);
    };
  }, [map]);

  const mobileBottomOffset =
    bottomPaddingRatio > 0
      ? `clamp(1rem, calc(${bottomPaddingRatio * 100}dvh + 1rem), calc(100dvh - 11rem))`
      : "1rem";
  const isFacingNorth = Math.abs(bearing) < 0.5;
  const showMobileCompass = canRotate && isMobile && !isFacingNorth;

  const rotateBy = (deltaDeg: number) => {
    if (!map) return;
    map.easeTo({ bearing: map.getBearing() + deltaDeg, duration: 240 });
  };

  const compassButton = (
    <Button
      onClick={() => map?.easeTo({ bearing: 0, duration: 300 })}
      aria-label="地図の向きを北に戻す"
      className={cn(CONTROL_BUTTON_CLASS, "border-t border-gray-100")}
    >
      <Navigation
        size={17}
        className="text-red-600"
        fill="currentColor"
        style={{ transform: `rotate(${-bearing}deg)` }}
      />
    </Button>
  );

  return (
    <div
      className="pointer-events-none absolute z-[750] flex flex-col gap-2 items-start right-4 bottom-[var(--map-controls-bottom)] md:left-4 md:right-auto md:bottom-4"
      style={
        { "--map-controls-bottom": mobileBottomOffset } as React.CSSProperties
      }
    >
      <div className="pointer-events-auto flex items-end gap-2">
        {/* 拡大縮小はデスクトップのみ。スマホはピンチ操作で行う */}
        <Card className="hidden md:flex gap-0 overflow-hidden p-0">
          <CardContent className="p-0">
            <Button
              onClick={() => {
                map?.zoomIn();
                window.setTimeout(() => onUserMapZoomInteraction?.(), 0);
              }}
              aria-label="地図を拡大"
              className={CONTROL_BUTTON_CLASS}
            >
              +
            </Button>
            <Button
              onClick={() => {
                map?.zoomOut();
                window.setTimeout(() => onUserMapZoomInteraction?.(), 0);
              }}
              aria-label="地図を縮小"
              className={cn(CONTROL_BUTTON_CLASS, "border-t border-gray-100")}
            >
              -
            </Button>
          </CardContent>
        </Card>
        {canRotate && (
          <Card className="hidden md:flex gap-0 overflow-hidden p-0">
            <CardContent className="p-0">
              <Button
                onClick={() => rotateBy(-ROTATE_STEP_DEG)}
                aria-label="地図を左に回転"
                className={CONTROL_BUTTON_CLASS}
              >
                <RotateCcw size={17} />
              </Button>
              {compassButton}
              <Button
                onClick={() => rotateBy(ROTATE_STEP_DEG)}
                aria-label="地図を右に回転"
                className={cn(CONTROL_BUTTON_CLASS, "border-t border-gray-100")}
              >
                <RotateCw size={17} />
              </Button>
            </CardContent>
          </Card>
        )}
        {showMobileCompass && (
          <Card className="flex gap-0 overflow-hidden p-0 md:hidden">
            <CardContent className="p-0">{compassButton}</CardContent>
          </Card>
        )}
      </div>
      {showHomeButton && (
        <Card className="pointer-events-auto gap-0 overflow-hidden p-0">
          <CardContent className="p-0">
            <Button
              onClick={() => {
                onUserMapInteraction?.();
                map?.jumpTo({
                  center: [INITIAL_CENTER[1], INITIAL_CENTER[0]],
                  zoom: initialZoom,
                });
              }}
              aria-label="地図をリセット"
              className={cn(CONTROL_BUTTON_CLASS, "text-base")}
            >
              <Home size={18} />
            </Button>
          </CardContent>
        </Card>
      )}
      {showTileVariantControl && (
        <Card className="pointer-events-auto gap-0 overflow-hidden p-1">
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
      )}
    </div>
  );
};
