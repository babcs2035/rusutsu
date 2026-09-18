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
    AbortSignal,
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
  const message = async (data: object, clientId = "client-a") => {
    const pending: Promise<unknown>[] = [];
    handlers.get("message")?.({
      source: { url: "https://example.com/rusutsu", id: clientId },
      data,
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });
    await Promise.all(pending);
  };
  return {
    caches,
    dispatch,
    message,
    saveHome: () => message({ type: "SAVE_HOME" }),
  };
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

test("応答しない通信でも保存画面は即座に開く", async () => {
  const runtime = worker(() => new Promise(() => {}));
  await (await runtime.caches.open("rusutsu-map-v1-home")).put(
    "https://example.com/rusutsu",
    new Response("saved"),
  );
  const response = await runtime.dispatch({
    url: "https://example.com/rusutsu",
    method: "GET",
    mode: "navigate",
  });
  assert.equal(await response?.text(), "saved");
});

test("詳細保存の途中失敗を記録し、取得済みタイルを残して不足分を再試行する", async () => {
  let fail = true;
  const urls = [1, 2, 3].map(
    x => `https://cyberjapandata.gsi.go.jp/xyz/pale/14/${x}/2.png`,
  );
  const requests: string[] = [];
  const runtime = worker(async request => {
    requests.push(request.url);
    if (request.url === urls[2] && fail) throw new Error("offline");
    return new Response("tile");
  });
  await (await runtime.caches.open("rusutsu-map-v1-home")).put(
    "https://example.com/rusutsu",
    new Response("saved"),
  );
  const data = {
    type: "SAVE_DETAIL",
    id: "test",
    tiles: urls,
    assets: [],
    images: [],
    complete: true,
    minZoom: 14,
    maxZoom: 14,
  };
  await runtime.message(data);
  const meta = await runtime.caches.open("rusutsu-map-v1-meta");
  assert.equal(
    (
      await (
        await meta.match("https://example.com/rusutsu/offline-detail/test")
      )?.json()
    )?.state,
    "failed",
  );
  const tiles = await runtime.caches.open("rusutsu-map-v1-tiles");
  assert.ok(await tiles.match(urls[0]));
  fail = false;
  await runtime.message(data);
  assert.equal(
    (
      await (
        await meta.match("https://example.com/rusutsu/offline-detail/test")
      )?.json()
    )?.state,
    "complete",
  );
  assert.equal(requests.filter(url => url === urls[0]).length, 1);
  await runtime.message({ ...data, complete: false });
  assert.equal(
    (
      await (
        await meta.match("https://example.com/rusutsu/offline-detail/test")
      )?.json()
    )?.state,
    "partial",
  );
});

test("新版の起動資産を取得できなければ既存HTMLを置き換えない", async () => {
  const runtime = worker(async request => {
    if (
      String(request).includes("missing.js") ||
      request.url?.includes("missing.js")
    )
      return new Response("missing", { status: 404 });
    return new Response(
      '<html><script src="/rusutsu/_next/static/missing.js"></script></html>',
      { headers: { "content-type": "text/html" } },
    );
  });
  const cache = await runtime.caches.open("rusutsu-map-v1-home");
  await cache.put(
    "https://example.com/rusutsu",
    new Response("old complete home"),
  );
  await runtime.saveHome();
  assert.equal(
    await (await cache.match("https://example.com/rusutsu"))?.text(),
    "old complete home",
  );
});

