import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const outputDirectory = "src/private/data/resorts-temporary/tmp/tab-offline";
await mkdir(outputDirectory, { recursive: true });
const browserType =
  process.env.OFFLINE_TEST_BROWSER === "webkit" ? webkit : chromium;

import assert from "node:assert/strict";

const browser = await browserType.launch({ headless: true });
const base = process.env.OFFLINE_TEST_URL ?? "http://localhost:3001/rusutsu";
const mapKey = "rusutsu:map:v1:rusutsu-resort:expanded";
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
      drawing.fillStyle = "#e2e8f0";
      drawing.fillRect(0, 0, 256, 256);
      drawing.strokeStyle = "#94a3b8";
      drawing.strokeRect(1, 1, 254, 254);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    const tile = Buffer.from(encoded, "base64");
    await fixturePage.close();
    await context.route("https://cyberjapandata.gsi.go.jp/xyz/**", route =>
      route.fulfill({ status: 200, contentType: "image/png", body: tile }),
    );
    console.log("Tile fixture mode: geographic imagery quality is not tested.");
  }
  const page = await context.newPage();
  const errors = [];
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
      return r ? await r.json() : null;
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
    await tabB.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("rusutsu:home:v1")).selectedResortId,
    ),
    null,
  );
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("rusutsu:home:v1")).selectedResortId,
    ),
    "rusutsu-resort",
  );
  console.log("independent tabs OK");
  const failedTiles = [];
  page.on("requestfailed", request => {
    if (
      /cyberjapandata\.gsi\.go\.jp\/xyz\/[^/]+\/(1[1-7])\//.test(request.url())
    )
      failedTiles.push(request.url());
  });
  await context.unrouteAll();
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
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
  await page.getByText("リンク一覧", { exact: true }).waitFor();
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
  await page.waitForTimeout(1800);
  const before = await page.evaluate(
    key => JSON.parse(sessionStorage.getItem(key)),
    mapKey,
  );
  console.log("expanded before", before);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "地図を閉じる", exact: true })
    .waitFor();
  await page.waitForTimeout(2000);
  const after = await page.evaluate(
    key => JSON.parse(sessionStorage.getItem(key)),
    mapKey,
  );
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
  assert.deepEqual(failedTiles, []);
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
    path: "src/private/data/resorts-temporary/tmp/tab-offline/restored.png",
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
  await page.waitForFunction(
    () => JSON.parse(sessionStorage.getItem("rusutsu:home:v1")).selectedFeature,
  );
  const selection = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("rusutsu:home:v1")).selectedFeature,
  );
  await page.getByRole("button", { name: "地図を拡大", exact: true }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-map-presentation="expanded"]').waitFor();
  assert.deepEqual(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("rusutsu:home:v1")).selectedFeature,
    ),
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
