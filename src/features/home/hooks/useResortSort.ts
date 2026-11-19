"use client";

import { useMemo, useState } from "react";
import { useMapSession } from "@/features/map/session/MapSessionProvider";
import type { MapSkiResort } from "@/types/skiResorts";
import {
  type PrefectureInnerOrder,
  type ResortSortOrder,
  type SortPosition,
  sortResorts,
} from "../utils/sortResorts";

export type ResortSortControls = {
  order: ResortSortOrder;
  onOrderChange: (order: ResortSortOrder) => void;
  /** 都道府県別のときの県内の並び */
  prefectureOrder: PrefectureInnerOrder;
  onPrefectureOrderChange: (order: PrefectureInnerOrder) => void;
  locating: boolean;
  locationError: string | null;
  /** 近い順のときの現在地。一覧に距離を出すのに使う */
  distanceFrom: SortPosition | null;
};

export function useResortSort(resorts: MapSkiResort[]) {
  const [order, setOrder] = useState<ResortSortOrder>("prefecture");
  const [prefectureOrder, setPrefectureOrder] =
    useState<PrefectureInnerOrder>("distance");
  const location = useMapSession();
  const position = location?.position ?? null;
  const sortedResorts = useMemo(
    () => sortResorts(resorts, order, position, prefectureOrder),
    [resorts, order, position, prefectureOrder],
  );
  const controls: ResortSortControls = {
    order,
    onOrderChange: next => {
      setOrder(next);
      if (next === "distance" && !position && !location?.loading) {
        location?.request();
      }
    },
    prefectureOrder,
    onPrefectureOrderChange: setPrefectureOrder,
    locating: order === "distance" && Boolean(location?.loading),
    locationError: order === "distance" ? (location?.error ?? null) : null,
    distanceFrom: order === "distance" ? position : null,
  };
  return { sortedResorts, controls };
}
