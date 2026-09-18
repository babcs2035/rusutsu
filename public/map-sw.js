/* 閲覧済みの公開地図専用。管理画面、認証、API、Server Action はキャッシュしない。 */
const PREFIX = "rusutsu-map-v1";
const HOME = `${PREFIX}-home`;
const ASSETS = `${PREFIX}-assets`;
const TILES = `${PREFIX}-tiles`;
const OVERVIEW_TILES = `${PREFIX}-overview-tiles`;
const META = `${PREFIX}-meta`;
const IMAGES = `${PREFIX}-images`;
const ROOT = "/rusutsu/";
const homeURL = new URL("/rusutsu", self.location.origin).href;
const isAsset = url =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith("/rusutsu/_next/static/") ||
    /^\/rusutsu\/social\/[\w.-]+\.(png|svg)$/.test(url.pathname) ||
    /^\/rusutsu\/maplibre\/[\w.-]+\.mjs$/.test(url.pathname));
const isTile = url =>
  url.origin === "https://cyberjapandata.gsi.go.jp" &&
  /^\/xyz\/(pale|seamlessphoto)\/\d+\/\d+\/\d+\.(png|jpg)$/.test(url.pathname);
let writes = Promise.resolve();
const sizes = new Map();
const fetchPublic = request =>
  fetch(request, { credentials: "omit", signal: AbortSignal.timeout(12000) });
function saveBounded(name, request, response, limit, strict = false) {
  const task = writes
    .catch(() => {})
    .then(async () => {
      const opaqueImage = name === IMAGES && response.type === "opaque";
      if ((!response.ok || response.type === "opaque") && !opaqueImage)
        throw new Error("unusable response");
      const cache = await caches.open(name);
      if (!sizes.has(name)) {
        const entries = new Map();
        for (const key of await cache.keys()) {
          const saved = await cache.match(key);
          entries.set(
            typeof key === "string" ? key : key.url,
            saved.type === "opaque"
              ? 7 * 1024 * 1024
              : Number(saved.headers.get("x-rusutsu-bytes")) ||
                  (await saved.arrayBuffer()).byteLength,
          );
        }
        sizes.set(name, entries);
      }
      const entries = sizes.get(name);
      const key = typeof request === "string" ? request : request.url;
      if (!entries.has(key) && entries.size >= limit)
        throw new Error("entry limit");
      const bytes = opaqueImage ? null : await response.clone().arrayBuffer();
      const byteLength = bytes ? bytes.byteLength : 7 * 1024 * 1024;
      const budget = name === TILES ? 192 * 1024 * 1024 : 64 * 1024 * 1024;
      let used = -(entries.get(key) || 0);
      for (const size of entries.values()) used += size;
      if (used + byteLength > budget) throw new Error("byte limit");
      const headers = new Headers(response.headers);
      for (const key of ["content-encoding", "content-length", "vary"])
        headers.delete(key);
      headers.set("x-rusutsu-bytes", String(byteLength));
      await cache.put(
        request,
        opaqueImage
          ? response
          : new Response(bytes, { status: response.status, headers }),
      );
      entries.set(key, byteLength);
    });
  writes = task;
  return strict ? task : task.catch(() => {});
}
let backgroundCount = 0;
const backgroundWaiters = [];
async function backgroundFetch(request) {
  if (backgroundCount >= 2)
    await new Promise(resolve => backgroundWaiters.push(resolve));
  else backgroundCount++;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetchPublic(request);
      } catch (error) {
        if (attempt >= 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  } finally {
    const next = backgroundWaiters.shift();
    if (next) next();
    else backgroundCount--;
  }
}
async function cachedAsset(
  request,
  name,
  limit,
  strict = false,
  background = strict,
) {
  let cached;
  try {
    cached = await (await caches.open(name)).match(request);
  } catch {
    /* 保存禁止でも通信を続ける。 */
  }
  if (cached) return cached;
  const response = await (background
    ? backgroundFetch(request)
    : fetchPublic(request));
  await saveBounded(name, request, response.clone(), limit, strict);
  return response;
}
async function pool(values, action) {
  let cursor = 0;
  const results = await Promise.allSettled(
    Array.from({ length: 2 }, async () => {
      while (cursor < values.length) await action(values[cursor++]);
    }),
  );
  const failed = results.find(result => result.status === "rejected");
  if (failed) throw failed.reason;
}
let preparation = Promise.resolve();
const views = new Map();
const retentionURL = tabId =>
  new URL(`/rusutsu/offline-tab/${encodeURIComponent(tabId)}`, homeURL).href;
