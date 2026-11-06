import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { type Browser, chromium, type Route } from "playwright";
import sharp from "sharp";
import {
  hasOsmMap,
  hasShareMap,
  SHARE_IMAGE_HEIGHT,
  SHARE_IMAGE_VERSION,
  SHARE_IMAGE_WIDTH,
  SHARE_MAP_SIZES,
  type ShareMapSize,
} from "@/features/share/mapCard";
import type { ShareResort } from "./data";
import { shareImageOverlay, shareImageSlots } from "./imageLayout";

const cacheRoot = () =>
  path.resolve(
    process.env.SHARE_IMAGE_CACHE_ROOT ||
      "src/private/data/resorts-temporary/tmp/share-images",
  );
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
const inflight = new Map<string, Promise<Buffer>>();
let queue: Promise<unknown> = Promise.resolve();
let queued = 0;
const MAX_QUEUED = 12;
const PHOTO_PREFIX = "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/";
// 一覧の営業集計・料金の有無などは地図画像の版に含めない。
const mapVersion = ({ resort, mapData }: ShareResort) => ({
  id: resort.id,
  name: resort.nameJa,
  latitude: resort.latitude,
  longitude: resort.longitude,
  mapData,
});
let photoRequests = 0;
const photoWaiters: Array<() => void> = [];
async function fetchPhoto(url: string) {
  if (photoRequests >= 4)
    await new Promise<void>(resolve => photoWaiters.push(resolve));
  else photoRequests++;
  try {
    return await fetch(url, { signal: AbortSignal.timeout(12000) });
  } finally {
    const next = photoWaiters.shift();
    if (next) next();
    else photoRequests--;
  }
}

