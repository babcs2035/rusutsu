/**
 * EmotionRegistry — Emotion CSS-in-JS の SSR スタイルを Next.js App Router に連携する。
 *
 * Next.js 16 (Turbopack デフォルト) では `compiler.emotion: true` は機能しないため、
 * 本コンポーネントが Emotion の SSR スタイル配信を一手に担う。
 *
 * 動作机理:
 * 1. `useInsertionEffect` で `document.createElement` をオーバーライドし、
 *    Emotion が `<style>` タグを直接 DOM に注入するのをブロックする。
 *    これはサーバー側でもクライアント側でも実行され、DOM 構造を統一する。
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

  // サーバー・クライアント両方で Emotion が `<style>` タグを直接 DOM に注入するのをブロックする。
  // useInsertionEffect は SSR 時にも実行されるため、サーバーとクライアントで DOM 構造が統一される。
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
