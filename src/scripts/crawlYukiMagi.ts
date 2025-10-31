import fs from "node:fs";
import { chromium, type Locator } from "playwright";
import { tqdm } from "ts-tqdm";

async function trimElem(element: Locator): Promise<string> {
  return ((await element.allInnerTexts())[0] || "").trim();
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto("https://majibu.jp/yukimaji/pc/shop/");
const shopElems = await page.locator(".shop__main");
const shopCount = await shopElems.count();

const shops = [];
for (const shop_i of tqdm(shopCount)) {
  const shopElem = await shopElems.nth(shop_i);
  const name = await trimElem(shopElem.locator(".shop__heading"));
  const info = await trimElem(shopElem.locator(".shop__info"));
  const notes = await trimElem(shopElem.locator(".shop__notes"));
  shops.push({ name, info, notes });
}
console.log(`Found ${shops.length} shops`);
fs.writeFileSync("../data/YukiMagi.json", JSON.stringify(shops, null, 0));

await browser.close();
