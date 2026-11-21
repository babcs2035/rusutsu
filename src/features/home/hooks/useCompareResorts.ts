"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readDetailCache,
  writeDetailCache,
} from "@/features/map/session/detailCache";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import {
  getResortMapDataForCompare,
  getSkiResortsForCompare,
} from "@/shared/queries/resorts";
import { reloadIfStaleBuild } from "@/shared/utils/staleBuild";
import type { SkiResortDetail } from "@/types/skiResorts";

const EMPTY_RESORTS: SkiResortDetail[] = [];
/** 詳細（地図抜き）は 1 回で何件取るか。最初の塊が早く返るよう小さめにする */
const DETAIL_CHUNK_SIZE = 8;
/** 地図データは 1 回で何件取るか。見えている分が早く返るよう小さめにする */
const MAP_CHUNK_SIZE = 4;
/**
 * 取り終えた比較データを、取り直さずに使い続ける時間。
 * 詳細を見て比較へ戻ったときや、同じ比較を開き直したときはこの間は通信しない。
 * 過ぎていたら、今の表示を出したまま裏で取り直して差し替える
 */
export const COMPARE_DATA_FRESH_MS = 10 * 60 * 1000;

/** 指定した比較対象の取得結果が10分未満かを判定する． */
export const isCompareDataFresh = (
  fetched: { key: string; at: number } | null,
  key: string,
): boolean =>
  fetched?.key === key && Date.now() - fetched.at < COMPARE_DATA_FRESH_MS;

/** オンライン復帰後に同じ比較の再取得を始められるかを判定する． */
export const shouldRetryCompareData = (
  fetched: { key: string; at: number } | null,
  key: string,
  online: boolean,
  activeKey: string | null,
): boolean => online && activeKey !== key && !isCompareDataFresh(fetched, key);

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
};

/**
 * 比較中のスキー場の詳細。
 *
 * 詳細（地図抜き）は小分けにして並列で取り、比較対象の全件が
 * 端末の保存分かサーバーから得られた（または取得失敗が確定した）時点で
 * 初めて 1 回だけ返す。途中経過は出さないので、件数が増えていく見え方にならない。
 * 取得に失敗した分は保存分があればそれを使い、無ければ除く。
 * 地図（コース・リフトの形）は別に裏で小分けに取り、詳細を返した後は届くたびに反映する。
 * 詳細より先に届いた地図は mapStash に溜める。地図は prioritize() で
 * 画面に見えているスキー場を先に取れるようにする。
 * isLoading は詳細の初回表示前まで true。オフライン時は保存分だけで確定する。
 * 詳細と地図がそろったスキー場は端末に保存し、次に開いたときに使う。
 * 取り終えてから COMPARE_DATA_FRESH_MS の間は取り直さない。
 * visible は比較が画面に出ているか（詳細の裏に残している間は false）。
 * 出たときに古くなっていれば取り直す。
 */
