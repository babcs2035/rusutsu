"use client";

import { Home } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { GSI_TILE_LAYERS, INITIAL_CENTER } from "../constants";
import type { MapTileVariant } from "../types";
import { MapCompassDial } from "./MapCompassDial";

const CONTROL_BUTTON_CLASS =
  "flex h-10 w-10 items-center justify-center rounded-none bg-white p-0 text-xl font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 min-w-0";

/**
 * ズーム・回転・ホーム・地図種別のボタン。
 *
 * 回転はスキー場詳細の地図だけに出す。スマホは 2 本指で簡単に回せるため
 * 方位ダイヤルは出さず、ドラッグ回転が気づかれにくい PC だけ +/- の隣に置く。
 */
export const MapLibreControls = ({
  map,
  initialZoom,
  mapTileVariant,
  onMapTileVariantChange,
  showTileVariantControl,
  showHomeButton,
  canRotate,
  onUserMapInteraction,
  onUserMapZoomInteraction,
}: {
  map: MapLibreMap | null;
  initialZoom: number;
  mapTileVariant: MapTileVariant;
  onMapTileVariantChange: (variant: MapTileVariant) => void;
  /** コースマップのツールバー側に地図/写真がある場合は false */
  showTileVariantControl: boolean;
  showHomeButton: boolean;
  canRotate: boolean;
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

  const compassDial = (
    <Card className="gap-0 overflow-hidden rounded-full p-0">
      <CardContent className="p-0">
        <MapCompassDial map={map} bearing={bearing} />
      </CardContent>
    </Card>
  );

  return (
    // 地図種別とホームは常に左下の同じ位置。ボトムシートの高さで
    // 動かすと押したい瞬間に位置が変わるので、オフセットは固定にする。
    <div className="pointer-events-none absolute z-[750] flex flex-col gap-2 items-start left-4 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] md:bottom-4">
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
        {canRotate && <div className="hidden md:block">{compassDial}</div>}
      </div>
      <div className="flex flex-row items-end gap-2 md:flex-col md:items-start">
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
                      "h-8 min-w-16 rounded-md px-3 text-xs font-semibold",
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
    </div>
  );
};
