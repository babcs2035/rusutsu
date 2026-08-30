import { encode } from "@auth/core/jwt";
import dotenv from "dotenv";
import { chromium } from "playwright";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const OUT =
  "/private/tmp/claude-501/-Users-kohei-workspace-rusutsu/aa69cffc-d60f-48c2-a2e3-0d310a4afe1e/scratchpad";
const PATH_ = process.argv[2] ?? "/rusutsu/admin/slope";
const TAG = process.argv[3] ?? "slope";
const COOKIE_NAME = "authjs.session-token";

// ローカル検証用のセッション。管理画面は Google ログインの裏なので、
// 同じ秘密鍵で正規の JWT を作ってブラウザに持たせる
const sessionToken = await encode({
  token: { id: "local-verify", role: "admin", sub: "local-verify" },
  secret: process.env.AUTH_SECRET,
  salt: COOKIE_NAME,
  maxAge: 60 * 30,
});

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([
  {
    name: COOKIE_NAME,
    value: sessionToken,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  },
]);
const page = await context.newPage();

const errors = [];
const failed = new Map();
page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
page.on("console", m => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("response", r => {
  if (r.status() >= 400) {
    const u = new URL(r.url());
    const k = `${r.status()} ${u.host}`;
    failed.set(k, (failed.get(k) ?? 0) + 1);
  }
});

await page.goto(`http://localhost:3000${PATH_}`, {
  waitUntil: "networkidle",
  timeout: 90000,
});
if (page.url().includes("/admin/login")) {
  console.log("STILL_ON_LOGIN");
  await browser.close();
  process.exit(1);
}
await page.waitForSelector(".maplibregl-canvas", { timeout: 40000 });
await page.waitForTimeout(4500);

const stat = () =>
  page.evaluate(() => ({
    labels: document.querySelectorAll(".resort-name-label").length,
    leaders: document.querySelectorAll(".resort-leader-line").length,
    selectedLabels: document.querySelectorAll(".resort-name-label.is-selected")
      .length,
    dimmedLabels: document.querySelectorAll(".resort-name-label.is-dimmed")
      .length,
  }));

const results = { initial: await stat() };
await page.screenshot({ path: `${OUT}/picker-${TAG}-initial.png` });

await page.fill('input[placeholder*="検索"]', "妙高");
await page.waitForTimeout(2500);
results.filtered = await stat();
await page.screenshot({ path: `${OUT}/picker-${TAG}-filtered.png` });

await page.fill('input[placeholder*="検索"]', "");
await page.waitForTimeout(1800);
await page.locator('div[role="button"]').first().click();
await page.waitForTimeout(2500);
results.selected = await stat();
await page.screenshot({ path: `${OUT}/picker-${TAG}-selected.png` });

console.log(
  JSON.stringify({ results, failed: [...failed], errors: errors.slice(0, 8) }, null, 2),
);
await browser.close();
