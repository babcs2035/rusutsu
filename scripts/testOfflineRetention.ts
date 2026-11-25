import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { build } from "esbuild";
import { type Browser, chromium, type Page } from "playwright";

interface DetailStub {
  id: string;
  dates?: unknown[];
}

interface RetentionApi {
  retainResortSession(id: string | null): string[];
  writeDetailCache(
    detail: DetailStub,
    options?: { compared?: boolean },
  ): Promise<boolean>;
  readDetailCache(id: string): Promise<DetailStub | null>;
  retainComparedDetails(ids: string[]): Promise<boolean>;
  writeStorage(key: string, value: unknown): void;
}

declare global {
  interface Window {
    retention: RetentionApi;
  }
}

/** 実際の Service Worker を使い，旧版のタブを開いた状態で配備と切り戻しを試す． */
async function assertReleaseRetention(browser: Browser): Promise<void> {
  const worker = await readFile("public/map-sw.js");
  const chunk = (version: string, name: string): string =>
    `/rusutsu/_next/static/chunks/${version}-${name}.js`;
  let version = "a";
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/rusutsu") {
      response.setHeader("Content-Type", "text/html");
      response.end(
        `<html><script src="${chunk(version, "start")}"></script><body data-build="${version}">
         <input id="draft"><input id="photo" type="file">
         <select id="course"><option value="first">First</option><option value="second">Second</option></select></body></html>`,
      );
    } else if (request.url === "/rusutsu/map-sw.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.setHeader("Service-Worker-Allowed", "/rusutsu");
      response.end(worker);
    } else if (
      [chunk(version, "start"), chunk(version, "lazy")].includes(
        request.url ?? "",
      )
    ) {
      response.setHeader("Content-Type", "text/javascript");
      response.end(`/* ${version} */`);
    } else {
      response.statusCode = 404;
      response.end("asset unavailable");
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/rusutsu`;
    const context = await browser.newContext();
    try {
      /** 現行版を別タブで開き，起動画面と遅延資産が保存されるまで待つ． */
      const open = async (revision: string): Promise<Page> => {
        const page = await context.newPage();
        await page.goto(url);
        assert.equal(
          await page.locator("body").getAttribute("data-build"),
          revision,
        );
        await page.evaluate(async () => {
          await navigator.serviceWorker.register("/rusutsu/map-sw.js", {
            scope: "/rusutsu",
          });
          await navigator.serviceWorker.ready;
        });
        await page.waitForFunction(() => navigator.serviceWorker.controller);
        await page.evaluate(
          assets => {
            navigator.serviceWorker.controller?.postMessage({
              type: "WARM_MAP",
              assets,
              snapshot: true,
            });
            navigator.serviceWorker.controller?.postMessage({
              type: "SAVE_HOME",
            });
          },
          [chunk(revision, "start"), chunk(revision, "lazy")],
        );
        await page.waitForFunction(
          async ({ url, revision, lazy }) => {
            const homes = await caches.open("rusutsu-map-v1-home");
            const html = await (await homes.match(url))?.text();
            const assets = await caches.open("rusutsu-map-v1-assets");
            return (
              html?.includes(`data-build="${revision}"`) &&
              !!(await assets.match(lazy))
            );
          },
          { url, revision, lazy: chunk(revision, "lazy") },
        );
        return page;
      };
      const oldPage = await open("a");
      await oldPage.locator("#draft").fill("unsaved report");
      await oldPage.locator("#photo").setInputFiles({
        name: "unsaved.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from("test attachment"),
      });
      await oldPage.locator("#course").selectOption("second");

      version = "b";
      const newPage = await open("b");
      assert.equal(
        await oldPage.evaluate(
          async asset => (await fetch(asset)).text(),
          chunk("a", "lazy"),
        ),
        "/* a */",
      );
      assert.equal(
        await oldPage.locator("#draft").inputValue(),
        "unsaved report",
      );
      assert.equal(
        await oldPage
          .locator("#photo")
          .evaluate(
            input =>
              input instanceof HTMLInputElement && input.files?.[0]?.name,
          ),
        "unsaved.jpg",
      );
      assert.equal(await oldPage.locator("#course").inputValue(), "second");

      version = "a";
      await open("a");
      assert.equal(
        await newPage.evaluate(
          async asset => (await fetch(asset)).text(),
          chunk("b", "lazy"),
        ),
        "/* b */",
      );
      console.log(
        "PASS: Service Worker retains open tabs and their assets across rollout and rollback",
      );
    } finally {
      await context.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    );
  }
}

// 実ブラウザのsessionStorage / IndexedDBで保存・削除・再読み込みを検証。
// 詳細キャッシュは全タブで共有し、直近に開いた 2 件と比較中の全件だけ残す
// 現在の設計（views ストア廃止後の v3）に対する検証である。
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
// 非ヘッドレス（xvfb）は WebGL を有効化するため，環境変数でヘッドレスを切替える．
const headless = process.env.OFFLINE_TEST_HEADLESS !== "false";
const browser = await chromium.launch({ headless });
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
  // 詳細はページ内で作成する。evaluate の引数は JSON 化されるため，
  // Date を引数で渡すと文字列になってしまう。
  const visit = (
    page: Page,
    id: string | null,
    withDates = false,
  ): Promise<string[]> =>
    page.evaluate(
      async ({ id, withDates }) => {
        const api = window.retention;
        const ids = api.retainResortSession(id);
        if (id) {
          const detail: DetailStub = {
            id,
            ...(withDates ? { dates: [new Date(1234567890123)] } : {}),
          };
          const saved = await api.writeDetailCache(detail);
          if (!saved) throw new Error(`Failed saving ${id}`);
          api.writeStorage(`rusutsu:detail:v1:${id}`, { tab: "weather" });
          api.writeStorage(`rusutsu:map:v1:${id}:expanded`, { zoom: 15 });
          api.writeStorage(
            `rusutsu:scroll:v1:rusutsu:detail:v1:${id}:mobile`,
            123,
          );
        }
        return ids;
      },
      { id, withDates },
    );
  const detailKeys = (page: Page): Promise<string[]> =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("rusutsu-offline-v1", 3);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const keys = await new Promise<IDBValidKey[]>(resolve => {
        const request = db
          .transaction("details")
          .objectStore("details")
          .getAllKeys();
        request.onsuccess = () => resolve(request.result);
      });
      db.close();
      return keys.filter((key): key is string => typeof key === "string");
    });
  await a.evaluate(() => sessionStorage.setItem("slope:draft:A", "draft"));
  await visit(a, "A");
  await visit(a, "B");
  await visit(a, "C", true);
  // 保持リストの再確認は書き込みを伴わない。writeDetailCache は data を
  // 丸ごと置き換えるため，dates を付けた C を再訪問すると消える。
  assert.deepEqual(
    await a.evaluate(() =>
      JSON.parse(sessionStorage.getItem("rusutsu:home:v1:resorts") ?? "[]"),
    ),
    ["C", "B"],
  );
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
    await a.evaluate(() => window.retention.readDetailCache("A")),
    null,
  );
  // structured clone で Date が文字列化されないこと。
  assert.equal(
    await a.evaluate(async () => {
      const detail = await window.retention.readDetailCache("C");
      const value = detail?.dates?.[0];
      return value instanceof Date ? value.getTime() : typeof value;
    }),
    1234567890123,
  );
  assert.deepEqual(await detailKeys(a), ["B", "C"]);
  // 比較中は直近 2 件に入らなくても残る。比較から外すと直近 2 件のみになる。
  await a.evaluate(async () => {
    const saved = await window.retention.writeDetailCache(
      { id: "D" },
      { compared: true },
    );
    if (!saved) throw new Error("Failed saving D");
  });
  await visit(a, "E");
  assert.deepEqual(await detailKeys(a), ["C", "D", "E"]);
  await a.evaluate(() => window.retention.retainComparedDetails([]));
  assert.deepEqual(await detailKeys(a), ["C", "E"]);
  // 詳細キャッシュは全タブで共有される。
  assert.deepEqual(
    await b.evaluate(async () => {
      const detail = await window.retention.readDetailCache("C");
      const value = detail?.dates?.[0];
      return {
        id: detail?.id,
        date: value instanceof Date ? value.getTime() : typeof value,
      };
    }),
    { id: "C", date: 1234567890123 },
  );
  assert.equal(
    await b.evaluate(() => window.retention.readDetailCache("D")),
    null,
  );
  // 保持リストはタブごとに独立する。
  assert.deepEqual(await visit(b, "F"), ["F"]);
  assert.deepEqual(
    await a.evaluate(() =>
      JSON.parse(sessionStorage.getItem("rusutsu:home:v1:resorts") ?? "[]"),
    ),
    ["E", "C"],
  );
  await a.reload();
  assert.deepEqual(await visit(a, null), ["E", "C"]);
  assert.equal(
    await a.evaluate(() => sessionStorage.getItem("rusutsu:detail:v1:E")),
    '{"tab":"weather"}',
  );
  for (let i = 0; i < 25; i++) await visit(a, `resort-${i}`);
  assert.deepEqual(await detailKeys(a), ["resort-23", "resort-24"]);
  assert.deepEqual(await visit(a, "resort-23"), ["resort-23", "resort-24"]);
  console.log(
    "PASS: retention, pruning, compared retention, date round-trip, cross-tab shared cache, reload, draft protection",
  );
  await assertReleaseRetention(browser);
} finally {
  await browser.close();
}
