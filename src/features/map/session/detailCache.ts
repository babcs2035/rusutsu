import type { MapSkiResort, SkiResortDetail } from "@/types/skiResorts";

// 詳細の必須フィールドを変更したら更新する。旧データを現行の型として復元しない。
const DETAIL_CACHE_VERSION = 2;

// IndexedDB の structured clone を使い、詳細内の Date を文字列に変えない。
async function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("rusutsu-offline-v1", 2);
    request.onupgradeneeded = () => {
      for (const name of ["details", "views"]) {
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name, { keyPath: "id" });
      }
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
export async function writeDetailCache(data: SkiResortDetail, tabId?: string) {
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["details", "views"], "readwrite");
      const store = tx.objectStore("details");
      const put = () => {
        store.put({
          id: data.id,
          version: DETAIL_CACHE_VERSION,
          data,
          savedAt: Date.now(),
        });
        const all = store.getAll();
        all.onsuccess = () => {
          if (all.result.length > 20) tx.abort();
        };
      };
      if (tabId) {
        const owner = tx.objectStore("views").get(tabId);
        owner.onsuccess = () => {
          if (owner.result?.resortIds?.includes(data.id)) put();
          else tx.abort(); // 遅れて完了した取得で、削除した詳細を復活させない。
        };
      } else put();
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

/** 一覧の実データもタブ別に保存。別タブのHTML更新に引きずられない。 */
export async function readOverviewCache(
  id: string,
): Promise<MapSkiResort[] | null> {
  try {
    const db = await openCache();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("views", "readonly");
      const request = tx.objectStore("views").get(id);
      request.onsuccess = () =>
        resolve(
          request.result?.version === 1 && Array.isArray(request.result.data)
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
export async function writeOverviewCache(id: string, data: MapSkiResort[]) {
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("views", "readwrite");
      const store = tx.objectStore("views");
      const previous = store.get(id);
      previous.onsuccess = () => {
        store.put({ ...previous.result, id, version: 1, data });
        const all = store.getAll();
        all.onsuccess = () => {
          if (all.result.length > 20) tx.abort();
        };
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    /* キャッシュ禁止でもSSRで受け取った一覧を表示する。 */
  }
}

/** 各タブの参照と削除を同じトランザクションで更新する。休止タブも保護する。 */
export async function retainDetailCaches(tabId: string, resortIds: string[]) {
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["details", "views"], "readwrite");
      const views = tx.objectStore("views");
      const request = views.get(tabId);
      request.onsuccess = () => {
        const previous: string[] = request.result?.resortIds ?? [];
        views.put({ ...request.result, id: tabId, resortIds });
        const all = views.getAll();
        all.onsuccess = () => {
          const retained = new Set<string>(
            all.result.flatMap(view => view.resortIds ?? []),
          );
          for (const id of previous) {
            if (!retained.has(id)) tx.objectStore("details").delete(id);
          }
        };
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    /* 保存禁止でも通常の表示を続ける。 */
  }
}
