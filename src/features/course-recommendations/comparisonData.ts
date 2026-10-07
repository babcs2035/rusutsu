"use client";

import { getSkiResortById } from "@/actions/skiResorts";
import { readDetailCache } from "@/features/map/session/detailCache";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";

/**
 * 比較先スキー場の地図データ。
 * 比較を開き直したり、詳細ボタンに触れた時点で先に読み始めたりしても
 * 1 回の取得で済むよう、ページを開いている間は結果を使い回す。
 */
const loads = new Map<string, Promise<FinalizedResortMapData | null>>();

export function loadComparisonMapData(
  resortId: string,
  { fresh = false }: { fresh?: boolean } = {},
) {
  const previous = loads.get(resortId);
  if (previous && !fresh) return previous;
  if (loads.size >= 10 && !loads.has(resortId))
    loads.delete(loads.keys().next().value as string);
  const promise = (async () => {
    const data =
      (fresh ? null : await readDetailCache(resortId)) ??
      (await getSkiResortById(resortId));
    return data?.finalizedMapData ?? null;
  })();
  loads.set(resortId, promise);
  promise.catch(() => {
    if (loads.get(resortId) === promise) loads.delete(resortId);
  });
  return promise;
}

export function prefetchComparisonMapData(resortId: string) {
  void loadComparisonMapData(resortId).catch(() => {});
}
