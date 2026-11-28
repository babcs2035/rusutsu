"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import type { ResortPriceSummary } from "@/features/lift-ticket/utils/resortPriceCalculation";
import { calculateLiftTicketAndRentalForList } from "@/shared/queries/resorts";
import type { MapSkiResort } from "@/types/skiResorts";

export type ListLiftTicketResults =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "done";
      results: Record<string, ResortPriceSummary>;
    };

/**
 * 日付が入ったときだけ、一覧にある料金データ付きスキー場の料金をサーバーで
 * 計算して受け取る。料金データ本体はブラウザへ送らない。
 * 一覧・地図のラベル・予算の絞り込みが同じ結果を使う。
 */
export const useListLiftTicketResults = (
  resorts: MapSkiResort[],
  input: LiftTicketSearchInput,
  paused: boolean,
): ListLiftTicketResults => {
  const requestKey = useMemo(() => {
    const ids = [
      ...new Set(
        resorts.flatMap(resort =>
          resort.liftTicketResortId ? [resort.liftTicketResortId] : [],
        ),
      ),
    ].sort();
    return input.visitDate && ids.length > 0
      ? JSON.stringify({ ids, input })
      : null;
  }, [resorts, input]);
  const [state, setState] = useState<{
    key: string;
    value: ListLiftTicketResults;
  } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    // 料金を表示しない間は，料金計算に必要な通信とサーバー負荷を抑える．
    if (requestKey === null || paused) return;
    // 見えない間に止めていた一覧へ戻ったとき、成功済みの結果は使い回す。
    if (
      stateRef.current?.key === requestKey &&
      stateRef.current.value.status === "done"
    )
      return;
    const { ids, input: requestInput } = JSON.parse(requestKey) as {
      ids: string[];
      input: LiftTicketSearchInput;
    };
    let cancelled = false;
    let loading = false;
    const load = (): void => {
      const previous = stateRef.current;
      if (
        loading ||
        (previous?.key === requestKey && previous.value.status === "done")
      )
        return;
      loading = true;
      void calculateLiftTicketAndRentalForList(ids, requestInput)
        .then(results => {
          if (cancelled) return;
          const next = {
            key: requestKey,
            value: { status: "done", results },
          } as const;
          stateRef.current = next;
          setState(next);
        })
        .catch(() => {
          if (cancelled) return;
          const next = { key: requestKey, value: { status: "error" } } as const;
          stateRef.current = next;
          setState(next);
        })
        .finally(() => {
          loading = false;
        });
    };
    window.addEventListener("online", load);
    load();
    return () => {
      cancelled = true;
      window.removeEventListener("online", load);
    };
  }, [requestKey, paused]);

  if (!input.visitDate) return { status: "idle" };
  // 日程は入っているが料金データのあるスキー場が一覧に無いときは、
  // 「日程を設定」ではなく各行を「不明」にする
  if (requestKey === null) return { status: "done", results: {} };
  return state?.key === requestKey ? state.value : { status: "loading" };
};
