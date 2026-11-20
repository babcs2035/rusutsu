"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { calculateLiftTicketAndRentalForList } from "@/actions/skiResorts";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import type { ResortPriceSummary } from "@/features/lift-ticket/utils/resortPriceCalculation";
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
    // 一覧が見えていない間は計算しない。サーバーアクションは1件ずつ順に
    // 処理されるので、裏で計算すると詳細や投稿の読み込みを待たせる。
    if (requestKey === null || paused) return;
    // 見えない間に止めていた一覧へ戻ったとき、同じ条件の結果があれば使い回す
    if (stateRef.current?.key === requestKey) return;
    const { ids, input: requestInput } = JSON.parse(requestKey) as {
      ids: string[];
      input: LiftTicketSearchInput;
    };
    let cancelled = false;
    calculateLiftTicketAndRentalForList(ids, requestInput)
      .then(results => {
        if (!cancelled)
          setState({ key: requestKey, value: { status: "done", results } });
      })
      .catch(() => {
        if (!cancelled)
          setState({ key: requestKey, value: { status: "error" } });
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, paused]);

  if (!input.visitDate) return { status: "idle" };
  // 日程は入っているが料金データのあるスキー場が一覧に無いときは、
  // 「日程を設定」ではなく各行を「不明」にする
  if (requestKey === null) return { status: "done", results: {} };
  return state?.key === requestKey ? state.value : { status: "loading" };
};