test("A→ホーム→B→ホーム→CでAだけを削除し、共有画像と休止中の別タブを保護する", async () => {
  const runtime = worker(async () => new Response("saved"));
  await (await runtime.caches.open("rusutsu-map-v1-home")).put(
    "https://example.com/rusutsu",
    new Response("home"),
  );
  const tile = (id: number) =>
    `https://cyberjapandata.gsi.go.jp/xyz/pale/14/${id}/2.png`;
  const shared = tile(0);
  const image = "https://example.org/trail.png";
  const view = (id: string | null, retainedIds: string[], tabId = "tab-a") =>
    runtime.message({ type: "SET_VIEW", id, retainedIds, tabId }, tabId);
  const save = (id: string, tiles: string[], images: string[] = []) =>
    runtime.message(
      { type: "SAVE_DETAIL", id, tiles, images, complete: true },
      "tab-a",
    );
  const tiles = await runtime.caches.open("rusutsu-map-v1-tiles");
  const images = await runtime.caches.open("rusutsu-map-v1-images");
  const meta = await runtime.caches.open("rusutsu-map-v1-meta");
  await view("A", ["A"]);
  await save("A", [tile(1), shared], [image]);
  await view(null, ["A"]);
  assert.ok(await tiles.match(tile(1)));
  await view("B", ["B", "A"]);
  await save("B", [tile(2), shared]);
  await view("A", ["A"], "tab-b");
  await view(null, ["B", "A"]);
  await view("C", ["C", "B"]);
  await save("C", [tile(3)]);
  assert.ok(await tiles.match(tile(1)), "別タブが使うAを保護");
  await view("D", ["D", "A"], "tab-b");
  await view("E", ["E", "D"], "tab-b");
  assert.equal(await tiles.match(tile(1)), undefined);
  assert.equal(await images.match(image), undefined);
  assert.equal(
    await meta.match("https://example.com/rusutsu/offline-detail/A"),
    undefined,
  );
  for (const url of [shared, tile(2), tile(3)])
    assert.ok(await tiles.match(url));
  await save("A", [tile(1)]);
  assert.equal(
    await tiles.match(tile(1)),
    undefined,
    "遅れた旧画面の保存で復活しない",
  );
});

test("1タブで25件巡回しても直近2件だけを保存する", async () => {
  const runtime = worker(async () => new Response("saved"));
  await (await runtime.caches.open("rusutsu-map-v1-home")).put(
    "https://example.com/rusutsu",
    new Response("home"),
  );
  for (let i = 0; i < 25; i++) {
    await runtime.message({
      type: "SET_VIEW",
      id: String(i),
      tabId: "one",
      retainedIds: [String(i), ...(i ? [String(i - 1)] : [])],
    });
    await runtime.message({
      type: "SAVE_DETAIL",
      id: String(i),
      tiles: [`https://cyberjapandata.gsi.go.jp/xyz/pale/14/${i}/2.png`],
      complete: true,
    });
  }
  assert.equal(
    (await (await runtime.caches.open("rusutsu-map-v1-tiles")).keys()).length,
    2,
  );
});

test("保存途中で2つ先へ移動しても、完了の遅い画像が削除後に復活しない", async () => {
  let finish: (() => void) | undefined;
  let started: (() => void) | undefined;
  const waiting = new Promise<void>(resolve => {
    started = resolve;
  });
  const runtime = worker(async () => {
    started?.();
    await new Promise<void>(resolve => {
      finish = resolve;
    });
    return new Response("late tile");
  });
  const url = "https://cyberjapandata.gsi.go.jp/xyz/pale/14/1/2.png";
  await runtime.message({
    type: "SET_VIEW",
    tabId: "one",
    id: "A",
    retainedIds: ["A"],
  });
  const saving = runtime.message({
    type: "SAVE_DETAIL",
    id: "A",
    tiles: [url],
    complete: true,
  });
  await waiting;
  const second = runtime.message({
    type: "SET_VIEW",
    tabId: "one",
    id: "B",
    retainedIds: ["B", "A"],
  });
  const third = runtime.message({
    type: "SET_VIEW",
    tabId: "one",
    id: "C",
    retainedIds: ["C", "B"],
  });
  finish?.();
  await Promise.all([saving, second, third]);
  assert.equal(
    await (await runtime.caches.open("rusutsu-map-v1-tiles")).match(url),
    undefined,
  );
});
