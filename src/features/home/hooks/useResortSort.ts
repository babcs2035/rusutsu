"use client";

import { useMemo, useState } from "react";
import { useMapSession } from "@/features/map/session/MapSessionProvider";
import type { MapSkiResort } from "@/types/skiResorts";
import { type ResortSortOrder, sortResorts } from "../utils/sortResorts";

export type ResortSortControls = {
  order: ResortSortOrder;
  onOrderChange: (order: ResortSortOrder) => void;
  locating: boolean;
  locationError: string | null;
};

export function useResortSort(resorts: MapSkiResort[]) {
  const [order, setOrder] = useState<ResortSortOrder>("name");
  const location = useMapSession();
  const position = location?.position ?? null;
  const sortedResorts = useMemo(
    () => sortResorts(resorts, order, position),
    [resorts, order, position],
  );
  const controls: ResortSortControls = {
    order,
    onOrderChange: next => {
      setOrder(next);
      if (next === "distance" && !position && !location?.loading) {
        location?.request();
      }
    },
    locating: order === "distance" && Boolean(location?.loading),
    locationError: order === "distance" ? (location?.error ?? null) : null,
  };
  return { sortedResorts, controls };
}
