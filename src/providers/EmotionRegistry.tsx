/**
 * EmotionRegistry — Emotion CSS-in-JS の SSR スタイルを Next.js App Router に連携する。
 *
 * Next.js 16 (Turbopack デフォルト) では Emotion の SSR スタイル注入がデフォルトで
 * 正しく動作しない。本コンポーネントは以下の2つの仕組みで hydration mismatch を解消する:
 *
 * 1. `useInsertionEffect` で `document.createElement` をオーバーライドし、Emotion が
 *    クライアント側で `<style>` タグを直接 DOM に注入するのをブロックする。
 *    これにより、サーバーとクライアントの DOM 構造が一致する。
 *
 * 2. `useServerInsertedHTML` で Emotion スタイルを `<style>` タグとして
 *    HTML に挿入し、SSR スタイルを正しく配信する。
 *
 * 出典: emotion-js/emotion#2928, Chakra UI#9051, Next.js App Router CSS-in-JS ガイド
 */
"use client";

import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { useServerInsertedHTML } from "next/navigation";
import type { ReactNode } from "react";
import { useInsertionEffect, useState } from "react";

// Document 型にカスタムフラグを追加
declare global {
  interface Document {
    _rusutsu_emotion_block_style?: boolean;
  }
}

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

  // クライアント側で Emotion が `<style>` タグを直接 DOM に注入するのをブロックする。
  // このオーバーライドがないと、Emotion の useInsertionEffect がクライアント側で
  // 直接 DOM 操作を行い、サーバーとクライアントの DOM 構造が不一致になる。
  useInsertionEffect(() => {
    const doc = document as Document & {
      _rusutsu_emotion_block_style?: boolean;
    };
    if (doc._rusutsu_emotion_block_style) return;

    const OrigCreateElement = doc.createElement.bind(doc);
    doc.createElement = (tagName: string, ...args: unknown[]) => {
      if (tagName.toLowerCase() === "style") {
        // Emotion のドキュメント注入をブロック — useServerInsertedHTML が処理
        const placeholder = doc.createTextNode("") as unknown as HTMLElement;
        Object.defineProperty(placeholder, "tagName", {
          value: "STYLE",
          configurable: true,
        });
        return placeholder;
      }
      return OrigCreateElement(tagName, ...(args as [ElementCreationOptions?]));
    };
    doc._rusutsu_emotion_block_style = true;
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
