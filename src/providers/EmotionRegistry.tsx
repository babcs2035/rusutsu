/**
 * EmotionRegistry — Emotion CSS-in-JS の SSR スタイルを Next.js App Router に連携する。
 *
 * Next.js 16 (Turbopack デフォルト) では `compiler.emotion: true` により
 * Emotion のビルド時最適化が有効になり、スタイルのシリアライズが自動処理される。
 *
 * 本コンポーネントは以下の仕組みで SSR スタイルを配信する:
 *
 * 1. `createCache({ key: "css" })` で Emotion キャッシュを初期化し、
 *    `CacheProvider` で Chakra UI に渡す。
 * 2. `useServerInsertedHTML` でリクエスト終了時に未送信のスタイルを
 *    `<style>` タグとして HTML に挿入する。
 *
 * 出典: emotion-js/emotion#2928, Chakra UI#9051, Next.js App Router CSS-in-JS ガイド
 */
"use client";

import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { useServerInsertedHTML } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

export function EmotionRegistry({ children }: { children: ReactNode }) {
  const [{ cache, flush }] = useState(() => {
    const cache = createCache({ key: "css" });
    const prevInsert = cache.insert;
    const inserted: string[] = [];

    // Emotion がスタイルを挿入するたびに name を追跡
    cache.insert = (selector, serialized, sheet, shouldCache) => {
      if (cache.inserted[serialized.name] === undefined) {
        inserted.push(serialized.name);
      }
      return prevInsert(selector, serialized, sheet, shouldCache);
    };

    const flush = () => {
      const prevInserted = [...inserted];
      inserted.length = 0;
      return prevInserted;
    };

    return { cache, flush };
  });

  // リクエスト終了時に未送信のスタイルを HTML に挿入
  useServerInsertedHTML(() => {
    const names = flush();
    if (names.length === 0) return null;

    let styles = "";
    for (const name of names) {
      styles += cache.inserted[name];
    }

    return (
      <style
        key={cache.key}
        data-emotion={`${cache.key} ${names.join(" ")}`}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Emotion SSR styles — safely injected from cache.inserted
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
