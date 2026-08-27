"use client";

import type { ComponentType } from "react";
import { useMemo } from "react";
import type { JapanResortMapProps } from "@/features/map/types";
import type { MapSkiResort } from "@/types/skiResorts";
import type { Resort } from "./types";

/**
 * 比較の「アクセス」タブ。
 *
 * 位置関係は文字より地図の方が早いので、比較中のスキー場だけを出した地図にする。
 * 点をタップすると吹き出しが開き、Google マップの経路検索へ飛べる。
 */
export const CompareAccessTab = ({
  resorts,
  DynamicMap,
  mapResorts,
  onSelectResort,
  onToggleCompare,
}: {
  resorts: Resort[];
  DynamicMap: ComponentType<JapanResortMapProps>;
  mapResorts: MapSkiResort[];
  onSelectResort: (id: string) => void;
  onToggleCompare?: (id: string, selected: boolean) => void;
}) => {
  const compareIdSet = useMemo(
    () => new Set(resorts.map(resort => resort.id)),
    [resorts],
  );
  if (resorts.length === 0) {
    return (
      <p className="py-10 text-center text-sm font-semibold text-gray-500">
        比較するスキー場がありません。
      </p>
    );
  }

  return (
    <div className="h-full min-h-[24rem] w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
      <DynamicMap
        resorts={mapResorts}
        filteredResortIdSet={compareIdSet}
        isFilterActive
        selectedResortId={null}
        selectedCompareIdSet={compareIdSet}
        interactionMode="compare"
        onSelectResort={onSelectResort}
        onToggleCompare={onToggleCompare}
        onBoundsChange={() => undefined}
      />
    </div>
  );
};