function renderOrigin() {
  const origin = new URL(
    process.env.SHARE_RENDER_ORIGIN ||
      `http://127.0.0.1:${process.env.PORT || "3000"}`,
  );
  // サーバー自身だけを描画する。リクエストのHostや任意の外部URLを使わない。
  if (!["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname))
    throw new Error("SHARE_RENDER_ORIGIN must be loopback");
  return origin.origin;
}

async function cached(filename: string) {
  try {
    return await readFile(path.join(cacheRoot(), filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
async function save(filename: string, bytes: Buffer) {
  await mkdir(cacheRoot(), { recursive: true });
  const temporary = path.join(cacheRoot(), `${filename}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, path.join(cacheRoot(), filename));
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

/** 保存済み素材は30日保持。キャッシュの版が増え続けないよう上限も設ける。 */
async function prune() {
  const files = await readdir(cacheRoot());
  const entries = await Promise.all(
    files
      .filter(f => f.endsWith(".png") || f.endsWith(".jpg"))
      .map(async filename => ({
        filename,
        info: await stat(path.join(cacheRoot(), filename)).catch(() => null),
      })),
  );
  entries.sort((a, b) => (b.info?.mtimeMs ?? 0) - (a.info?.mtimeMs ?? 0));
  await Promise.all(
    entries
      .filter(
        (entry, i) =>
          i >= 10000 ||
          (entry.info?.mtimeMs ?? 0) < Date.now() - 30 * 86400_000,
      )
      .map(entry =>
        unlink(path.join(cacheRoot(), entry.filename)).catch(() => undefined),
      ),
  );
}

/** z13以下でも衛星画像へ切り替えず、z14の航空写真から縮小タイルを作る。 */
async function photoTile(url: string, tiles: Map<string, Promise<Buffer>>) {
  const match =
    /^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/seamlessphoto\/(\d+)\/(\d+)\/(\d+)\.jpg$/.exec(
      url,
    );
  if (!match) throw new Error("unsupported photo tile");
  const [z, x, y] = match.slice(1).map(Number);
  const lon = ((x + 0.5) / 2 ** z) * 360 - 180;
  const lat =
    (Math.atan(Math.sinh(Math.PI * (1 - 2 * ((y + 0.5) / 2 ** z)))) * 180) /
    Math.PI;
  if (z < 9 || z > 18 || lon < 128 || lon > 147 || lat < 30 || lat > 47)
    throw new Error("photo outside ski resort coverage");
  // MapLibreが読込中に要求する低倍率の親タイルは写真として使わない。
  // 最終viewportは出力画面側でも検証し、z11以上の素材が揃うまで撮影しない。
  if (z < 11)
    return sharp({
      create: { width: 256, height: 256, channels: 3, background: "#c9ced4" },
    })
      .jpeg()
      .toBuffer();
  const fetchTile = (tileUrl: string): Promise<Buffer> => {
    const previous = tiles.get(tileUrl);
    if (previous) return previous;
    const pending = (async () => {
      const key = `photo-${digest(tileUrl)}.jpg`;
      // 写真の取得は生成に必要な範囲だけ。1週間で再取得する。
      const location = path.join(cacheRoot(), key);
      const info = await stat(location).catch(() => null);
      if (info && info.mtimeMs > Date.now() - 7 * 86400_000)
        return readFile(location);
      const response = await fetchPhoto(tileUrl);
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("image/")
      )
        throw new Error(`photo HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 2 * 1024 * 1024) throw new Error("photo too large");
      await save(key, bytes);
      return bytes;
    })();
    tiles.set(tileUrl, pending);
    return pending;
  };
  if (z >= 14) return fetchTile(url);
  const factor = 2 ** (14 - z);
  const layers = [];
  // 各モザイクは直列化し、全体の同時取得も4件に制限する。
  for (let dy = 0; dy < factor; dy++) {
    for (let dx = 0; dx < factor; dx++) {
      layers.push({
        input: await fetchTile(
          `${PHOTO_PREFIX}14/${x * factor + dx}/${y * factor + dy}.jpg`,
        ),
        left: dx * 256,
        top: dy * 256,
      });
    }
  }
  const mosaic = await sharp({
    create: {
      width: 256 * factor,
      height: 256 * factor,
      channels: 3,
      background: "#e5eaf0",
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
  return sharp(mosaic).resize(256, 256).jpeg({ quality: 86 }).toBuffer();
}

async function captureMap(
  browser: Browser,
  data: ShareResort,
  size: ShareMapSize,
  tiles: Map<string, Promise<Buffer>>,
) {
  // 写真側にも更新周期を持たせる。営業状態は素材キーに入れない。
  const filename = `map-${digest([SHARE_IMAGE_VERSION, Math.floor(Date.now() / (7 * 86400_000)), mapVersion(data), size])}.png`;
  const previous = await cached(filename);
  if (previous) return previous;
  const page = await browser.newPage({
    viewport: SHARE_MAP_SIZES[size],
    deviceScaleFactor: 1,
  });
  const origin = renderOrigin();
  let failedPhoto = false;
  let successfulPhotos = 0;
  await page.route("**/*", async (route: Route) => {
    const url = route.request().url();
    if (url.startsWith(PHOTO_PREFIX)) {
      try {
        const body = await photoTile(url, tiles);
        const zoom = Number(url.slice(PHOTO_PREFIX.length).split("/")[0]);
        if (zoom >= 11) successfulPhotos++;
        await route.fulfill({
          status: 200,
          contentType: "image/jpeg",
          body,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      } catch (error) {
        console.warn("共有画像の写真タイル取得失敗", url, error);
        failedPhoto = true;
        await route.abort().catch(() => undefined);
      }
    } else if (
      url.startsWith(`${origin}/`) ||
      url.startsWith("data:") ||
      url.startsWith("blob:")
    )
      await route.continue();
    else await route.abort();
  });
  try {
    await page.goto(
      `${origin}/rusutsu/share-map/${data.resort.id}?size=${size}`,
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
    await page
      .locator('[data-share-map-ready="true"]')
      .waitFor({ timeout: 25000 });
    await page.evaluate(() => document.fonts.ready);
    if (hasShareMap(data.mapData) && (!successfulPhotos || failedPhoto))
      throw new Error("share photography not fully loaded");
    const bytes = await page
      .locator("[data-share-map]")
      .screenshot({ type: "png", animations: "disabled", timeout: 10000 });
    await save(filename, bytes);
    return bytes;
  } finally {
    await page.close();
  }
}

export async function createShareImage(
  data: ShareResort[],
  total: number,
  comparison: boolean,
) {
  const key = digest([
    SHARE_IMAGE_VERSION,
    Math.floor(Date.now() / (7 * 86400_000)),
    data.map(mapVersion),
    total,
    comparison,
  ]);
  const filename = `card-${key}.png`;
  const previous = await cached(filename);
  if (previous) return previous;
  const running = inflight.get(key);
  if (running) return running;
  if (queued >= MAX_QUEUED) throw new Error("share image queue full");
  queued++;
  const result = queue.then(async () => {
    const existing = await cached(filename);
    if (existing) return existing;
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-dev-shm-usage",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    });
    try {
      const slots = shareImageSlots(data.length);
      const layers = [];
      const tiles = new Map<string, Promise<Buffer>>();
      for (const [i, item] of data.entries()) {
        layers.push({
          input: await captureMap(browser, item, slots[i].size, tiles),
          left: slots[i].left,
          top: slots[i].top,
        });
      }
      layers.push({
        input: shareImageOverlay(
          data.map(d => d.resort.nameJa),
          total,
          data.some(d => hasOsmMap(d.mapData)),
          comparison,
          data.some(d => hasShareMap(d.mapData)),
        ),
        left: 0,
        top: 0,
      });
      const bytes = await sharp({
        create: {
          width: SHARE_IMAGE_WIDTH,
          height: SHARE_IMAGE_HEIGHT,
          channels: 3,
          background: "#f8fafc",
        },
      })
        .composite(layers)
        .png()
        .toBuffer();
      await save(filename, bytes);
      await prune().catch(() => undefined);
      return bytes;
    } finally {
      await browser.close();
    }
  });
  queue = result.catch(() => undefined);
  inflight.set(key, result);
  try {
    return await result;
  } finally {
    inflight.delete(key);
    queued--;
  }
}
