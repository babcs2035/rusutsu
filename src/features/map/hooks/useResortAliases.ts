"use client";

import { useEffect, useMemo, useState } from "react";
import { removeSkiResortWord } from "@/lib/resortAliases";
import type { MapSkiResort } from "@/types/skiResorts";

type ResortNameAliasesData = {
  resorts: Array<{
    id: string;
    shortName: string;
  }>;
};

let aliasByIdPromise: Promise<Map<string, string>> | null = null;

const loadAliasById = async (): Promise<Map<string, string>> => {
  if (aliasByIdPromise) {
    return aliasByIdPromise;
  }

  aliasByIdPromise = import("@/private/data/SkiResortNameAliases.json")
    .then(module => {
      const data = (module.default ?? module) as ResortNameAliasesData;
      const entries = data.resorts.map(
        resort => [resort.id, resort.shortName] as const,
      );
      return new Map<string, string>(entries);
    })
    .catch(() => new Map<string, string>());

  return aliasByIdPromise;
};

export const useResortAliases = (resorts: MapSkiResort[]) => {
  const [aliasById, setAliasById] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (resorts.length === 0) {
      return;
    }

    let cancelled = false;

    loadAliasById().then(map => {
      if (!cancelled) {
        setAliasById(map);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [resorts.length]);

  return useMemo(() => {
    const entries: Array<[string, string]> = resorts.map(resort => {
      const customAlias = aliasById.get(resort.id)?.trim();
      const baseName =
        customAlias && customAlias.length > 0 ? customAlias : resort.nameJa;
      const displayName = removeSkiResortWord(baseName);

      return [resort.id, displayName.length > 0 ? displayName : resort.nameJa];
    });

    return new Map<string, string>(entries);
  }, [aliasById, resorts]);
};
