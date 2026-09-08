import type { SkiResortDetail } from "@/types/skiResorts";

// IndexedDB の structured clone を使い、詳細内の Date を文字列に変えない。
async function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("rusutsu-offline-v1", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("details", { keyPath: "id" });
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
        resolve(request.result?.data?.id === id ? request.result.data : null);
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
export async function writeDetailCache(data: SkiResortDetail) {
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("details", "readwrite");
      const store = tx.objectStore("details");
      store.put({ id: data.id, data, savedAt: Date.now() });
      const all = store.getAll();
      all.onsuccess = () => {
        const entries = all.result.sort((a, b) => b.savedAt - a.savedAt);
        for (const entry of entries.slice(20)) store.delete(entry.id);
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
    /* 端末の保存制限は画面の読み込みを妨げない。 */
  }
}
