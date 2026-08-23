"use client";

import { Home } from "lucide-react";
import type React from "react";
import { useMap } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { GSI_TILE_LAYERS, INITIAL_CENTER } from "../constants";
import type { MapTileVariant } from "../types";

/**
 * ズーム操作。
 * スマホではピンチで足りるので +/- は出さない。ホームボタンは全国マップだけ。
 */
export const MapControls = ({
  initialZoom,
  bottomPaddingRatio,
  mapTileVariant,
  onMapTileVariantChange,
  showTileVariantControl,
  showHomeButton,
  onUserMapInteraction,
  onUserMapZoomInteraction,
}: {
  initialZoom: number;
  bottomPaddingRatio: number;
  mapTileVariant: MapTileVariant;
  onMapTileVariantChange: (variant: MapTileVariant) => void;
  /** コースマップのツールバー側に地図/写真がある場合は false */
  showTileVariantControl: boolean;
  showHomeButton: boolean;
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
      {/* 拡大縮小はデスクトップのみ。スマホはピンチ操作で行う */}
      <Card className="hidden md:flex gap-0 overflow-hidden p-0">
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
          <Button
            onClick={() => {
              map.zoomOut();
              window.setTimeout(() => onUserMapZoomInteraction?.(), 0);
            }}
            aria-label="地図を縮小"
            className="flex h-10 w-10 items-center justify-center rounded-none border-t border-gray-100 bg-white p-0 text-xl font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 min-w-0"
          >
            -
          </Button>
        </CardContent>
      </Card>
      {showHomeButton && (
        <Card className="gap-0 overflow-hidden p-0">
          <CardContent className="p-0">
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
      )}
      {showTileVariantControl && (
        <Card className="gap-0 overflow-hidden p-1">
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
