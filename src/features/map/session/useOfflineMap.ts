"use client";

import { useEffect } from "react";

/** 開発中の HMR 資産は保存しない。本番の閲覧済み地図だけオフラインに備える。 */
export function useOfflineMap() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !window.isSecureContext ||
      !("serviceWorker" in navigator)
    )
      return;
    let disposed = false;
    let observer: PerformanceObserver | undefined;
    let refresh = () => {};
    let rewarm = () => {};
    const resume = () => {
      if (navigator.onLine) refresh();
    };
    // Worker の再起動後も，容量整理の前にこの画面の資産を通知できるようにする．
    const receive = (event: MessageEvent) => {
      if (event.data?.type === "REWARM") rewarm();
    };
    window.addEventListener("online", resume);
    navigator.serviceWorker.addEventListener("message", receive);
    navigator.serviceWorker.addEventListener("controllerchange", resume);
    void navigator.serviceWorker
      .register("/rusutsu/map-sw.js", {
        scope: "/rusutsu",
        updateViaCache: "none",
      })
      .then(async () => {
        const registration = await navigator.serviceWorker.ready;
        if (disposed) return;
        const assetUrls = new Set<string>();
        const prefixes = ["_next/static/", "maplibre/", "social/"].map(
          path => `${location.origin}/rusutsu/${path}`,
        );
        // Resource Timing の一覧が満杯になっても，後から読んだ JS を再通知できるようにする．
        const remember = (entries: PerformanceEntry[]): string[] => {
          const urls = entries
            .map(entry => entry.name)
            .filter(url => prefixes.some(prefix => url.startsWith(prefix)));
          for (const url of urls) assetUrls.add(url);
          return urls;
        };
        const warm = (assets: string[], snapshot = false): void => {
          if (!snapshot && assets.length === 0) return;
          registration.active?.postMessage({
            type: "WARM_MAP",
            assets,
            snapshot,
          });
        };
        rewarm = () => {
          remember(performance.getEntriesByType("resource"));
          warm([...assetUrls], true);
        };
        refresh = () => {
          rewarm();
          registration.active?.postMessage({ type: "SAVE_HOME" });
        };
        refresh();
        observer = new PerformanceObserver(list =>
          warm(remember(list.getEntries())),
        );
        observer.observe({ type: "resource" });
      })
      .catch(() => {
        /* Safari の保存制限下でもオンライン表示は継続する。 */
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("online", resume);
      navigator.serviceWorker.removeEventListener("message", receive);
      navigator.serviceWorker.removeEventListener("controllerchange", resume);
    };
  }, []);
}
