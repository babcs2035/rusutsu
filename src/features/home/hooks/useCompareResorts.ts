"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getResortMapDataForCompare,
  getSkiResortsForCompare,
} from "@/actions/skiResorts";
import {
  readDetailCache,
  writeDetailCache,
} from "@/features/map/session/detailCache";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import { reloadIfStaleBuild } from "@/shared/utils/staleBuild";
import type { SkiResortDetail } from "@/types/skiResorts";

const EMPTY_RESORTS: SkiResortDetail[] = [];
/** 詳細（地図抜き）は 1 回で何件取るか。最初の塊が早く返るよう小さめにする */
const DETAIL_CHUNK_SIZE = 8;
/** 地図データは 1 回で何件取るか。見えている分が早く返るよう小さめにする */
const MAP_CHUNK_SIZE = 4;

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
 */
export const useCompareResorts = (ids: string[], enabled: boolean) => {
  // 開いた直後（effect が走る前）に空表示を出さないよう、key ごとに持つ
  const [state, setState] = useState<{
    key: string;
    resorts: SkiResortDetail[];
    // 保存分・サーバー分とも取り終えた（または取れなかった）
    settled: boolean;
  }>({ key: "", resorts: [], settled: false });
  // まだ地図を取っていないスキー場。先頭から順に取る
  const pendingMapIdsRef = useRef<string[]>([]);
  const idsKey = ids.join(",");

  const prioritize = useCallback((priorityIds: string[]) => {
    const pending = pendingMapIdsRef.current;
    const wanted = priorityIds.filter(id => pending.includes(id));
    if (wanted.length === 0) return;
    pendingMapIdsRef.current = [
      ...wanted,
      ...pending.filter(id => !wanted.includes(id)),
    ];
  }, []);

  useEffect(() => {
    if (!enabled || !idsKey) {
      pendingMapIdsRef.current = [];
      return;
    }
    const targetIds = idsKey.split(",");
    let disposed = false;
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
            const details = await getSkiResortsForCompare(targetChunk);
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
          const result = await getResortMapDataForCompare(batch);
          if (disposed) return;
          for (const { id, finalizedMapData } of result) {
            mapStash.set(id, finalizedMapData);
            const entry = entries.get(id);
            if (entry) entries.set(id, { ...entry, finalizedMapData });
            save(id);
          }
          publish();
        } catch (error) {
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
      publish(true);
    };
    void run();

    return () => {
      disposed = true;
      pendingMapIdsRef.current = [];
    };
  }, [enabled, idsKey]);

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
