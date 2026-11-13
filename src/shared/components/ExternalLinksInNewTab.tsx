"use client";

import { useEffect } from "react";

/**
 * 外部サイトへのリンクを必ず別タブで開く。
 * 個々のリンクは `ExternalLinkComponent` で `target="_blank"` を付けるが、
 * 地図ライブラリの著作権表示など自前で書けないリンクもあるため、クリック時に補う。
 */
export function ExternalLinksInNewTab() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.hasAttribute("download")
      )
        return;
      if (!/^https?:$/u.test(anchor.protocol)) return;
      if (anchor.origin === window.location.origin) return;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    };
    // 捕獲段階で付けて、ブラウザの既定の遷移より先に target を効かせる
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, []);
  return null;
}
