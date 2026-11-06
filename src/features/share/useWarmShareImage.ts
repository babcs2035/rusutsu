"use client";

import { useEffect } from "react";
import { SHARE_IMAGE_VERSION } from "./mapCard";

/** 画面を少し見てから素材を準備し、共有時の初回生成待ちを減らす。 */
export function useWarmShareImage(ids: string[], comparison: boolean) {
  const key = ids.slice(0, 4).join(",");
  const count = ids.length;
  useEffect(() => {
    if (!key) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      const query = new URLSearchParams({
        ids: key,
        count: String(count),
        v: `${SHARE_IMAGE_VERSION}-${new Date().toISOString().slice(0, 10)}`,
      });
      if (comparison) query.set("comparison", "1");
      void fetch(`/rusutsu/api/share-image?${query}`, {
        method: "HEAD",
        signal: abort.signal,
      }).catch(() => undefined);
    }, 2500);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [key, count, comparison]);
}
