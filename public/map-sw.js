/* 閲覧済みの公開地図専用。管理画面、認証、API、Server Action はキャッシュしない。 */
const PREFIX = "rusutsu-map-v1";
const HOME = `${PREFIX}-home`;
const ASSETS = `${PREFIX}-assets`;
const TILES = `${PREFIX}-tiles`;
// 比較画面や詳細の計画外など、表示したタイル。古い順に入れ替える。
const VIEWED_TILES = `${PREFIX}-viewed-tiles`;
const META = `${PREFIX}-meta`;
const IMAGES = `${PREFIX}-images`;
const ROOT = "/rusutsu/";
const homeURL = new URL("/rusutsu", self.location.origin).href;
const buildURL = new URL("/rusutsu/offline-build", self.location.origin).href;
// 圏外で開き直すのに要るのは直近のスキー場だけ。直前の 1 件まで残す。
const RETAINED_DETAILS = 2;
// 電波が弱いゲレンデで待たせない。これを過ぎたら保存済みの画面を出す。
const NAVIGATION_TIMEOUT = 3000;
const isBuildAsset = url => url.pathname.startsWith("/rusutsu/_next/static/");
const isAsset = url =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith("/rusutsu/_next/static/") ||
    /^\/rusutsu\/social\/[\w.-]+\.(png|svg)$/.test(url.pathname) ||
    /^\/rusutsu\/maplibre\/[\w.-]+\.mjs$/.test(url.pathname));
const isHomePath = pathname => ["/rusutsu", ROOT].includes(pathname);
// /rusutsu/{resortId} もホームと同じ画面。src/shared/utils/resortPath.ts と揃える。
const isMapPath = pathname => {
  if (isHomePath(pathname)) return true;
  const match = /^\/rusutsu\/([a-z0-9-]{1,200})\/?$/.exec(pathname);
  return (
    !!match && !["admin", "api", "login", "offline-tab"].includes(match[1])
  );
};
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
      const evict = name === VIEWED_TILES;
      const bytes = opaqueImage ? null : await response.clone().arrayBuffer();
      const byteLength = bytes ? bytes.byteLength : 7 * 1024 * 1024;
      const budget =
        name === TILES
          ? 192 * 1024 * 1024
          : name === VIEWED_TILES
            ? 48 * 1024 * 1024
            : 64 * 1024 * 1024;
      const used = () => {
        let total = -(entries.get(key) || 0);
        for (const size of entries.values()) total += size;
        return total;
      };
      // 表示しただけのタイルは古い順（保存順）に消して空きを作る。
      while (
        evict &&
        entries.size &&
        (entries.size >= limit || used() + byteLength > budget)
      ) {
        const oldest = entries.keys().next().value;
        await cache.delete(oldest);
        entries.delete(oldest);
      }
      if (!entries.has(key) && entries.size >= limit)
        throw new Error("entry limit");
      if (used() + byteLength > budget) throw new Error("byte limit");
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
const detailURL = id =>
  new URL(`/rusutsu/offline-detail/${encodeURIComponent(id)}`, homeURL).href;

// 直近に開いた詳細だけ残す。残す詳細も使うタイル・画像は消さない。
// saveDetail は preparation で直列化されるので、保存中の旧ジョブと競合しない。
async function pruneDetails(currentId) {
  const meta = await caches.open(META);
  const current = detailURL(currentId);
  const manifests = [];
  for (const key of await meta.keys()) {
    const url = typeof key === "string" ? key : key.url;
    if (!new URL(url).pathname.startsWith("/rusutsu/offline-detail/")) continue;
    manifests.push({ url, entry: await (await meta.match(key)).json() });
  }
  manifests.sort((a, b) =>
    a.url === current
      ? -1
      : b.url === current
        ? 1
        : (b.entry.usedAt || 0) - (a.entry.usedAt || 0),
  );
  const kept = manifests.slice(0, RETAINED_DETAILS);
  const discarded = manifests.slice(RETAINED_DETAILS);
  if (!discarded.length) return;
  for (const { url } of discarded) await meta.delete(url);
  await writes.catch(() => {});
  for (const [name, field] of [
    [TILES, "tiles"],
    [IMAGES, "images"],
  ]) {
    const keep = new Set(kept.flatMap(({ entry }) => entry[field] || []));
    const cache = await caches.open(name);
    for (const url of new Set(
      discarded.flatMap(({ entry }) => entry[field] || []),
    )) {
      if (!keep.has(url)) {
        await cache.delete(url);
        sizes.get(name)?.delete(url);
      }
    }
  }
}

