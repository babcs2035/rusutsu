"use client";

import { type SetStateAction, useCallback, useState } from "react";
import type { z } from "zod";
import { readStorage, writeStorage } from "./storage";

/** 操作の時点で保存する。アンマウントや online イベントを待たない。 */
export function useScreenState<T>(
  key: string | null,
  schema: z.ZodType<T>,
  fallback: T,
) {
  const [entry, setEntry] = useState(() => ({
    key,
    value: (key ? readStorage(key, schema) : null) ?? fallback,
  }));
  const value =
    entry.key === key
      ? entry.value
      : ((key ? readStorage(key, schema) : null) ?? fallback);
  if (entry.key !== key) setEntry({ key, value });
  const setValue = useCallback(
    (action: SetStateAction<T>) => {
      setEntry(previous => {
        const before =
          previous.key === key
            ? previous.value
            : ((key ? readStorage(key, schema) : null) ?? fallback);
        const next =
          typeof action === "function"
            ? (action as (value: T) => T)(before)
            : action;
        if (key) writeStorage(key, next);
        if (previous.key === key && Object.is(previous.value, next))
          return previous;
        return { key, value: next };
      });
    },
    [key, schema, fallback],
  );
  return [value, setValue] as const;
}