const detailURL = id =>
  new URL(`/rusutsu/offline-detail/${encodeURIComponent(id)}`, homeURL).href;

// preparation と writes の完了後に削除する。保存中の古いジョブが画像を復活させない。
async function retainDetails(tabId, retainedIds) {
  const meta = await caches.open(META);
  const tabKey = retentionURL(tabId);
  const previous = await (await meta.match(tabKey))?.json();
  await meta.put(tabKey, new Response(JSON.stringify({ retainedIds })));
  const retained = new Set();
  const manifests = new Map();
  for (const key of await meta.keys()) {
    const url = typeof key === "string" ? key : key.url;
    const entry = await (await meta.match(key)).json();
    if (new URL(url).pathname.startsWith("/rusutsu/offline-tab/")) {
      for (const id of entry.retainedIds || []) retained.add(id);
    } else manifests.set(url, entry);
  }
  const removed = (previous?.retainedIds || []).filter(id => !retained.has(id));
  const discarded = removed
    .map(id => manifests.get(detailURL(id)))
    .filter(Boolean);
  for (const id of removed) {
    await meta.delete(detailURL(id));
    manifests.delete(detailURL(id));
  }
  await writes.catch(() => {});
  for (const [name, field] of [
    [TILES, "tiles"],
    [IMAGES, "images"],
  ]) {
    const keep = new Set(
      [...manifests.values()].flatMap(entry => entry[field] || []),
    );
    const cache = await caches.open(name);
    for (const url of new Set(discarded.flatMap(entry => entry[field] || []))) {
      if (!keep.has(url)) {
        await cache.delete(url);
        sizes.get(name)?.delete(url);
      }
    }
  }
}

