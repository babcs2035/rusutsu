import type { SkiResortDetail } from "@/types/skiResorts";

// 古い営業情報を含む詳細も復元させない。再取得した現在値で保存し直す。
const DETAIL_CACHE_VERSION = 3;
// 圏外で開き直すのは直近の詳細だけ。直前の 1 件まで残す。比較中のものは別に全件残す。
const RETAINED_VIEWS = 2;

type CacheEntry = {
  id: string;
  version: number;
  data: SkiResortDetail;
  viewedAt?: number;
  compared?: boolean;
};

/** 直近に開いた詳細と比較中の詳細だけ残し、それ以外を消す。 */
function prune(store: IDBObjectStore, entries: CacheEntry[]) {
  const recent = new Set(
    entries
      .filter(entry => entry.viewedAt)
      .sort((a, b) => (b.viewedAt ?? 0) - (a.viewedAt ?? 0))
      .slice(0, RETAINED_VIEWS)
      .map(entry => entry.id),
  );
  for (const entry of entries) {
    if (!entry.compared && !recent.has(entry.id)) store.delete(entry.id);
  }
}

// IndexedDB の structured clone を使い、詳細内の Date を文字列に変えない。
async function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("rusutsu-offline-v1", 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("details"))
        db.createObjectStore("details", { keyPath: "id" });
      // v2 までのタブ別一覧・保持リスト。閉じたタブの分が残り続けるので捨てる。
      if (db.objectStoreNames.contains("views")) db.deleteObjectStore("views");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Cache is blocked"));
  });
}
export async function readDetailCache(
  id: string,
): Promise<SkiResortDetail | null> {
  try {
    const db = await openCache();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("details", "readonly");
      const request = tx.objectStore("details").get(id);
      request.onsuccess = () =>
        resolve(
          request.result?.version === DETAIL_CACHE_VERSION &&
            request.result?.data?.id === id
            ? request.result.data
            : null,
        );
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    return null;
  }
}
/** 詳細を開いたときは viewedAt、比較で取得したときは compared を付けて保存する。 */
export async function writeDetailCache(
  data: SkiResortDetail,
  { compared = false }: { compared?: boolean } = {},
) {
  return updateCache(store => {
    const previous = store.get(data.id);
    previous.onsuccess = () => {
      const entry: CacheEntry = previous.result ?? { id: data.id };
      store.put({
        ...entry,
        version: DETAIL_CACHE_VERSION,
        data,
        ...(compared ? { compared: true } : { viewedAt: Date.now() }),
      });
      const all = store.getAll();
      all.onsuccess = () => prune(store, all.result);
    };
  });
}

/** 比較から外したスキー場は、直近に開いた 2 件に入っていなければ消す。 */
export async function retainComparedDetails(ids: string[]) {
  const compared = new Set(ids);
  return updateCache(store => {
    const all = store.getAll();
    all.onsuccess = () => {
      const entries: CacheEntry[] = all.result.map(entry => {
        const next = { ...entry, compared: compared.has(entry.id) };
        if (next.compared !== Boolean(entry.compared)) store.put(next);
        return next;
      });
      prune(store, entries);
    };
  });
}

async function updateCache(update: (store: IDBObjectStore) => void) {
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("details", "readwrite");
      update(tx.objectStore("details"));
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    });
    return true;
  } catch {
    /* 端末の保存制限は画面の読み込みを妨げない。 */
    return false;
  }
}
