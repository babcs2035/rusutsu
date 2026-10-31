"use client";

import { useEffect, useSyncExternalStore } from "react";
import { highlightCommunityPost } from "./composerEvents";
import {
  type ActionResult,
  type CommunityMapSummary,
  ENTRY_KINDS,
  type PublicMapEntry,
} from "./contract";
import {
  type CommunityPeriod,
  chooseCommunityPeriod,
  getPeriodStart,
  todayInJapan,
} from "./mapOverlay";

export const ALL_COMMUNITY_KINDS = Object.keys(
  ENTRY_KINDS,
) as PublicMapEntry["kind"][];
type EntryPage = {
  entries: PublicMapEntry[];
  loading: boolean;
  error: string | null;
  updatedAt: number;
};
type LayerState = {
  enabled: boolean;
  period: CommunityPeriod | null;
  kinds: PublicMapEntry["kind"][];
  summary: CommunityMapSummary | null;
  summaryLoading: boolean;
  summaryError: string | null;
  updatedAt: number;
  pages: Partial<Record<CommunityPeriod, EntryPage>>;
};
const emptyState: LayerState = {
  enabled: false,
  period: null,
  kinds: ALL_COMMUNITY_KINDS,
  summary: null,
  summaryLoading: false,
  summaryError: null,
  updatedAt: 0,
  pages: {},
};
const states = new Map<string, LayerState>();
const emptyEntries: PublicMapEntry[] = [];
const listeners = new Set<() => void>();
const requests = new Map<string, object>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const stateFor = (id: string) => states.get(id) ?? emptyState;
async function readMap<T>(
  query: Record<string, string | undefined>,
): Promise<ActionResult<T>> {
  const params = new URLSearchParams(
    Object.entries(query).filter(
      (pair): pair is [string, string] => pair[1] !== undefined,
    ),
  );
  const response = await fetch(`/rusutsu/api/community/map?${params}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("投稿を読み込めませんでした。");
  return response.json();
}
function update(id: string, apply: (state: LayerState) => LayerState) {
  states.set(id, apply(stateFor(id)));
  for (const listener of listeners) listener();
}

async function loadSummary(id: string, force = false) {
  const key = `${id}:summary`;
  if (
    requests.has(key) ||
    (!force && Date.now() - stateFor(id).updatedAt < 60_000)
  )
    return;
  const token = {};
  requests.set(key, token);
  update(id, state => ({ ...state, summaryLoading: true, summaryError: null }));
  try {
    const result = await readMap<CommunityMapSummary>({
      resortId: id,
      summary: "1",
    });
    if (!result.ok) throw new Error(result.error);
    if (requests.get(key) !== token) return;
    update(id, state => ({
      ...state,
      summary: result.data,
      enabled: result.data.total > 0 && state.enabled,
      summaryLoading: false,
      updatedAt: Date.now(),
      period:
        state.period ?? chooseCommunityPeriod(result.data.latestObservedOn),
    }));
  } catch {
    if (requests.get(key) === token)
      update(id, state => ({
        ...state,
        summaryLoading: false,
        summaryError: "投稿を読み込めませんでした。",
      }));
  } finally {
    if (requests.get(key) === token) requests.delete(key);
  }
}

async function loadEntries(id: string, period: CommunityPeriod, force = false) {
  const key = `${id}:${period}`;
  if (requests.has(key)) return;
  const cached = stateFor(id).pages[period];
  if (
    !force &&
    cached &&
    (cached.error || Date.now() - cached.updatedAt < 60_000)
  )
    return;
  const token = {};
  requests.set(key, token);
  const write = (page: EntryPage) => {
    if (requests.get(key) === token)
      update(id, state => ({
        ...state,
        pages: { ...state.pages, [period]: page },
      }));
  };
  let entries: PublicMapEntry[] = [];
  write({ entries, loading: true, error: null, updatedAt: 0 });
  try {
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const result = await readMap<{
        entries: PublicMapEntry[];
        nextCursor: string | null;
      }>({
        resortId: id,
        from: getPeriodStart(period),
        to: todayInJapan(),
        cursor,
      });
      if (requests.get(key) !== token) return;
      if (!result.ok) throw new Error(result.error);
      entries = [...entries, ...result.data.entries];
      cursor = result.data.nextCursor ?? undefined;
      if (cursor && seen.has(cursor))
        throw new Error("投稿の続きを読み込めませんでした。");
      if (cursor) seen.add(cursor);
      write({ entries, loading: !!cursor, error: null, updatedAt: Date.now() });
    } while (cursor);
  } catch {
    write({
      entries,
      loading: false,
      error: "投稿を読み込めませんでした。",
      updatedAt: 0,
    });
  } finally {
    if (requests.get(key) === token) requests.delete(key);
  }
}

/** 小さい地図と拡大地図で、選択状態・取得済みの投稿・取得中のリクエストを共有する。 */
export function useCommunityMapLayer(
  resortId: string | null | undefined,
  active: boolean,
) {
  const state = useSyncExternalStore(
    subscribe,
    () => (resortId ? stateFor(resortId) : emptyState),
    () => emptyState,
  );
  const period = state.period ?? "7d";
  const available = !state.summaryError && (state.summary?.total ?? 0) > 0;
  const page = state.pages[period];
  useEffect(() => {
    if (resortId && active) void loadSummary(resortId);
  }, [resortId, active]);
  useEffect(() => {
    if (
      resortId &&
      active &&
      state.enabled &&
      state.period &&
      (!page ||
        (!page.error && !page.loading && Date.now() - page.updatedAt >= 60_000))
    )
      void loadEntries(resortId, state.period);
  }, [resortId, active, state.enabled, state.period, page]);
  return {
    ...state,
    enabled: state.enabled && available,
    period,
    entries: page?.entries ?? emptyEntries,
    loading:
      state.summaryLoading ||
      (state.enabled &&
        !state.summaryError &&
        (!state.period || !page || page.loading)),
    error: state.summaryError ?? page?.error ?? null,
    available,
    setEnabled: (enabled: boolean) => {
      if (resortId)
        update(resortId, value => ({
          ...value,
          enabled:
            enabled && !value.summaryError && (value.summary?.total ?? 0) > 0,
        }));
    },
    setPeriod: (next: CommunityPeriod) => {
      if (resortId) update(resortId, value => ({ ...value, period: next }));
    },
    setKinds: (kinds: PublicMapEntry["kind"][]) => {
      if (resortId) update(resortId, value => ({ ...value, kinds }));
    },
    retry: () => {
      if (!resortId) return;
      if (state.summaryError) void loadSummary(resortId, true);
      else void loadEntries(resortId, period, true);
    },
  };
}

/** 投稿直後は、期間の手動選択を維持したまま一覧と有無を読み直す。 */
export function rememberCommunityPost(resortId: string) {
  for (const key of requests.keys())
    if (key.startsWith(`${resortId}:`)) requests.delete(key);
  update(resortId, state => ({
    ...state,
    summary: null,
    pages: {},
    updatedAt: 0,
  }));
  void loadSummary(resortId, true);
}

/**
 * 地図で開いた投稿。スキー場詳細はコースを選んだときと同じ場所
 * （スマホは地図の下、PCは右パネル）に出す。詳細が出ていない地図では、
 * 地図の上に重ねて出す。
 */
export type OpenCommunityPosts = { key: string; posts: PublicMapEntry[] };
const openPosts = new Map<string, OpenCommunityPosts>();
const postHosts = new Map<string, number>();

export function openCommunityMapPosts(
  resortId: string,
  open: OpenCommunityPosts | null,
) {
  if (!open && !openPosts.has(resortId)) return;
  if (open) openPosts.set(resortId, open);
  else {
    openPosts.delete(resortId);
    highlightCommunityPost(resortId, null);
  }
  for (const listener of listeners) listener();
}

/** 一覧から1件を選んだときに、対象のコース・リフトと地点を地図で強調する。 */
export function highlightCommunityMapEntry(
  resortId: string,
  entry: PublicMapEntry,
) {
  highlightCommunityPost(resortId, {
    kind: entry.kind,
    feature:
      entry.kind === "LIFT" && entry.liftId
        ? { kind: "lift", id: entry.liftId }
        : entry.courseId
          ? { kind: "course", id: entry.courseId }
          : null,
    point:
      entry.latitude != null && entry.longitude != null
        ? [entry.longitude, entry.latitude]
        : null,
  });
}

export function useOpenCommunityMapPosts(resortId: string | null | undefined) {
  const open = useSyncExternalStore(
    subscribe,
    () => (resortId ? (openPosts.get(resortId) ?? null) : null),
    () => null,
  );
  const hosted = useSyncExternalStore(
    subscribe,
    () => (resortId ? (postHosts.get(resortId) ?? 0) > 0 : false),
    () => false,
  );
  return { open, hosted };
}

/** 開いた投稿を自分のパネルに出す画面（スキー場詳細）が表示中であることを知らせる。 */
export function useCommunityMapPostHost(
  resortId: string | null | undefined,
  active: boolean,
) {
  useEffect(() => {
    if (!resortId || !active) return;
    postHosts.set(resortId, (postHosts.get(resortId) ?? 0) + 1);
    for (const listener of listeners) listener();
    return () => {
      const count = (postHosts.get(resortId) ?? 1) - 1;
      if (count > 0) postHosts.set(resortId, count);
      else postHosts.delete(resortId);
      for (const listener of listeners) listener();
    };
  }, [resortId, active]);
}
