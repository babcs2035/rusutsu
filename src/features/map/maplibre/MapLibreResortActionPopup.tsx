"use client";

import { Check, MapPin, Navigation, Plus } from "lucide-react";
import { type Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import {
  getGoogleMapsDirectionsUrl,
  getGoogleMapsUrl,
} from "@/shared/utils/mapLinks";
import type { MapSkiResort } from "@/types/skiResorts";

/**
 * 比較モードでスキー場の点をタップしたときに開く吹き出し。
 *
 * MapLibre には React で中身を差せる Popup がないので、Marker の要素へ
 * ポータルで描く。位置の追従は Marker 側に任せられる。
 */
export const MapLibreResortActionPopup = ({
  map,
  resort,
  isCompareSelected,
  onClose,
  onSelectResort,
  onToggleCompare,
}: {
  map: MapLibreMap | null;
  resort: MapSkiResort;
  isCompareSelected: boolean;
  onClose: () => void;
  onSelectResort: (id: string) => void;
  onToggleCompare?: (id: string, selected: boolean) => void;
}) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!map) return;

    const element = document.createElement("div");
    element.className = "resort-action-popup";
    element.style.zIndex = "1000";
    // 吹き出しの中のクリックで地図の「空白をクリック」扱いにならないようにする
    element.addEventListener("click", event => event.stopPropagation());

    const marker = new Marker({ element, anchor: "bottom", offset: [0, -14] })
      .setLngLat([resort.longitude, resort.latitude])
      .addTo(map);
    setContainer(element);

    return () => {
      marker.remove();
      setContainer(null);
    };
  }, [map, resort.latitude, resort.longitude]);

  useEffect(() => {
    if (!map) return;

    const handleMapClick = () => onClose();
    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [map, onClose]);

  if (!container) return null;

  const googleMapsUrl = getGoogleMapsUrl(resort);
  const directionsUrl = getGoogleMapsDirectionsUrl(resort);

  return createPortal(
    <div className="flex min-w-[190px] flex-col gap-2">
      <p className="font-[var(--font-heading)] text-sm font-bold leading-snug text-gray-900">
        {resort.nameJa}
      </p>
      {(googleMapsUrl || directionsUrl) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {directionsUrl && (
            <ExternalLinkComponent
              href={directionsUrl}
              className="gap-1 text-xs font-semibold text-green-700 hover:underline"
            >
              <Navigation size={13} strokeWidth={2.5} />
              経路を調べる
            </ExternalLinkComponent>
          )}
          {googleMapsUrl && (
            <ExternalLinkComponent
              href={googleMapsUrl}
              className="gap-1 text-xs font-semibold text-blue-700 hover:underline"
            >
              <MapPin size={13} strokeWidth={2.5} />
              Google マップ
            </ExternalLinkComponent>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <Button
          size="xs"
          className="min-w-0 flex-[1_1_0] font-bold"
          variant="outline"
          onClick={() => {
            onSelectResort(resort.id);
            onClose();
          }}
        >
          詳細を見る
        </Button>
        {onToggleCompare && (
          <Button
            size="xs"
            variant="outline"
            className={cn(
              "min-w-0 flex-[1_1_0] gap-1 font-bold",
              isCompareSelected
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-blue-600 bg-white text-blue-600",
            )}
            aria-pressed={isCompareSelected}
            onClick={() => {
              onToggleCompare(resort.id, !isCompareSelected);
              onClose();
            }}
          >
            {isCompareSelected ? (
              <Check size={14} strokeWidth={3} />
            ) : (
              <Plus size={14} strokeWidth={3} />
            )}
            {isCompareSelected ? "比較から外す" : "比較に追加"}
          </Button>
        )}
      </div>
    </div>,
    container,
  );
};
