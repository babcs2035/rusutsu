import { chromium, type Locator } from "playwright";
import { tqdm } from "ts-tqdm";
import { disconnectPrisma, prisma } from "@/lib/prisma";

async function trimElem(element: Locator): Promise<string> {
  return ((await element.allInnerTexts())[0] || "").trim();
}

async function main() {
  console.log("🎿 Crawling YukiMagi...");

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://majibu.jp/yukimagi/pc/shop/");
  const shopElems = await page.locator(".shop__main");
  const shopCount = await shopElems.count();

  console.log(`📦 Found ${shopCount} YukiMagi shops`);

  for (const shop_i of tqdm(shopCount)) {
    const shopElem = await shopElems.nth(shop_i);
    const name = await trimElem(shopElem.locator(".shop__heading"));
    const info = await trimElem(shopElem.locator(".shop__info"));
    const notes = await trimElem(shopElem.locator(".shop__notes"));

    await prisma.yukiMagi.upsert({
      where: { name },
      update: { info, notes },
      create: { name, info, notes },
    });
  }

  await browser.close();

  const count = await prisma.yukiMagi.count();
  console.log(`\n✅ Saved ${count} YukiMagi entries to database`);
}

export { main as runCrawlYukiMagi };

if (require.main === module) {
  main()
    .catch(e => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await disconnectPrisma();
    });
}
