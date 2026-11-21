// 詳細・比較の料金計算を取得し，通信できないときは端末にある料金で計算する．
"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { withBasePath } from "@/shared/utils/basePath";
import {
  type LiftTicketData,
  type LiftTicketSearchInput,
  TICKET_PLAN_BATCH_SIZE,
} from "../types";
import {
  calculateTicketPlanDisplay,
  type TicketPlanDisplay,
} from "../utils/resortPriceCalculation";

type Entry = {
  resortId: string;
  categoryKey?: string;
  seasons: LiftTicketData[];
};
type Result = { key: string; plans: TicketPlanDisplay[] | null };
const requestTimeoutMs = 12_000;

/** 大きい比較リストも，API の上限内で順序を維持して取得する． */
async function fetchPlans(
  key: string,
  signal: AbortSignal,
): Promise<TicketPlanDisplay[]> {
  const { targets, input } = JSON.parse(key) as {
    targets: Pick<Entry, "resortId" | "categoryKey">[];
    input: LiftTicketSearchInput;
  };
  const plans: TicketPlanDisplay[] = [];
  for (let index = 0; index < targets.length; index += TICKET_PLAN_BATCH_SIZE) {
    const batch = targets.slice(index, index + TICKET_PLAN_BATCH_SIZE);
    const response = await fetch(withBasePath("/api/resorts/ticket-plans"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: batch, input }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("料金を取得できませんでした。");
    const results: TicketPlanDisplay[] = await response.json();
    if (!Array.isArray(results) || results.length !== batch.length)
      throw new Error("料金の応答が不正です。");
    plans.push(...results);
  }
  return plans;
}

/** ブラウザーの接続状態を購読する． */
function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** 遅れて届く条件違いの応答を使わず，同じ条件でオフラインにも対応する． */
export function useTicketPlans(
  entries: readonly Entry[],
  input: LiftTicketSearchInput,
): TicketPlanDisplay[] | null {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const key = entries.length
    ? JSON.stringify({
        targets: entries.map(({ resortId, categoryKey }) => ({
          resortId,
          categoryKey,
        })),
        input,
      })
    : "";
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    if (!online || !key) return;
    const request = new AbortController();
    void fetchPlans(key, request.signal)
      .then(plans => {
        if (!request.signal.aborted) setResult({ key, plans });
      })
      .catch(() => {
        if (!request.signal.aborted) setResult({ key, plans: null });
      });
    return () => request.abort();
  }, [key, online]);
  const fallback = !online || (result?.key === key && result.plans === null);
  const offlinePlans = useMemo(
    () =>
      fallback
        ? entries.map(({ seasons, categoryKey }) =>
            calculateTicketPlanDisplay(seasons, input, Boolean(categoryKey)),
          )
        : null,
    [entries, fallback, input],
  );
  if (!key) return [];
  if (fallback) return offlinePlans;
  return result?.key === key ? result.plans : null;
}
