import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

// 実ブラウザのsessionStorage / IndexedDBで保存・削除・再読み込みを検証。
const bundle = await build({
  stdin: {
    contents:
      'export * from "./src/features/map/session/storage"; export * from "./src/features/map/session/detailCache";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "iife",
  globalName: "retention",
  platform: "browser",
});
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  await context.route("http://localhost:3000/rusutsu", route =>
    route.fulfill({ contentType: "text/html", body: "<html></html>" }),
  );
  await context.addInitScript({
    content: `${bundle.outputFiles[0].text}; window.retention = retention;`,
  });
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto("http://localhost:3000/rusutsu");
  await b.goto("http://localhost:3000/rusutsu");
  const visit = (page, tab, id) =>
    page.evaluate(
      async ({ tab, id }) => {
        const ids = retention.retainResortSession(id);
        await retention.retainDetailCaches(tab, ids);
        await retention.writeOverviewCache(tab, [{ id: "overview" }]);
        if (id) {
          const saved = await retention.writeDetailCache(
            { id, date: new Date(0) },
            tab,
          );
          if (!saved) throw new Error(`Failed saving ${id}`);
          retention.writeStorage(`rusutsu:detail:v1:${id}`, { tab: "weather" });
          retention.writeStorage(`rusutsu:map:v1:${id}:expanded`, { zoom: 15 });
          retention.writeStorage(
            `rusutsu:scroll:v1:rusutsu:detail:v1:${id}:mobile`,
            123,
          );
        }
        return ids;
      },
      { tab, id },
    );
  await a.evaluate(() => sessionStorage.setItem("slope:draft:A", "draft"));
  await visit(a, "tab-a", "A");
  await visit(a, "tab-a", null);
  await visit(a, "tab-a", "B");
  await visit(b, "tab-b", "A");
  await visit(a, "tab-a", null);
  assert.deepEqual(await visit(a, "tab-a", "C"), ["C", "B"]);
  assert.deepEqual(
    await a.evaluate(() => ({
      removed: [
        "rusutsu:detail:v1:A",
        "rusutsu:map:v1:A:expanded",
        "rusutsu:scroll:v1:rusutsu:detail:v1:A:mobile",
      ].every(key => sessionStorage.getItem(key) === null),
      draft: sessionStorage.getItem("slope:draft:A"),
    })),
    { removed: true, draft: "draft" },
  );
  assert.equal(
    await b.evaluate(async () => (await retention.readDetailCache("A"))?.id),
    "A",
  );
  await a.reload();
  assert.deepEqual(await visit(a, "tab-a", null), ["C", "B"]);
  assert.equal(
    await a.evaluate(() => sessionStorage.getItem("rusutsu:detail:v1:B")),
    '{"tab":"weather"}',
  );
  await visit(b, "tab-b", "D");
  await visit(b, "tab-b", "E");
  assert.equal(await a.evaluate(() => retention.readDetailCache("A")), null);
  assert.equal(
    await a.evaluate(() => retention.writeDetailCache({ id: "A" }, "tab-a")),
    false,
  );
  for (let i = 0; i < 25; i++) await visit(a, "tab-a", `resort-${i}`);
  assert.deepEqual(
    await a.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("rusutsu-offline-v1", 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const ids = await new Promise(resolve => {
        const request = db
          .transaction("details")
          .objectStore("details")
          .getAllKeys();
        request.onsuccess = () => resolve(request.result);
      });
      db.close();
      return ids.sort();
    }),
    ["D", "E", "resort-23", "resort-24"],
  );
  assert.deepEqual(await visit(a, "tab-a", "resort-23"), [
    "resort-23",
    "resort-24",
  ]);
  console.log(
    "PASS: retention, reload, 25 resorts, cross-tab protection, stale writes, draft protection",
  );
} finally {
  await browser.close();
}
