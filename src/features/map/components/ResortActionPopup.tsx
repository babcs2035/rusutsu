"use client";

import { Check, Plus } from "lucide-react";
import { Popup } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MapSkiResort } from "@/types/skiResorts";

type Props = {
  resort: MapSkiResort;
  isCompareSelected: boolean;
  onClose: () => void;
  onSelectResort: (id: string) => void;
  onToggleCompare?: (id: string, selected: boolean) => void;
};

export const ResortActionPopup = ({
  resort,
  isCompareSelected,
  onClose,
  onSelectResort,
  onToggleCompare,
}: Props) => (
  <Popup
    position={[resort.latitude, resort.longitude]}
    closeButton={false}
    autoPan={false}
    eventHandlers={{ remove: onClose }}
  >
    <div className="flex flex-col gap-2 min-w-[190px]">
      <p className="text-gray-900 text-sm font-bold leading-snug font-[var(--font-heading)]">
        {resort.nameJa}
      </p>
      <div className="flex gap-2">
        <Button
          size="xs"
          className="flex-[1_1_0] min-w-0 font-bold"
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
              "flex-[1_1_0] min-w-0 font-bold gap-1",
              isCompareSelected
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-blue-600 border-blue-600",
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
    </div>
  </Popup>
);
