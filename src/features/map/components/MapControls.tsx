"use client";

import { Home } from "lucide-react";
import { useMap } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SegmentedControl } from "@/shared/components/SegmentedControl";
import { GSI_TILE_LAYERS, INITIAL_CENTER } from "../constants";
import type { MapTileVariant } from "../types";

/**
 * ズーム操作。
 * スマホではピンチで足りるので +/- は出さない。ホームボタンは全国マップだけ。
 */
export const MapControls = ({
  initialZoom,
  mapTileVariant,
  onMapTileVariantChange,
  showTileVariantControl,
  showHomeButton,
  onUserMapInteraction,
  onUserMapZoomInteraction,
}: {
  initialZoom: number;
  mapTileVariant: MapTileVariant;
  onMapTileVariantChange: (variant: MapTileVariant) => void;
  /** コースマップのツールバー側に地図/写真がある場合は false */
  showTileVariantControl: boolean;
  showHomeButton: boolean;
  onUserMapInteraction?: () => void;
  onUserMapZoomInteraction?: () => void;
}) => {
  const map = useMap();

  return (
    // 地図種別とホームは常に左下の同じ位置。ボトムシートの高さで
    // 動かすと押したい瞬間に位置が変わるので、オフセットは固定にする。
    <div className="absolute z-[750] flex flex-col gap-2 items-start left-4 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] md:bottom-4">
      {/* 拡大縮小はデスクトップのみ。スマホはピンチ操作で行う */}
      <Card className="hidden md:flex gap-0 overflow-hidden p-0">
        <CardContent className="p-0">
          <Button
            onClick={() => {
              map.zoomIn();
              window.setTimeout(() => onUserMapZoomInteraction?.(), 0);
            }}
            aria-label="地図を拡大"
            className="flex h-10 w-10 items-center justify-center rounded-none bg-white p-0 text-2xl font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 min-w-0"
          >
            +
          </Button>
          <Button
            onClick={() => {
              map.zoomOut();
              window.setTimeout(() => onUserMapZoomInteraction?.(), 0);
            }}
            aria-label="地図を縮小"
            className="flex h-10 w-10 items-center justify-center rounded-none border-t border-gray-100 bg-white p-0 text-2xl font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 min-w-0"
          >
            -
          </Button>
        </CardContent>
      </Card>
      <div className="flex flex-row items-end gap-2 md:flex-col md:items-start">
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
          // 詳細ビュー（FinalizedMapToolbar）・設定ダイアログと同じ
          // SegmentedControl に統一し、選択中/未選択中の見た目を揃える
          <SegmentedControl
            options={Object.entries(GSI_TILE_LAYERS).map(([value, layer]) => ({
              value: value as MapTileVariant,
              label: layer.label,
            }))}
            value={mapTileVariant}
            onChange={onMapTileVariantChange}
            itemClassName="h-8 px-3 text-xs"
            ariaLabel={option => `${option.label}に切り替え`}
          />
        )}
      </div>
    </div>
  );
};
