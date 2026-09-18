import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const outputDirectory = "src/private/data/resorts-temporary/tmp/tab-offline";
await mkdir(outputDirectory, { recursive: true });
const browserType =
  process.env.OFFLINE_TEST_BROWSER === "webkit" ? webkit : chromium;

import assert from "node:assert/strict";

const browser = await browserType.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(
    process.env.OFFLINE_TEST_URL ?? "http://localhost:3001/rusutsu",
  );
  await page.waitForFunction(() =>
    sessionStorage.getItem("rusutsu:map:v1:overview"),
  );
  const initial = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("rusutsu:map:v1:overview")),
  );
  assert.equal(initial.viewport.zoom, 4);
  assert.ok(Math.abs(initial.viewport.center.lat - 39.28) < 1e-5);
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
  const before = await page.evaluate(() => ({
    map: JSON.parse(sessionStorage.getItem("rusutsu:map:v1:overview")),
    home: JSON.parse(sessionStorage.getItem("rusutsu:home:v1")),
  }));
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
  const after = await page.evaluate(() => ({
    map: JSON.parse(sessionStorage.getItem("rusutsu:map:v1:overview")),
    home: JSON.parse(sessionStorage.getItem("rusutsu:home:v1")),
  }));
  assert.equal(after.home.filters.keyword, "ニセコ");
  assert.deepEqual(after.map, before.map);
  await page.getByRole("button", { name: "リストを表示", exact: true }).click();
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      JSON.parse(sessionStorage.getItem("rusutsu:home:v1")).mobileContentTab ===
      "info",
  );
  assert.ok(
    (await page.locator('[data-ski-resort-list-item="true"]').count()) > 0,
  );
  await page.evaluate(() => {
    localStorage.setItem(
      "rusutsu:home:v1",
      sessionStorage.getItem("rusutsu:home:v1"),
    );
    localStorage.setItem("slope:draft:test", "keep");
  });
  const opened = page.waitForEvent("popup");
  await page.evaluate(() => window.open("/rusutsu", "_blank"));
  const popup = await opened;
  await popup.waitForFunction(() =>
    sessionStorage.getItem("rusutsu:map:v1:overview"),
  );
  const fresh = await popup.evaluate(() => ({
    home: JSON.parse(sessionStorage.getItem("rusutsu:home:v1")),
    map: JSON.parse(sessionStorage.getItem("rusutsu:map:v1:overview")),
    legacy: localStorage.getItem("rusutsu:home:v1"),
    draft: localStorage.getItem("slope:draft:test"),
  }));
  assert.equal(fresh.home.filters.keyword, "");
  assert.equal(fresh.home.mobileContentTab, "map");
  assert.equal(fresh.map.viewport.zoom, 4);
  assert.equal(fresh.legacy, null);
  assert.equal(fresh.draft, "keep");
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("rusutsu:home:v1")).filters.keyword,
    ),
    "ニセコ",
  );
  assert.deepEqual(errors, []);
  console.log("overview camera, filters, list and offline reload OK");
} finally {
  await browser.close();
}