async function saveDetail(data, clientId) {
  if (views.has(clientId) && views.get(clientId) !== data.id) return;
  const key = new URL(
    `/rusutsu/offline-detail/${encodeURIComponent(data.id)}`,
    homeURL,
  ).href;
  const meta = await caches.open(META);
  const previous = await (await meta.match(key))?.json();
  const ownedTiles = [
    ...new Set([...(previous?.tiles || []), ...data.tiles.slice(0, 3200)]),
  ];
  const ownedImages = [
    ...new Set([
      ...(previous?.images || []),
      ...(data.images || []).slice(0, 12),
    ]),
  ];
  const status = async (state, extra = {}) =>
    meta.put(
      key,
      new Response(
        JSON.stringify({
          state,
          minZoom: data.minZoom,
          maxZoom: data.maxZoom,
          tiles: ownedTiles,
          images: ownedImages,
          ...extra,
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
  await status("saving");
  try {
    await pool(
      (data.assets || []).filter(
        value => typeof value === "string" && isAsset(new URL(value, homeURL)),
      ),
      value => cachedAsset(new Request(value), ASSETS, 600, true),
    );
    await pool(data.tiles.slice(0, 3200), value => {
      if (views.has(clientId) && views.get(clientId) !== data.id)
        throw new Error("view changed");
      if (typeof value !== "string" || !isTile(new URL(value)))
        throw new Error("invalid tile");
      return cachedAsset(
        new Request(value, { mode: "cors", credentials: "omit" }),
        TILES,
        6000,
        true,
      );
    });
    // 公式マップ画像は資格情報なしで保存。opaque画像は保守的に7MiBとして予算計上。
    await pool((data.images || []).slice(0, 12), async value => {
      const url = new URL(value, homeURL);
      if (url.protocol !== "https:" || url.origin === self.location.origin)
        throw new Error("invalid image");
      await cachedAsset(
        new Request(url, { mode: "no-cors", credentials: "omit" }),
        IMAGES,
        120,
        true,
      );
    });
    if (!(await (await caches.open(HOME)).match(homeURL)))
      throw new Error("startup not saved");
    await status(
      data.complete &&
        data.tiles.length <= 3200 &&
        (data.images || []).length <= 12
        ? "complete"
        : "partial",
    );
  } catch (error) {
    await status(
      String(error).includes("view changed") ? "partial" : "failed",
      { reason: String(error) },
    );
  }
}
async function saveHome(response) {
  if (
    !response.ok ||
    response.redirected ||
    !response.headers.get("content-type")?.includes("text/html")
  )
    return;
  const html = await response.clone().text();
  const paths = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map(match => new URL(match[1].replaceAll("&amp;", "&"), homeURL))
    .filter(isAsset);
  // ワーカーはページ外から取得されるので、起動資産として明示的に保存する。
  paths.push(new URL("/rusutsu/maplibre/maplibre-gl-worker.mjs", homeURL));
  // 起動に要る資産を保存できた HTML だけ採用する。
  await Promise.all(
    paths.map(url => cachedAsset(new Request(url), ASSETS, 600, true)),
  );
  const cache = await caches.open(HOME);
  // 保存するのは展開済み HTML。通信時の圧縮・長さ・RSC 用 Vary を持ち越さない。
  const headers = new Headers(response.headers);
  for (const name of [
    "content-encoding",
    "content-length",
    "transfer-encoding",
    "vary",
  ])
    headers.delete(name);
  await cache.put(homeURL, new Response(html, { status: 200, headers }));
}
self.addEventListener("activate", event => {
  // 更新時は既存タブが閉じるまで待つ（skipWaiting で実行中の版を差し替えない）。
  event.waitUntil(self.clients.claim());
});
self.addEventListener("message", event => {
  if (
    !event.source?.url ||
    new URL(event.source.url).origin !== self.location.origin
  )
    return;
  const source = new URL(event.source.url);
  if (!["/rusutsu", ROOT].includes(source.pathname)) return;
  if (event.data?.type === "SET_VIEW") {
    views.set(event.source.id, event.data.id);
    if (
      typeof event.data.tabId === "string" &&
      Array.isArray(event.data.retainedIds) &&
      event.data.retainedIds.length <= 2 &&
      event.data.retainedIds.every(id => typeof id === "string")
    ) {
      preparation = preparation
        .catch(() => {})
        .then(() => retainDetails(event.data.tabId, event.data.retainedIds));
      event.waitUntil(preparation.catch(() => {}));
    }
  }
  if (
    event.data?.type === "SAVE_DETAIL" &&
    typeof event.data.id === "string" &&
    Array.isArray(event.data.tiles)
  ) {
    preparation = preparation
      .catch(() => {})
      .then(() => saveDetail(event.data, event.source.id));
    event.waitUntil(preparation.catch(() => {}));
  }
  if (event.data?.type === "SAVE_HOME") {
    event.waitUntil(
      fetchPublic(homeURL)
        .then(saveHome)
        .catch(() => {}),
    );
  }
  if (event.data?.type === "WARM_MAP" && Array.isArray(event.data.assets)) {
    event.waitUntil(
      pool(
        event.data.assets
          .slice(0, 600)
          .filter(value => typeof value === "string"),
        async value => {
          const url = new URL(value, homeURL);
          if (isAsset(url))
            return cachedAsset(new Request(url), ASSETS, 600, false, true);
          return undefined;
        },
      ).catch(() => {}),
    );
  }
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (isAsset(url)) {
    event.respondWith(cachedAsset(request, ASSETS, 600));
    return;
  }
  if (isTile(url)) {
    event.respondWith(
      (async () => {
        try {
          const saved = await (await caches.open(TILES)).match(request);
          if (saved) return saved;
        } catch {
          /* 保存禁止でもオンラインの地図を表示する。 */
        }
        // 詳細背景は SAVE_DETAIL の所有付き保存に任せる。一覧背景は別枠。
        if (views.get(event.clientId)) return fetchPublic(request);
        return cachedAsset(request, OVERVIEW_TILES, 512);
      })(),
    );
    return;
  }
  if (request.destination === "image" && url.origin !== self.location.origin) {
    event.respondWith(
      (async () => {
        try {
          const cached = await (await caches.open(IMAGES)).match(request.url);
          if (cached) return cached;
        } catch {}
        return fetch(request);
      })(),
    );
    return;
  }
  if (
    request.mode !== "navigate" ||
    url.origin !== self.location.origin ||
    !["/rusutsu", ROOT].includes(url.pathname)
  )
    return;
  const network =
    self.navigator?.onLine === false
      ? Promise.reject(new TypeError("offline"))
      : fetchPublic(request);
  // イベントの寿命は同期的に延長する。CacheStorage の await 後に登録しない。
  event.waitUntil(
    network.then(response => saveHome(response.clone())).catch(() => {}),
  );
  event.respondWith(
    (async () => {
      let cached;
      try {
        cached = await (await caches.open(HOME)).match(homeURL);
      } catch {
        /* 保存禁止でも通信を続ける。 */
      }
      const usableNetwork = network.then(response =>
        !response.ok && cached ? cached : response,
      );
      if (!cached) return usableNetwork;
      // 保存済みなら通信を待たず表示。新しいHTMLは裏で次回用に保存する。
      usableNetwork.catch(() => {});
      return cached;
    })(),
  );
});
