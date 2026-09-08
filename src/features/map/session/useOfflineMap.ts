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
    void navigator.serviceWorker
      .register("/rusutsu/map-sw.js", {
        scope: "/rusutsu",
        updateViaCache: "none",
      })
      .then(async () => {
        const registration = await navigator.serviceWorker.ready;
        if (disposed) return;
        const warm = (entries: PerformanceEntry[]) =>
          registration.active?.postMessage({
            type: "WARM_MAP",
            assets: entries.map(entry => entry.name),
          });
        warm(performance.getEntriesByType("resource"));
        observer = new PerformanceObserver(list => warm(list.getEntries()));
        observer.observe({ type: "resource" });
        registration.active?.postMessage({ type: "SAVE_HOME" });
      })
      .catch(() => {
        /* Safari の保存制限下でもオンライン表示は継続する。 */
      });
    return () => {
      disposed = true;
      observer?.disconnect();
    };
  }, []);
}
