import { chromium, type Locator } from "playwright";
import { tqdm } from "ts-tqdm";
import { disconnectPrisma, prisma } from "@/lib/prisma";

/**
 * 雪マジの施設名と既存データベースのスキー場名が異なる場合の変換辞書
 */
import skiAreaNameDictJson from "../data/SkiAreaNameDict.json";

/**
 * 雪マジの施設名と既存データベースのスキー場名が異なる場合の変換辞書
 */
const skiAreaNameDict: Record<string, string> = skiAreaNameDictJson;

/**
 * 文字列を正規化してマッチングしやすくする
 */
function normalizeName(name: string): string {
  return name
    .replace(/\s+/g, "")
    .replace(/[！-～]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/スキー場$/, "")
    .replace(/スノーパーク$/, "")
    .replace(/スキーリゾート$/, "")
    .replace(/リゾート$/, "");
}

/**
 * 雪マジデータとスキー場データの紐付けを実行
 */
async function runMapYukiMagi() {
  console.log("🔗 Mapping YukiMagi data to SkiResorts...");

  const skiResorts = await prisma.skiResort.findMany();
  const yukiMagiClusters = await prisma.yukiMagi.findMany();

  console.log(
    `Found ${skiResorts.length} SkiResorts and ${yukiMagiClusters.length} YukiMagi entries.`,
  );

  let matchCount = 0;
  let skippedCount = 0;

  for (const resort of tqdm(skiResorts)) {
    let yukiMagi = yukiMagiClusters.find(y => y.name === resort.nameJa);

    if (!yukiMagi && skiAreaNameDict[resort.nameJa]) {
      const targetName = skiAreaNameDict[resort.nameJa];
      yukiMagi = yukiMagiClusters.find(y => y.name === targetName);
    }

    if (!yukiMagi) {
      const normResort = normalizeName(resort.nameJa);
      yukiMagi = yukiMagiClusters.find(
        y => normalizeName(y.name) === normResort,
      );
    }

    if (yukiMagi) {
      await prisma.skiResort.update({
        where: { id: resort.id },
        data: {
          yukiMagiId: yukiMagi.id,
        },
      });
      matchCount++;
    } else {
      await prisma.skiResort.update({
        where: { id: resort.id },
        data: {
          yukiMagiId: null,
        },
      });
      skippedCount++;
    }
  }

  console.log(
    `\n✅ Mapping complete! (Matched: ${matchCount}, Not Matched: ${skippedCount})`,
  );
}

async function trimElem(element: Locator): Promise<string> {
  const texts = await element.allInnerTexts();
  return (texts[0] || "").trim();
}

async function main() {
  console.log("🎿 Crawling YukiMagi...");

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. 一覧ページから基本情報を収集
  await page.goto("https://majibu.jp/pickup/yukimaji/place.html");

  try {
    await page.waitForSelector(".js-accordion-trigger", {
      state: "attached",
      timeout: 10000,
    });
  } catch (_e) {
    console.log("Timeline: Timeout waiting for accordion triggers");
  }

  const triggers = await page.locator(".js-accordion-trigger").all();
  console.log(`Found ${triggers.length} triggers.`);

  for (const trigger of triggers) {
    const classAttr = (await trigger.getAttribute("class")) || "";
    if (!classAttr.includes("is-open")) {
      try {
        if (await trigger.isVisible()) {
          await trigger.click();
          await page.waitForTimeout(300);
        }
      } catch (e) {
        console.log("Trigger click failed:", e);
      }
    }
  }

  await page.waitForTimeout(2000);

  const shopItems = await page.locator(".place-list__item").all();
  const shopsToCrawl: { name: string; tag: string; href: string }[] = [];

  console.log(
    `📦 Found ${shopItems.length} items in list. Extracting links...`,
  );

  for (const item of shopItems) {
    const link = item.locator("a.place-link");
    if ((await link.count()) === 0) continue;

    const name = await trimElem(link.locator(".place-link__name"));
    const tag = await trimElem(link.locator(".place-link__tag"));
    const href = await link.getAttribute("href");

    if (name && href) {
      shopsToCrawl.push({ name, tag, href });
    }
  }

  console.log(
    `📦 Extracted ${shopsToCrawl.length} valid shops. Starting detail crawl...`,
  );
  await page.close();

  // 2. 各詳細ページを巡回
  for (const shop of tqdm(shopsToCrawl)) {
    const detailPage = await context.newPage();
    try {
      await detailPage.goto(shop.href);

      const details = await detailPage.locator(".detail__item").all();
      let benefit: string | null = null;
      let period: string | null = null;
      let exclusionDate: string | null = null;

      for (const detail of details) {
        const titleElem = detail.locator(".item__title");
        const contentElem = detail.locator(".item__content");

        if ((await titleElem.count()) === 0) continue;

        const title = await titleElem.innerText();
        const content = await contentElem.innerText();

        if (title.includes("特典内容")) benefit = content.trim();
        else if (title.includes("対象期間")) period = content.trim();
        else if (title.includes("除外日")) exclusionDate = content.trim();
      }

      await prisma.yukiMagi.upsert({
        where: { name: shop.name },
        update: {
          tag: shop.tag,
          url: shop.href,
          benefit,
          period,
          exclusionDate,
        },
        create: {
          name: shop.name,
          tag: shop.tag,
          url: shop.href,
          benefit,
          period,
          exclusionDate,
        },
      });
    } catch (e) {
      console.error(`⚠️ Error crawling ${shop.name} (${shop.href}):`, e);
    } finally {
      await detailPage.close();
    }
  }

  await browser.close();

  // 3. スキー場データとの紐付けを実行
  await runMapYukiMagi();

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
