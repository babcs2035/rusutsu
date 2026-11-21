import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page, webkit } from "playwright";
import { testArtifactPath } from "./testArtifacts.ts";

interface CachedDetailState {
  state: string;
  tiles: string[];
}

interface SessionHomeState {
  selectedResortId: string | null;
  selectedFeature?: unknown;
}

interface ExpandedMapState {
  tileVariant: string;
  courseColorMode: string;
  viewport: {
    center: { lat: number; lng: number };
    zoom: number;
    bearing: number;
  };
}

const outputDirectory = testArtifactPath("tab-offline");
await mkdir(outputDirectory, { recursive: true });
const browserType =
  process.env.OFFLINE_TEST_BROWSER === "webkit" ? webkit : chromium;

// 非ヘッドレス（xvfb）は WebGL を有効化するため，環境変数でヘッドレスを切替える．
const headless = process.env.OFFLINE_TEST_HEADLESS !== "false";
const browser = await browserType.launch({ headless });
const base = process.env.OFFLINE_TEST_URL ?? "http://localhost:3001/rusutsu";
const mapKey = "rusutsu:map:v1:rusutsu-resort:expanded";
// 拡大地図の viewport 保存が安定する（moveend の保存が止まる）まで待つ。
// 固定の sleep では環境差で保存前に読み取り，中間状態と再読み込み後の
// 状態が一致しなくなる。
const waitExpandedStateStable = (page: Page, key: string) =>
  page.waitForFunction((storedKey: string) => {
    const g = globalThis as {
      __expandedState?: string;
      __expandedStableAt?: number;
    };
    const value = sessionStorage.getItem(storedKey);
    if (!value) return false;
    const now = Date.now();
    if (g.__expandedState === value && now - (g.__expandedStableAt ?? 0) > 400)
      return true;
    g.__expandedState = value;
    g.__expandedStableAt = now;
    return false;
  }, key);
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  // キャッシュ制御の再現テスト用。実配信の検証時はこの環境変数を指定しない。
  if (process.env.OFFLINE_TEST_FIXTURE_TILES === "1") {
    const fixturePage = await context.newPage();
    const encoded = await fixturePage.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const drawing = canvas.getContext("2d");
      if (!drawing) throw new Error("Canvas 2D context is unavailable");
      drawing.fillStyle = "#e2e8f0";
      drawing.fillRect(0, 0, 256, 256);
      drawing.strokeStyle = "#94a3b8";
      drawing.strokeRect(1, 1, 254, 254);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    const tile = Buffer.from(encoded, "base64");
    await fixturePage.close();
    await context.route("https://cyberjapandata.gsi.go.jp/xyz/**", route =>
      route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        contentType: "image/png",
        body: tile,
      }),
    );
    console.log("Tile fixture mode: geographic imagery quality is not tested.");
  }
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${base}?resort=rusutsu-resort`);
  await page.getByRole("tab", { name: "ゲレンデ", exact: true }).waitFor();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  // 展開・他の詳細タブを一度も開かずに自動保存の完了を待つ。
  let retries = 0;
  let retryAt = 0;
  for (let i = 0; i < 450; i++) {
    await page.waitForTimeout(2000);
    const state = await page.evaluate(async () => {
      const c = await caches.open("rusutsu-map-v1-meta");
      const r = await c.match(
        `${location.origin}/rusutsu/offline-detail/rusutsu-resort`,
      );
      return r ? ((await r.json()) as CachedDetailState) : null;
    });
    if (i % 10 === 0)
      console.log(
        "saving",
        state,
        await page.evaluate(
          async () =>
            (await (await caches.open("rusutsu-map-v1-tiles")).keys()).length,
        ),
      );
    if (state?.state === "failed" && retries < 3) {
      if (Date.now() - retryAt > 20000) {
        console.log("retrying incomplete download", state);
        retryAt = Date.now();
        retries++;
        await page.evaluate(() => window.dispatchEvent(new Event("online")));
      }
      continue;
    }
    if (state && state.state !== "saving") {
      console.log("DONE", state);
      assert.equal(state.state, "complete");
      break;
    }
    if (i === 449) throw new Error("saving timeout");
  }
  const tabB = await context.newPage();
  await tabB.goto(base);
  await tabB.waitForFunction(() => sessionStorage.getItem("rusutsu:home:v1"));
  assert.equal(
    await tabB.evaluate(() => {
      const home = sessionStorage.getItem("rusutsu:home:v1");
      if (!home) throw new Error("Home state is missing");
      return (JSON.parse(home) as SessionHomeState).selectedResortId;
    }),
    null,
  );
  assert.equal(
    await page.evaluate(() => {
      const home = sessionStorage.getItem("rusutsu:home:v1");
      if (!home) throw new Error("Home state is missing");
      return (JSON.parse(home) as SessionHomeState).selectedResortId;
    }),
    "rusutsu-resort",
  );
  console.log("independent tabs OK");
  const savedDetail = await page.evaluate(async () => {
    const cache = await caches.open("rusutsu-map-v1-meta");
    const response = await cache.match(
      `${location.origin}/rusutsu/offline-detail/rusutsu-resort`,
    );
    if (!response) throw new Error("Saved detail manifest is missing");
    return (await response.json()) as CachedDetailState;
  });
  assert.equal(savedDetail.state, "complete");
  assert.ok(savedDetail.tiles.length > 0);
  const promisedTiles = new Set(savedDetail.tiles);
  const failedPromisedTiles: string[] = [];
  const servedPromisedTiles = new Set<string>();
  page.on("requestfailed", request => {
    if (
      promisedTiles.has(request.url()) &&
      request.failure()?.errorText !== "net::ERR_ABORTED"
    )
      failedPromisedTiles.push(request.url());
  });
  page.on("response", response => {
    const url = response.request().url();
    if (promisedTiles.has(url) && response.fromServiceWorker() && response.ok())
      servedPromisedTiles.add(url);
  });
  await context.unrouteAll();
  await context.setOffline(true);
  await Promise.all([
    page.waitForResponse(
      response =>
        promisedTiles.has(response.request().url()) &&
        response.fromServiceWorker() &&
        response.ok(),
    ),
    page.reload({ waitUntil: "domcontentloaded" }),
  ]);
  await page.locator('[data-map-presentation="preview"] canvas').waitFor();
  assert.ok(
    servedPromisedTiles.size > 0,
    "offline map reload must use at least one cached planned tile",
  );
  await page.getByRole("tab", { name: "料金", exact: true }).click();
  await page
    .getByRole("heading", { name: /^(公式リフト料金表|リフト券)$/ })
    .waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(
    await page
      .getByRole("tab", { name: "料金", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page
    .getByRole("heading", { name: /^(公式リフト料金表|リフト券)$/ })
    .waitFor();
  await page.getByRole("tab", { name: "天気", exact: true }).click();
  // 天気タブのサイトリンク行はキャッシュ済み詳細データから同期描画される。
  await page.locator(".weather-links").waitFor();
  await page.getByRole("tab", { name: "ゲレンデ", exact: true }).click();
  await page.getByRole("button", { name: "地図を拡大", exact: true }).click();
  await page
    .getByRole("button", { name: "地図を閉じる", exact: true })
    .waitFor();
  const canvas = page
    .locator('[data-map-presentation="expanded"] canvas')
    .first();
  await canvas.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.mouse.move(180, 330);
  await page.mouse.down();
  await page.mouse.move(215, 375, { steps: 8 });
  await page.mouse.up();
  await waitExpandedStateStable(page, mapKey);
  const before = await page.evaluate(key => {
    const value = sessionStorage.getItem(key);
    if (!value) throw new Error("Expanded map state is missing");
    return JSON.parse(value) as ExpandedMapState;
  }, mapKey);
  console.log("expanded before", before);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "地図を閉じる", exact: true })
    .waitFor();
  await waitExpandedStateStable(page, mapKey);
  const after = await page.evaluate(key => {
    const value = sessionStorage.getItem(key);
    if (!value) throw new Error("Restored map state is missing");
    return JSON.parse(value) as ExpandedMapState;
  }, mapKey);
  assert.equal(after.tileVariant, before.tileVariant);
  assert.equal(after.courseColorMode, before.courseColorMode);
  assert.ok(
    Math.abs(after.viewport.center.lat - before.viewport.center.lat) < 1e-8,
  );
  assert.ok(
    Math.abs(after.viewport.center.lng - before.viewport.center.lng) < 1e-8,
  );
  assert.ok(Math.abs(after.viewport.zoom - before.viewport.zoom) < 1e-8);
  assert.ok(Math.abs(after.viewport.bearing - before.viewport.bearing) < 1e-8);
  assert.deepEqual(failedPromisedTiles, []);
  await page.getByRole("button", { name: "地図を閉じる", exact: true }).click();
  await page.getByRole("tab", { name: "料金", exact: true }).click();
  await page
    .getByRole("heading", { name: /^(公式リフト料金表|リフト券)$/ })
    .waitFor();
  await context.setOffline(false);
  await page.waitForTimeout(2500);
  assert.equal(
    await page
      .getByRole("tab", { name: "料金", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.screenshot({
    path: path.join(outputDirectory, "restored.png"),
  });
  assert.deepEqual(errors, []);
  console.log(
    "offline reload, unopened tabs, first expansion, expanded reload, reconnect OK",
  );
  await context.setOffline(true);
  await page.getByRole("tab", { name: "ゲレンデ", exact: true }).click();
  await page.getByRole("button", { name: "詳細", exact: true }).first().click();
  await page
    .getByRole("button", { name: /の詳細$/ })
    .first()
    .click();
  await page.waitForFunction(() => {
    const home = sessionStorage.getItem("rusutsu:home:v1");
    return home
      ? Boolean((JSON.parse(home) as SessionHomeState).selectedFeature)
      : false;
  });
  const selection = await page.evaluate(() => {
    const home = sessionStorage.getItem("rusutsu:home:v1");
    if (!home) throw new Error("Home state is missing");
    return (JSON.parse(home) as SessionHomeState).selectedFeature;
  });
  await page.getByRole("button", { name: "地図を拡大", exact: true }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-map-presentation="expanded"]').waitFor();
  assert.deepEqual(
    await page.evaluate(() => {
      const home = sessionStorage.getItem("rusutsu:home:v1");
      if (!home) throw new Error("Home state is missing");
      return (JSON.parse(home) as SessionHomeState).selectedFeature;
    }),
    selection,
  );
  assert.equal(
    await page.evaluate(() =>
      sessionStorage.getItem("rusutsu:expanded:v1:rusutsu-resort"),
    ),
    "true",
  );
  assert.deepEqual(errors, []);
  console.log("selected course and expanded map restored offline OK");
} finally {
  await browser.close();
}
