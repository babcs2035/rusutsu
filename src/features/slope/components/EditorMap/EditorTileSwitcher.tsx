"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  GOOGLE_TILE_LAYERS,
  TILE_LAYER_ORDER,
  TILE_LAYERS,
} from "../../constants";
import type { TileLayerId } from "../../types";
import { isGoogleTileLayer } from "./editorTiles";

type Props = {
  layerId: TileLayerId;
  onLayerIdChange: (layerId: TileLayerId) => void;
  googleMapsApiKey: string | null;
  /** Google のセッションが取れなかった。地理院地図で代用している */
  googleUnavailable: boolean;
};

export function EditorTileSwitcher({
  layerId,
  onLayerIdChange,
  googleMapsApiKey,
  googleUnavailable,
}: Props) {
  return (
    <div className="absolute top-2.5 right-2.5 z-20 flex flex-col gap-1 rounded-md bg-white p-1.5 shadow-sm">
      <Select
        value={layerId}
        items={TILE_LAYER_ORDER.map(id => ({
          value: id,
          label: isGoogleTileLayer(id)
            ? GOOGLE_TILE_LAYERS[id].label
            : TILE_LAYERS[id as keyof typeof TILE_LAYERS].label,
        }))}
        onValueChange={value => onLayerIdChange(value as TileLayerId)}
      >
        <SelectTrigger
          aria-label="背景地図"
          className="min-h-11 max-w-40 text-sm md:hidden"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TILE_LAYER_ORDER.map(id => (
            <SelectItem
              key={id}
              value={id}
              disabled={isGoogleTileLayer(id) && !googleMapsApiKey}
            >
              {isGoogleTileLayer(id)
                ? GOOGLE_TILE_LAYERS[id].label
                : TILE_LAYERS[id as keyof typeof TILE_LAYERS].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="hidden flex-col gap-1 md:flex">
        {TILE_LAYER_ORDER.map(id => {
          const isGoogle = isGoogleTileLayer(id);
          const label = isGoogle
            ? GOOGLE_TILE_LAYERS[id].label
            : TILE_LAYERS[id as keyof typeof TILE_LAYERS].label;
          const disabled = isGoogle && !googleMapsApiKey;
          return (
            <Tooltip key={id}>
              <TooltipTrigger
                render={
                  <Button
                    size="sm"
                    variant={layerId === id ? "default" : "outline"}
                    disabled={disabled}
                    onClick={() => onLayerIdChange(id)}
                  >
                    {label}
                  </Button>
                }
              />
              <TooltipContent side="bottom">
                {disabled
                  ? "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY が未設定のため利用できません"
                  : undefined}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {googleUnavailable && (
        <p className="max-w-[140px] text-xs text-red-500">
          Google タイルを取得できませんでした。地理院地図で表示しています。
        </p>
      )}
    </div>
  );
}
