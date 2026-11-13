"use client";

import { useEffect, useMemo, useState } from "react";
import { getResortLinkLists } from "@/actions/skiResorts";
import type { Resort } from "@/features/resort-detail/types";
import { detailLinkItems } from "./detailItems";
import {
  groupResortLinks,
  type ResortLinkGroupView,
  type ResortLinkItem,
} from "./model";

// タブを開き直すたびに読み直さないよう、読んだ結果を覚えておく
const loadedLinks = new Map<string, ResortLinkItem[]>();
const pendingLinks = new Map<string, Promise<void>>();
const MAX_REMEMBERED_RESORTS = 30;
/** 1回の問い合わせで読むスキー場の数（getResortLinkLists の上限と同じ） */
const REQUEST_CHUNK_SIZE = 8;

type Target = { resort: Resort; ids: string[]; key: string };

export type ResortLinkGroupsEntry = {
  resort: Resort;
  /** 読み込み中は true（groups は空） */
  isLoading: boolean;
  /** リンクのテーブルを読めなかった。詳細データが持つリンクだけを出している */
  failed: boolean;
  /** リンクのある種類・グループだけ。並び順は全スキー場で同じ */
  groups: ResortLinkGroupView[];
};

const remember = (key: string, items: ResortLinkItem[]) => {
  if (loadedLinks.size >= MAX_REMEMBERED_RESORTS)
    loadedLinks.delete(loadedLinks.keys().next().value ?? "");
  loadedLinks.set(key, items);
};

/** まだ読んでいないスキー場を、数件ずつまとめて読みに行く */
const requestMissing = (targets: Target[]) => {
  const missing = targets.filter(
    target => !loadedLinks.has(target.key) && !pendingLinks.has(target.key),
  );
  for (let start = 0; start < missing.length; start += REQUEST_CHUNK_SIZE) {
    const chunk = missing.slice(start, start + REQUEST_CHUNK_SIZE);
    const request = getResortLinkLists(chunk.map(target => target.ids))
      .then(lists => {
        chunk.forEach((target, index) => {
          remember(target.key, lists[index] ?? []);
        });
      })
      .finally(() => {
        for (const target of chunk) pendingLinks.delete(target.key);
      });
    for (const target of chunk) pendingLinks.set(target.key, request);
  }
};

/**
 * スキー場ごとのリンク一覧（リンク集のタブ・比較のリンク集）。
 * 公式ページ・ツアー・SNSなどは画面を開いたときに読み、営業状況・リフト券のURLは詳細データから足す。
 */
export const useResortLinkGroups = (
  resorts: readonly Resort[],
): ResortLinkGroupsEntry[] => {
  const targets = useMemo(
    () =>
      resorts.map(resort => {
        const ids = [
          ...new Set([resort.id, ...(resort.sourceResortIds ?? [])]),
        ];
        return { resort, ids, key: ids.join(",") };
      }),
    [resorts],
  );
  // 読んだ結果はモジュールに持つ。ここは読み終えた合図と、失敗の記録
  const [settled, setSettled] = useState<Record<string, "loaded" | "failed">>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    requestMissing(targets);
    for (const { key } of targets) {
      const mark = (state: "loaded" | "failed") => () => {
        if (!cancelled)
          setSettled(current =>
            current[key] === state ? current : { ...current, [key]: state },
          );
      };
      pendingLinks.get(key)?.then(mark("loaded"), mark("failed"));
    }
    return () => {
      cancelled = true;
    };
  }, [targets]);

  return useMemo(
    () =>
      targets.map(({ resort, key }) => {
        const failed = !loadedLinks.has(key) && settled[key] === "failed";
        const items = loadedLinks.get(key) ?? (failed ? [] : null);
        return {
          resort,
          isLoading: items === null,
          failed,
          groups:
            items === null
              ? []
              : groupResortLinks([...items, ...detailLinkItems(resort)])
                  .map(group => ({
                    ...group,
                    types: group.types.filter(type => type.links.length > 0),
                  }))
                  .filter(group => group.types.length > 0),
        };
      }),
    [targets, settled],
  );
};