async function saveDetail(data, clientId) {
  if (views.has(clientId) && views.get(clientId) !== data.id) return;
  const key = detailURL(data.id);
  const usedAt = Date.now();
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
          usedAt,
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
  await pruneDetails(data.id);
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
  const paths = assetPaths(html);
  const cache = await caches.open(HOME);
  // 旧版は旧ビルドを消さずに溜めたため、上限で新しい資産を保存できず
  // 古い HTML が残り続けた。保存中の HTML と新しい HTML が使わない分を先に消す。
  const saved = await (await cache.match(homeURL))?.text();
  await evictUnusedBuilds(paths, saved ? assetPaths(saved) : []);
  // 起動に要る資産を保存できた HTML だけ採用する。
  await Promise.all(
    paths.map(url => cachedAsset(new Request(url), ASSETS, 600, true)),
  );
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
  await purgeOldBuild(paths);
}
const assetPaths = html =>
  [
    ...html.matchAll(/(?:src|href)="([^"]+)"/g),
    // 本体と同じ版のワーカーを保存してから HTML を採用する。
    ...html.matchAll(/<meta name="rusutsu-map-worker" content="([^"]+)"/g),
  ]
    .map(match => new URL(match[1].replaceAll("&amp;", "&"), homeURL))
    .filter(isAsset);
const buildOf = paths =>
  [...new Set(paths.filter(isBuildAsset).map(url => url.href))].sort();
// 版が同じなら何もしない（遅延読み込みの chunk を残す）。
async function evictUnusedBuilds(paths, savedPaths) {
  const previous = await (
    await (await caches.open(META)).match(buildURL)
  )?.json();
  if (JSON.stringify(previous) === JSON.stringify(buildOf(paths))) return;
  await writes.catch(() => {});
  const keep = new Set([...buildOf(paths), ...buildOf(savedPaths)]);
  const assets = await caches.open(ASSETS);
  for (const key of await assets.keys()) {
    const url = new URL(typeof key === "string" ? key : key.url);
    if (isBuildAsset(url) && !keep.has(url.href)) {
      await assets.delete(key);
      sizes.get(ASSETS)?.delete(url.href);
    }
  }
}
// 版が変わったら、新しい HTML が参照しない旧ビルドの JS/CSS を消す。
// 遅延読み込みの chunk は、開いている画面から送り直してもらう。
async function purgeOldBuild(paths) {
  const build = [
    ...new Set(paths.filter(isBuildAsset).map(url => url.href)),
  ].sort();
  const meta = await caches.open(META);
  const previous = await (await meta.match(buildURL))?.json();
  if (JSON.stringify(previous) === JSON.stringify(build)) return;
  await writes.catch(() => {});
  const keep = new Set(build);
  const assets = await caches.open(ASSETS);
  for (const key of await assets.keys()) {
    const url = new URL(typeof key === "string" ? key : key.url);
    if (isBuildAsset(url) && !keep.has(url.href)) {
      await assets.delete(key);
      sizes.get(ASSETS)?.delete(url.href);
    }
  }
  await meta.put(buildURL, new Response(JSON.stringify(build)));
  for (const client of (await self.clients.matchAll?.({ type: "window" })) ||
    [])
    client.postMessage({ type: "REWARM" });
}
// 旧版は保存済み HTML を通信より先に返すため、タブが残る端末では
// デプロイ後も古い画面と Server Action ID のまま開けなくなる。待たずに差し替える。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // 旧版のタブ別保持リストと一覧画面のタイル。今は使わない。
      caches.delete(`${PREFIX}-overview-tiles`),
      caches.open(META).then(async meta => {
        for (const key of await meta.keys()) {
          const url = typeof key === "string" ? key : key.url;
          if (new URL(url).pathname.startsWith("/rusutsu/offline-tab/"))
            await meta.delete(key);
        }
      }),
    ]).catch(() => {}),
  );
});
self.addEventListener("message", event => {
  if (
    !event.source?.url ||
    new URL(event.source.url).origin !== self.location.origin
  )
    return;
  const source = new URL(event.source.url);
  if (!isMapPath(source.pathname)) return;
  if (event.data?.type === "SET_VIEW")
    views.set(event.source.id, event.data.id);
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
        // 詳細の計画分は SAVE_DETAIL が保存する。それ以外も表示した分は残す。
        return cachedAsset(request, VIEWED_TILES, 1500);
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
    !isMapPath(url.pathname)
  )
    return;
  const network =
    self.navigator?.onLine === false
      ? Promise.reject(new TypeError("offline"))
      : fetchPublic(request);
  // イベントの寿命は同期的に延長する。CacheStorage の await 後に登録しない。
  // スキー場 URL の HTML はルートが異なるので、ホームの保存には使わない。
  if (isHomePath(url.pathname))
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
      if (!cached) return network;
      // 通信を優先し、デプロイ後に旧版の画面で起動しないようにする。
      // 圏外・サーバー障害・応答が遅いときだけ保存済みの画面を出す。
      return new Promise(resolve => {
        const timer = setTimeout(() => resolve(cached), NAVIGATION_TIMEOUT);
        network.then(
          response => {
            clearTimeout(timer);
            resolve(response.ok ? response : cached);
          },
          () => {
            clearTimeout(timer);
            resolve(cached);
          },
        );
      });
    })(),
  );
});
