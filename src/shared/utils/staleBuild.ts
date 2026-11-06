import { unstable_isUnrecognizedActionError } from "next/navigation";

// public/map-sw.js の HOME と揃える。
const HOME_CACHE = "rusutsu-map-v1-home";
const RELOADED_AT_KEY = "rusutsu:stale-build-reload";

/**
 * デプロイ前の画面から Server Action を呼ぶと、新しいサーバーに ID が無く失敗する。
 * 保存済みの古い HTML を捨てて 1 回だけ読み直す。1 分以内の再発では繰り返さない。
 */
export function reloadIfStaleBuild(error: unknown) {
  if (!unstable_isUnrecognizedActionError(error)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT_KEY));
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
  } catch {
    // 記録できないと読み直しが止まらない可能性があるので、何もしない。
    return false;
  }
  void (async () => {
    try {
      if (typeof caches !== "undefined") await caches.delete(HOME_CACHE);
    } catch {
      /* 保存禁止でも読み直す。 */
    }
    window.location.reload();
  })();
  return true;
}
