import { chromium } from "playwright";

const OUT = "/private/tmp/claude-501/-Users-kohei-workspace-rusutsu/aa69cffc-d60f-48c2-a2e3-0d310a4afe1e/scratchpad";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const failed = new Map();
const errors = [];
page.on("response", r => {
  if (r.status() >= 400) {
    const u = new URL(r.url());
    failed.set(u.host, (failed.get(u.host) ?? 0) + 1);
  }
});
page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));

await page.goto("http://localhost:3000/rusutsu", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector(".maplibregl-canvas", { timeout: 30000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/home-initial.png` });

// 検索してスキー場へ寄る（searchViewport 経路 + ラベル表示を一度に確認）
await page.fill('input[placeholder="スキー場名を入力"]', "ルスツ");
await page.waitForTimeout(1200);
await page.keyboard.press("Enter");
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/home-search.png` });

const afterSearch = await page.evaluate(() => ({
  labels: document.querySelectorAll(".resort-name-label").length,
  leaders: document.querySelectorAll(".resort-leader-line").length,
  markers: document.querySelectorAll(".maplibregl-marker").length,
  lineLabels: document.querySelectorAll(".finalized-line-label").length,
}));

console.log(JSON.stringify({ afterSearch, failed: [...failed], errors }, null, 2));
await browser.close();
