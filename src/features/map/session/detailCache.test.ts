import assert from "node:assert/strict";
import test from "node:test";
import type { MapSkiResort, SkiResortDetail } from "@/types/skiResorts";
import {
  readDetailCache,
  readOverviewCache,
  writeDetailCache,
  writeOverviewCache,
} from "./detailCache";

test("旧キャッシュは復元せず、再取得して保存した詳細を次回復元する", async t => {
  const data = {
    id: "test",
    socialAccounts: { X: [], Instagram: [], Facebook: [] },
  };
  const entries = new Map<string, Record<string, unknown>>([
    ["test", { id: "test", data: { id: "test" }, savedAt: 1 }],
  ]);
  // 非同期の request/transaction コールバックを通して公開APIを検証する。
  const db = {
    close() {},
    transaction(_name: string, mode: string) {
      const tx = {
        oncomplete: () => {},
        objectStore: () => ({
          get(id: string) {
            const request = { result: entries.get(id), onsuccess: () => {} };
            queueMicrotask(() => {
              request.onsuccess();
              tx.oncomplete();
            });
            return request;
          },
          put(entry: Record<string, unknown>) {
            entries.set(entry.id as string, entry);
          },
          getAll() {
            const request = {
              result: [...entries.values()],
              onsuccess: () => {},
            };
            queueMicrotask(() => {
              request.onsuccess();
              if (mode === "readwrite") tx.oncomplete();
            });
            return request;
          },
          delete(id: string) {
            entries.delete(id);
          },
        }),
      };
      return tx;
    },
  };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open() {
        const request = { result: db, onsuccess: () => {} };
        queueMicrotask(() => request.onsuccess());
        return request;
      },
    },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "indexedDB", descriptor);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  });
  assert.equal(await readDetailCache("test"), null);
  await writeDetailCache(data as unknown as SkiResortDetail);
  assert.deepEqual(await readDetailCache("test"), data);
  assert.equal(await readDetailCache("missing"), null);
  entries.set("test", { ...entries.get("test"), version: -1 });
  assert.equal(await readDetailCache("test"), null);
  const first = [{ id: "a" }] as MapSkiResort[];
  const second = [{ id: "b" }] as MapSkiResort[];
  await writeOverviewCache("tab-a", first);
  await writeOverviewCache("tab-b", second);
  assert.deepEqual(await readOverviewCache("tab-a"), first);
  assert.deepEqual(await readOverviewCache("tab-b"), second);
});
