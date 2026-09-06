"use client";

import { useMemo } from "react";
import { getResortLabelName } from "@/lib/resortAliases";
import type { MapSkiResort } from "@/types/skiResorts";

export const useResortAliases = (resorts: MapSkiResort[]) =>
  useMemo(
    () =>
      new Map(
        resorts.map(resort => [
          resort.id,
          getResortLabelName(resort.id, resort.nameJa, resort.shortName),
        ]),
      ),
    [resorts],
  );
