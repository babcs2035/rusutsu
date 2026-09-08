import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync("public/map-sw.js", "utf8");
function worker(
  fetcher: (request: Request) => Promise<Response>,
  storageBlocked = false,
) {
  const handlers = new Map<string, (event: unknown) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const key = (request: Request | string) =>
    typeof request === "string" ? request : request.url;
  const caches = {
    open: async (name: string) => {
      if (storageBlocked) throw new Error("storage blocked");
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        match: async (request: Request | string) =>
          store.get(key(request))?.clone(),
        put: async (request: Request | string, response: Response) => {
          store.set(key(request), response.clone());
        },
        keys: async () => [...store.keys()],
        delete: async (request: Request | string) => store.delete(key(request)),
      };
    },
  };
  runInNewContext(source, {
    self: {
      location: { origin: "https://example.com" },
      addEventListener: (type: string, handler: (event: unknown) => void) =>
        handlers.set(type, handler),
      clients: { claim: async () => {} },
    },
    caches,
    fetch: fetcher,
    Request,
    Response,
    Headers,
    URL,
    setTimeout,
    clearTimeout,
  });
  const dispatch = (request: { url: string; method: string; mode: string }) => {
    let response: Promise<Response> | undefined;
    handlers.get("fetch")?.({
      request,
      respondWith: (value: Promise<Response>) => {
        response = value;
      },
      waitUntil: (value: Promise<unknown>) => {
        void value.catch(() => {});
      },
    });
    return response;
  };
  const saveHome = async () => {
    const pending: Promise<unknown>[] = [];
    handlers.get("message")?.({
      source: { url: "https://example.com/rusutsu" },
      data: { type: "SAVE_HOME" },
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });
    await Promise.all(pending);
  };
  return { caches, dispatch, saveHome };
}
test("管理画面・認証・POST・RSC はキャッシュに介入しない", () => {
  const runtime = worker(async () => {
    throw new Error("must not fetch");
  });
  for (const [path, method, mode] of [
    ["/rusutsu/admin", "GET", "navigate"],
    ["/rusutsu/api/auth/session", "GET", "cors"],
    ["/rusutsu", "POST", "cors"],
    ["/rusutsu?_rsc=a", "GET", "cors"],
  ]) {
    assert.equal(
      runtime.dispatch({ url: `https://example.com${path}`, method, mode }),
      undefined,
    );
  }
});
test("圏外で末尾スラッシュの有無とスキー場クエリを問わず保存画面を開く", async () => {
  const runtime = worker(async () => {
    throw new TypeError("offline");
  });
  const cache = await runtime.caches.open("rusutsu-map-v1-home");
  await cache.put(
    "https://example.com/rusutsu",
    new Response("saved map", { headers: { "Content-Type": "text/html" } }),
  );
  for (const path of ["/rusutsu", "/rusutsu/?resort=rusutsu-resort"]) {
    const result = await runtime.dispatch({
      url: `https://example.com${path}`,
      method: "GET",
      mode: "navigate",
    });
    assert.equal(await result?.text(), "saved map");
  }
});
test("サーバー障害でも保存済み画面を残す", async () => {
  const runtime = worker(async () => new Response("error", { status: 503 }));
  const cache = await runtime.caches.open("rusutsu-map-v1-home");
  await cache.put("https://example.com/rusutsu", new Response("saved map"));
  const response = await runtime.dispatch({
    url: "https://example.com/rusutsu",
    method: "GET",
    mode: "navigate",
  });
  assert.equal(await response?.text(), "saved map");
});
test("保存した地理院タイルは圏外でも使える", async () => {
  const runtime = worker(async () => {
    throw new TypeError("offline");
  });
  const url = "https://cyberjapandata.gsi.go.jp/xyz/pale/14/1/2.png";
  await (await runtime.caches.open("rusutsu-map-v1-tiles")).put(
    url,
    new Response("tile"),
  );
  const response = await runtime.dispatch({ url, method: "GET", mode: "cors" });
  assert.equal(await response?.text(), "tile");
});

test("保存禁止でもオンラインの画面とスクリプトを読み込める", async () => {
  const runtime = worker(async () => new Response("online"), true);
  for (const [path, mode] of [
    ["/rusutsu", "navigate"],
    ["/rusutsu/_next/static/chunks/app.js", "cors"],
  ]) {
    const response = await runtime.dispatch({
      url: `https://example.com${path}`,
      method: "GET",
      mode,
    });
    assert.equal(await response?.text(), "online");
  }
});
test("保存 HTML に圧縮ヘッダーや RSC 用 Vary を持ち越さない", async () => {
  const runtime = worker(
    async () =>
      new Response("<html>map</html>", {
        headers: {
          "content-type": "text/html",
          "content-encoding": "gzip",
          "content-length": "100",
          vary: "RSC",
          "x-content-type-options": "nosniff",
        },
      }),
  );
  await runtime.saveHome();
  const response = await (
    await runtime.caches.open("rusutsu-map-v1-home")
  ).match("https://example.com/rusutsu");
  assert.equal(await response?.text(), "<html>map</html>");
  assert.equal(response?.headers.has("content-encoding"), false);
  assert.equal(response?.headers.has("content-length"), false);
  assert.equal(response?.headers.has("vary"), false);
  assert.equal(response?.headers.get("x-content-type-options"), "nosniff");
});
