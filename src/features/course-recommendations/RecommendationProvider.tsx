"use client";
import { useSession } from "next-auth/react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useFavorites } from "@/features/favorites/FavoritesProvider";
import type { RecommendationIndexResult } from "./actions";
import { createResultCache } from "./cache";

type Cache = ReturnType<typeof createResultCache<RecommendationIndexResult>>;
async function loadIndex(resortId: string, guestFavorites: string[]) {
  const response = await fetch("/rusutsu/api/course-recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resortId, guestFavorites }),
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error("Recommendations unavailable");
  return (await response.json()) as RecommendationIndexResult;
}
const Context = createContext<{
  scope: string;
  store: Cache;
  ready: boolean;
} | null>(null);
export const useRecommendationCache = () => useContext(Context);

export function RecommendationProvider({ children }: { children: ReactNode }) {
  const favorites = useFavorites();
  const { data: session, status } = useSession();
  const scope = JSON.stringify([
    session?.user?.id ?? null,
    status,
    favorites?.ready,
    [...(favorites?.ids ?? [])].sort(),
  ]);
  // 同じアカウント・同じお気に入りに戻ったときは、前のキャッシュをそのまま使う。
  // 再同期でいったん別の scope を経由しても、取り直しにならないようにする。
  const caches = useRef(new Map<string, Cache>());
  const cache = useMemo(() => {
    const [, , ready, ids] = JSON.parse(scope);
    let store = caches.current.get(scope);
    if (!store) {
      if (caches.current.size >= 4)
        caches.current.delete(caches.current.keys().next().value as string);
      store = createResultCache(id => loadIndex(id, ids));
      caches.current.set(scope, store);
    }
    return { scope, ready: ready && ids.length > 0, store };
  }, [scope]);
  return <Context.Provider value={cache}>{children}</Context.Provider>;
}

export function usePrefetchRecommendations(resortIds: Array<string | null>) {
  const cache = useRecommendationCache();
  const key = JSON.stringify([
    ...new Set(resortIds.filter((id): id is string => !!id)),
  ]);
  useEffect(() => {
    if (!cache?.ready) return;
    // Begin after the detail has rendered and the browser has spare time.
    const start = () => {
      for (const id of JSON.parse(key))
        void cache.store.get(id).catch(() => {});
    };
    if ("requestIdleCallback" in window) {
      const idle = window.requestIdleCallback(start, { timeout: 500 });
      return () => window.cancelIdleCallback(idle);
    }
    const timer = setTimeout(start, 0);
    return () => clearTimeout(timer);
  }, [cache, key]);
}
