/* 閲覧済みの公開地図専用。管理画面、認証、API、Server Action はキャッシュしない。 */
const PREFIX = "rusutsu-map-v1";
const HOME = `${PREFIX}-home`;
const ASSETS = `${PREFIX}-assets`;
const TILES = `${PREFIX}-tiles`;
const ROOT = "/rusutsu/";
const homeURL = new URL("/rusutsu", self.location.origin).href;
const isAsset = url => url.origin === self.location.origin && (
  url.pathname.startsWith("/rusutsu/_next/static/") ||
  /^\/rusutsu\/maplibre\/[\w.-]+\.mjs$/.test(url.pathname)
);
const isTile = url => url.origin === "https://cyberjapandata.gsi.go.jp" && /^\/xyz\/(pale|seamlessphoto)\/\d+\/\d+\/\d+\.(png|jpg)$/.test(url.pathname);
let writes = Promise.resolve();
function saveBounded(name, request, response, limit) {
  if (!response.ok || response.type === "opaque") return Promise.resolve();
  // 書き込みと削除を直列化し、同時タイル取得で上限が膨らまないようにする。
  writes = writes.catch(() => {}).then(async () => {
    const cache = await caches.open(name);
    await cache.put(request, response);
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key);
  });
  return writes.catch(() => {});
}
async function cachedAsset(request, name, limit) {
  let cached;
  try { cached = await (await caches.open(name)).match(request); } catch { /* 保存禁止でも通信を続ける。 */ }
  if (cached) return cached;
  const response = await fetch(request);
  await saveBounded(name, request, response.clone(), limit);
  return response;
}
async function saveHome(response) {
  if (!response.ok || response.redirected || !response.headers.get("content-type")?.includes("text/html")) return;
  const html = await response.clone().text();
  const paths = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => new URL(match[1].replaceAll("&amp;", "&"), homeURL)).filter(isAsset);
  // ワーカーはページ外から取得されるので、起動資産として明示的に保存する。
  paths.push(new URL("/rusutsu/maplibre/maplibre-gl-worker.mjs", homeURL));
  // 起動に要る資産を保存できた HTML だけ採用する。
  await Promise.all(paths.map(url => cachedAsset(new Request(url), ASSETS, 600)));
  const cache = await caches.open(HOME);
  // 保存するのは展開済み HTML。通信時の圧縮・長さ・RSC 用 Vary を持ち越さない。
  const headers = new Headers(response.headers);
  for (const name of ["content-encoding", "content-length", "transfer-encoding", "vary"]) headers.delete(name);
  await cache.put(homeURL, new Response(html, { status: 200, headers }));
}
self.addEventListener("activate", event => {
  // 更新時は既存タブが閉じるまで待つ（skipWaiting で実行中の版を差し替えない）。
  event.waitUntil(self.clients.claim());
});
self.addEventListener("message", event => {
  if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
  if (event.data?.type === "SAVE_HOME") {
    event.waitUntil(fetch(homeURL, { credentials: "omit" }).then(saveHome).catch(() => {}));
  }
  if (event.data?.type === "WARM_MAP" && Array.isArray(event.data.assets)) {
    event.waitUntil(Promise.allSettled(event.data.assets.slice(0, 200).filter(value => typeof value === "string").map(value => {
      const url = new URL(value, homeURL);
      if (isAsset(url)) return cachedAsset(new Request(url), ASSETS, 600);
      if (isTile(url)) return cachedAsset(new Request(url, { mode: "cors" }), TILES, 400);
      return undefined;
    })));
  }
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (isAsset(url)) { event.respondWith(cachedAsset(request, ASSETS, 600)); return; }
  if (isTile(url)) { event.respondWith(cachedAsset(request, TILES, 400)); return; }
  if (request.mode !== "navigate" || url.origin !== self.location.origin || !["/rusutsu", ROOT].includes(url.pathname)) return;
  const network = self.navigator?.onLine === false
    ? Promise.reject(new TypeError("offline"))
    : fetch(request);
  // イベントの寿命は同期的に延長する。CacheStorage の await 後に登録しない。
  event.waitUntil(network.then(response => saveHome(response.clone())).catch(() => {}));
  event.respondWith((async () => {
    let cached;
    try { cached = await (await caches.open(HOME)).match(homeURL); } catch { /* 保存禁止でも通信を続ける。 */ }
    const usableNetwork = network.then(response => !response.ok && cached ? cached : response);
    if (!cached) return usableNetwork;
    // 弱い回線でも最初の画面を待たせない。通信は裏で継続する。
    let timer;
    try {
      return await Promise.race([usableNetwork, new Promise(resolve => { timer = setTimeout(() => resolve(cached), 2500); })]);
    } catch { return cached; }
    finally { clearTimeout(timer); }
  })());
});