export const useCompareResorts = (
  ids: string[],
  enabled: boolean,
  visible = enabled,
) => {
  // 開いた直後（effect が走る前）に空表示を出さないよう、key ごとに持つ
  const [state, setState] = useState<{
    key: string;
    resorts: SkiResortDetail[];
    // 保存分・サーバー分とも取り終えた（または取れなかった）
    settled: boolean;
  }>({ key: "", resorts: [], settled: false });
  // まだ地図を取っていないスキー場。先頭から順に取る
  const pendingMapIdsRef = useRef<string[]>([]);
  // 最後に詳細と地図を取り終えた比較と時刻
  const fetchedRef = useRef<{ key: string; at: number } | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const idsKey = ids.join(",");

  // 詳細から比較へ戻ったときに古くなっていれば、裏で取り直す。
  // 比較を開き直したとき（enabled が変わったとき）は下の effect が取り直す
  const wasEnabledRef = useRef(enabled);
  useEffect(() => {
    const wasEnabled = wasEnabledRef.current;
    wasEnabledRef.current = enabled;
    if (!enabled || !wasEnabled || !visible || !idsKey) return;
    if (fetchedRef.current?.key !== idsKey) return;
    if (
      shouldRetryCompareData(
        fetchedRef.current,
        idsKey,
        navigator.onLine,
        activeKeyRef.current,
      )
    )
      setRefreshToken(token => token + 1);
  }, [enabled, visible, idsKey]);

  useEffect(() => {
    if (!enabled || !visible || !idsKey) return;
    const retryIfStale = () => {
      if (document.visibilityState !== "visible") return;
      if (
        !shouldRetryCompareData(
          fetchedRef.current,
          idsKey,
          navigator.onLine,
          activeKeyRef.current,
        )
      )
        return;
      setRefreshToken(token => token + 1);
    };
    window.addEventListener("online", retryIfStale);
    window.addEventListener("focus", retryIfStale);
    document.addEventListener("visibilitychange", retryIfStale);
    return () => {
      window.removeEventListener("online", retryIfStale);
      window.removeEventListener("focus", retryIfStale);
      document.removeEventListener("visibilitychange", retryIfStale);
    };
  }, [enabled, idsKey, visible]);

  const prioritize = useCallback((priorityIds: string[]) => {
    const pending = pendingMapIdsRef.current;
    const wanted = priorityIds.filter(id => pending.includes(id));
    if (wanted.length === 0) return;
    pendingMapIdsRef.current = [
      ...wanted,
      ...pending.filter(id => !wanted.includes(id)),
    ];
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken は古くなった比較を取り直す合図
  useEffect(() => {
    if (!enabled || !idsKey) {
      pendingMapIdsRef.current = [];
      return;
    }
    // 同じ比較を取り終えて間もないなら、手元の表示をそのまま使う
    if (isCompareDataFresh(fetchedRef.current, idsKey)) return;
    const targetIds = idsKey.split(",");
    activeKeyRef.current = idsKey;
    const requests = new AbortController();
    let disposed = false;
    let failed = false;
    let staleReload = false;
    // 詳細が出そろうまで publish しない
    let detailsReady = false;
    const entries = new Map<string, SkiResortDetail>();
    // 詳細より先に届いた地図。詳細が届いたときに合わせる
    const mapStash = new Map<string, FinalizedResortMapData | null>();
    const publish = (settled = false) => {
      if (disposed || (!detailsReady && !settled)) return;
      setState({
        key: idsKey,
        resorts: targetIds.flatMap(id => entries.get(id) ?? []),
        settled,
      });
    };
    const save = (id: string) => {
      const entry = entries.get(id);
      if (entry && mapStash.has(id))
        void writeDetailCache(entry, { compared: true });
    };

    // 全 chunk を並列に取り、出そろってから 1 回だけ返す
    const loadDetails = async () => {
      await Promise.all(
        chunk(targetIds, DETAIL_CHUNK_SIZE).map(async targetChunk => {
          try {
            const details = await getSkiResortsForCompare(
              targetChunk,
              requests.signal,
            );
            if (disposed) return;
            for (const detail of details) {
              entries.set(detail.id, {
                ...detail,
                finalizedMapData:
                  mapStash.get(detail.id) ??
                  entries.get(detail.id)?.finalizedMapData ??
                  null,
              });
              save(detail.id);
            }
          } catch (error) {
            if (disposed) return;
            failed = true;
            if (reloadIfStaleBuild(error)) {
              staleReload = true;
              return;
            }
            /* 保存してある分があればそれを使い続ける */
          }
        }),
      );
    };

    const loadMaps = async () => {
      while (!disposed && pendingMapIdsRef.current.length > 0) {
        const batch = pendingMapIdsRef.current.slice(0, MAP_CHUNK_SIZE);
        pendingMapIdsRef.current =
          pendingMapIdsRef.current.slice(MAP_CHUNK_SIZE);
        try {
          const result = await getResortMapDataForCompare(
            batch,
            requests.signal,
          );
          if (disposed) return;
          for (const { id, finalizedMapData } of result) {
            mapStash.set(id, finalizedMapData);
            const entry = entries.get(id);
            if (entry) entries.set(id, { ...entry, finalizedMapData });
            save(id);
          }
          publish();
        } catch (error) {
          if (disposed) return;
          failed = true;
          if (reloadIfStaleBuild(error)) return;
          /* 取れなかった分は次に開いたときに取り直す */
        }
      }
    };

    const run = async () => {
      const cached = await Promise.all(targetIds.map(readDetailCache));
      if (disposed) return;
      cached.forEach((entry, index) => {
        if (entry) entries.set(targetIds[index], entry);
      });
      if (!navigator.onLine) {
        detailsReady = true;
        fetchedRef.current = { key: idsKey, at: -Infinity };
        publish(true);
        return;
      }
      pendingMapIdsRef.current = [...targetIds];
      const maps = loadMaps();
      await loadDetails();
      if (disposed || staleReload) return;
      detailsReady = true;
      publish();
      await maps;
      if (disposed) return;
      fetchedRef.current = {
        key: idsKey,
        at: failed ? -Infinity : Date.now(),
      };
      publish(true);
    };
    void run().finally(() => {
      if (!disposed) activeKeyRef.current = null;
    });

    return () => {
      disposed = true;
      if (activeKeyRef.current === idsKey) activeKeyRef.current = null;
      requests.abort();
      pendingMapIdsRef.current = [];
    };
  }, [enabled, idsKey, refreshToken]);

  const resorts =
    enabled && state.key === idsKey ? state.resorts : EMPTY_RESORTS;
  // 保存分もサーバーからの分もまだ 1 件もないとき
  const isLoading =
    enabled &&
    idsKey !== "" &&
    resorts.length === 0 &&
    !(state.key === idsKey && state.settled);
  return { resorts, isLoading, prioritize };
};
