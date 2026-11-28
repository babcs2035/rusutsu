"use client";

import { Home, Layers } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { GSI_TILE_LAYERS, INITIAL_CENTER } from "../constants";
import type { MapTileVariant } from "../types";
import { MapCompassDial } from "./MapCompassDial";
import { getMapTopControlsOverlapHeight, getPanelOffset } from "./viewport";

// 現在地ボタン（MapLocationControl）と同じ大きさ・形
const MOBILE_SIDE_BUTTON_CLASS =
  "pointer-events-auto flex h-11 w-11 items-center justify-center rounded-md border bg-white text-gray-700 shadow-sm";

const CONTROL_BUTTON_CLASS =
  "flex h-10 w-10 items-center justify-center rounded-none bg-white p-0 text-2xl font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 min-w-0";
/** コース比較のような小さな地図では、地図を隠さないよう一回り小さくする */
const COMPACT_ZOOM_BUTTON_CLASS = "h-7 w-7 text-lg";
const COMPACT_DIAL_SIZE = 44;

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
  compact = false,
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
  compact?: boolean;
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

  const resetView = () => {
    onUserMapInteraction?.();
    map?.easeTo({
      center: [INITIAL_CENTER[1], INITIAL_CENTER[0]],
      zoom: initialZoom,
      offset: map
        ? getPanelOffset(0, 0, getMapTopControlsOverlapHeight(map))
        : undefined,
      duration: 0,
    });
  };

  const compassDial = (
    <Card className="gap-0 overflow-hidden rounded-full p-0">
      <CardContent className="p-0">
        <MapCompassDial
          map={map}
          bearing={bearing}
          size={compact ? COMPACT_DIAL_SIZE : undefined}
        />
      </CardContent>
    </Card>
  );

  const isMobileHome = showHomeButton && !compact;
  const isPhoto = mapTileVariant === "photo";

  return (
    <>
      {isMobileHome && (
        // スマホのホーム: 現在地ボタンの下に、同じ大きさでホームと地図の種類を縦に並べる
        <div className="pointer-events-none absolute right-3 top-[calc(var(--mobile-map-top-offset,0px)+0.75rem+3.25rem)] z-[750] flex flex-col gap-2 md:hidden">
          <button
            type="button"
            aria-label="地図をリセット"
            className={MOBILE_SIDE_BUTTON_CLASS}
            onClick={resetView}
          >
            <Home size={20} />
          </button>
          {showTileVariantControl && (
            <button
              type="button"
              aria-label={`${isPhoto ? "標準" : "航空写真"}に切り替え`}
              aria-pressed={isPhoto}
              className={cn(
                MOBILE_SIDE_BUTTON_CLASS,
                isPhoto && "border-blue-600 bg-blue-600 text-white",
              )}
              onClick={() => onMapTileVariantChange(isPhoto ? "pale" : "photo")}
            >
              <Layers size={20} />
            </button>
          )}
        </div>
      )}
      {/* 地図種別とホームは常に左下の同じ位置。ボトムシートの高さで
        動かすと押したい瞬間に位置が変わるので、オフセットは固定にする。 */}
      <div
        className={cn(
          "pointer-events-none absolute z-[750] flex flex-col gap-2 items-start",
          compact
            ? "bottom-2 left-2"
            : "left-4 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] md:bottom-4",
        )}
      >
        <div
          className={cn(
            "pointer-events-auto flex items-end",
            compact ? "gap-1.5" : "gap-2",
          )}
        >
          {/* 拡大縮小はデスクトップのみ。スマホはピンチ操作で行う */}
          <Card className="hidden md:flex gap-0 overflow-hidden p-0">
            <CardContent className="p-0">
              <Button
                onClick={() => {
                  map?.zoomIn();
                  window.setTimeout(() => onUserMapZoomInteraction?.(), 0);
                }}
                aria-label="地図を拡大"
                className={cn(
                  CONTROL_BUTTON_CLASS,
                  compact && COMPACT_ZOOM_BUTTON_CLASS,
                )}
              >
                +
              </Button>
              <Button
                onClick={() => {
                  map?.zoomOut();
                  window.setTimeout(() => onUserMapZoomInteraction?.(), 0);
                }}
                aria-label="地図を縮小"
                className={cn(
                  CONTROL_BUTTON_CLASS,
                  compact && COMPACT_ZOOM_BUTTON_CLASS,
                  "border-t border-gray-100",
                )}
              >
                -
              </Button>
            </CardContent>
          </Card>
          {canRotate && <div className="hidden md:block">{compassDial}</div>}
        </div>
        <div
          className={cn(
            "flex-row items-end gap-2 md:flex md:flex-col md:items-start",
            // スマホのホームでは右上（現在地の下）へ移す。左下は「N件を比較」が出る場所
            isMobileHome ? "hidden" : "flex",
          )}
        >
          {showHomeButton && (
            <Card className="pointer-events-auto gap-0 overflow-hidden p-0">
              <CardContent className="p-0">
                <Button
                  onClick={resetView}
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
    </>
  );
};
