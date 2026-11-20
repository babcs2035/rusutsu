import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";

interface OverviewMapState {
  viewport: { zoom: number; center: { lat: number; lng: number } };
}

interface OverviewHomeState {
  filters: { keyword: string };
  mobileContentTab: string;
}

const outputDirectory = "src/private/data/resorts-temporary/tmp/tab-offline";
await mkdir(outputDirectory, { recursive: true });
const browserType =
  process.env.OFFLINE_TEST_BROWSER === "webkit" ? webkit : chromium;

// 非ヘッドレス（xvfb）は WebGL を有効化するため，環境変数でヘッドレスを切替える．
const headless = process.env.OFFLINE_TEST_HEADLESS !== "false";
const browser = await browserType.launch({ headless });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(
    process.env.OFFLINE_TEST_URL ?? "http://localhost:3001/rusutsu",
  );
  await page.waitForFunction(() =>
    sessionStorage.getItem("rusutsu:map:v1:overview"),
  );
  const initial = await page.evaluate(() => {
    const value = sessionStorage.getItem("rusutsu:map:v1:overview");
    if (!value) throw new Error("Overview map state was not saved");
    return JSON.parse(value) as OverviewMapState;
  });
  assert.equal(initial.viewport.zoom, 4);
  // 初期位置は検索欄の高さ分だけ上方向にオフセットされるため，緯度は
  // INITIAL_CENTER(39.28) より高くなる（コンテナ中心が保存される）．
  assert.ok(Math.abs(initial.viewport.center.lat - 40.99) < 0.05);
  await page
    .getByRole("button", { name: "スキー場を検索", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "スキー場を検索", exact: true })
    .fill("ニセコ");
  await page
    .getByRole("button", { name: "検索条件を適用", exact: true })
    .click();
  await page.waitForTimeout(2200);
  console.log(
    "buttons",
    await page
      .getByRole("button")
      .evaluateAll(els =>
        els.map(el => el.getAttribute("aria-label") || el.textContent),
      ),
  );
  const canvas = page.locator("canvas.maplibregl-canvas").first();
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(700);
  const before = await page.evaluate(() => {
    const map = sessionStorage.getItem("rusutsu:map:v1:overview");
    const home = sessionStorage.getItem("rusutsu:home:v1");
    if (!map || !home) throw new Error("Overview state was not saved");
    return {
      map: JSON.parse(map) as OverviewMapState,
      home: JSON.parse(home) as OverviewHomeState,
    };
  });
  await page.waitForFunction(
    async () =>
      !!(await (
        await caches.open("rusutsu-map-v1-home")
      ).match(`${location.origin}/rusutsu`)),
  );
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("canvas.maplibregl-canvas").waitFor();
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => {
    const map = sessionStorage.getItem("rusutsu:map:v1:overview");
    const home = sessionStorage.getItem("rusutsu:home:v1");
    if (!map || !home) throw new Error("Restored overview state is missing");
    return {
      map: JSON.parse(map) as OverviewMapState,
      home: JSON.parse(home) as OverviewHomeState,
    };
  });
  assert.equal(after.home.filters.keyword, "ニセコ");
  assert.deepEqual(after.map, before.map);
  await page.getByRole("button", { name: "リストを表示", exact: true }).click();
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const home = sessionStorage.getItem("rusutsu:home:v1");
    return home
      ? (JSON.parse(home) as OverviewHomeState).mobileContentTab === "info"
      : false;
  });
  assert.ok(
    (await page.locator('[data-ski-resort-list-item="true"]').count()) > 0,
  );
  await page.evaluate(() => {
    const home = sessionStorage.getItem("rusutsu:home:v1");
    if (!home) throw new Error("Home state was not saved");
    localStorage.setItem("rusutsu:home:v1", home);
    localStorage.setItem("slope:draft:test", "keep");
  });
  const opened = page.waitForEvent("popup");
  await page.evaluate(() => window.open("/rusutsu", "_blank"));
  const popup = await opened;
  // 新しいタブは opener の sessionStorage を作成時に継承するため，キーの
  // 存在はアプリ起動の証拠にならない。initializeTabSession が継承された画面
  // 状態をクリアした後，アプリが既定の home / map 状態を再保存するのを待って
  // から検証する。
  await popup.waitForFunction(() => {
    const home = sessionStorage.getItem("rusutsu:home:v1");
    const map = sessionStorage.getItem("rusutsu:map:v1:overview");
    return home && map
      ? (JSON.parse(home) as OverviewHomeState).filters.keyword === ""
      : false;
  });
  const fresh = await popup.evaluate(() => {
    const home = sessionStorage.getItem("rusutsu:home:v1");
    const map = sessionStorage.getItem("rusutsu:map:v1:overview");
    if (!home || !map) throw new Error("Fresh tab state is missing");
    return {
      home: JSON.parse(home) as OverviewHomeState,
      map: JSON.parse(map) as OverviewMapState,
      legacy: localStorage.getItem("rusutsu:home:v1"),
      draft: localStorage.getItem("slope:draft:test"),
    };
  });
  assert.equal(fresh.home.filters.keyword, "");
  assert.equal(fresh.home.mobileContentTab, "map");
  assert.equal(fresh.map.viewport.zoom, 4);
  assert.equal(fresh.legacy, null);
  assert.equal(fresh.draft, "keep");
  assert.equal(
    await page.evaluate(() => {
      const home = sessionStorage.getItem("rusutsu:home:v1");
      if (!home) throw new Error("Home state is missing");
      return (JSON.parse(home) as OverviewHomeState).filters.keyword;
    }),
    "ニセコ",
  );
  assert.deepEqual(errors, []);
  console.log("overview camera, filters, list and offline reload OK");
} finally {
  await browser.close();
}
