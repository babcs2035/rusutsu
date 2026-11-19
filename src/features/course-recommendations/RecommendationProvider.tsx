"use client";
import { useSession } from "next-auth/react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFavorites } from "@/features/favorites/FavoritesProvider";
import type { RecommendationIndexResult } from "./actions";
import { createResultCache } from "./cache";

type Cache = ReturnType<typeof createResultCache<RecommendationIndexResult>>;
export type RecommendationScope = "favorites" | "all";
const SCOPE_STORAGE_KEY = "rusutsu:similar-courses-scope:v1";
function readStoredScope(): RecommendationScope {
  try {
    return localStorage.getItem(SCOPE_STORAGE_KEY) === "all"
      ? "all"
      : "favorites";
  } catch {
    return "favorites";
  }
}
async function loadIndex(
  resortId: string,
  guestFavorites: string[],
  scope: RecommendationScope,
) {
  const response = await fetch("/rusutsu/api/course-recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resortId, guestFavorites, scope }),
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
  /** お気に入りがあるときだけ「お気に入り／全体」を選べる */
  hasFavorites: boolean;
  /** 実際に使う範囲。お気に入りが無ければ常に全体 */
  searchScope: RecommendationScope;
  setSearchScope: (scope: RecommendationScope) => void;
} | null>(null);
export const useRecommendationCache = () => useContext(Context);

export function RecommendationProvider({ children }: { children: ReactNode }) {
  const favorites = useFavorites();
  const { data: session, status } = useSession();
  const [chosenScope, setChosenScope] =
    useState<RecommendationScope>("favorites");
  // 保存した選択はマウント後に読む（サーバー描画と食い違わないように）
  useEffect(() => setChosenScope(readStoredScope()), []);
  const hasFavorites = (favorites?.ids.length ?? 0) > 0;
  const searchScope: RecommendationScope = hasFavorites ? chosenScope : "all";
  const scope = JSON.stringify([
    session?.user?.id ?? null,
    status,
    favorites?.ready,
    [...(favorites?.ids ?? [])].sort(),
    searchScope,
  ]);
  // 同じアカウント・同じお気に入りに戻ったときは、前のキャッシュをそのまま使う。
  // 再同期でいったん別の scope を経由しても、取り直しにならないようにする。
  const caches = useRef(new Map<string, Cache>());
  const cache = useMemo(() => {
    const [, , ready, ids, range] = JSON.parse(scope);
    let store = caches.current.get(scope);
    if (!store) {
      if (caches.current.size >= 4)
        caches.current.delete(caches.current.keys().next().value as string);
      store = createResultCache(id => loadIndex(id, ids, range));
      caches.current.set(scope, store);
    }
    return {
      scope,
      ready: !!ready,
      store,
      hasFavorites: ids.length > 0,
      searchScope: range as RecommendationScope,
      setSearchScope: (next: RecommendationScope) => {
        setChosenScope(next);
        try {
          localStorage.setItem(SCOPE_STORAGE_KEY, next);
        } catch {}
      },
    };
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
