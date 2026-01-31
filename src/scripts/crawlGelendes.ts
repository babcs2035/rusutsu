import { chromium, type Locator } from "playwright";
import { tqdm } from "ts-tqdm";
import SurfSnowDict from "@/data/SurfSnowDict.json";
import { disconnectPrisma, prisma } from "@/lib/prisma";

/**
 * 要素内のテキストを取得し，前後の空白を削除するヘルパー関数．
 */
async function trimElem(element: Locator): Promise<string> {
  return ((await element.allInnerTexts())[0] || "").trim();
}

/**
 * 文字列から数字以外の文字を削除するヘルパー関数．
 */
function removeSymbols(str: string): string {
  return str.replace(/\D/g, "");
}

/**
 * 文字列を数値に変換する．空文字列の場合は null を返す．
 */
function StrToNum(str: string): number | null {
  return removeSymbols(str) === "" ? null : Number(removeSymbols(str));
}

async function main() {
  console.log("🏔️ Starting Surf&Snow crawler...");

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Surf&Snow のスキー場一覧ページを開く．
  await page.goto(
    "https://surfsnow.jp/search/list/spl_area01.php?key=&sort=initial",
  );

  // 全リゾート数を取得する．
  const totalResultNum = Number(
    await trimElem(
      await page.locator(
        "#main_result > div.order > div > div > dl:nth-child(1) > dd > big",
      ),
    ),
  );

  console.log(`📦 Found ${totalResultNum} resorts to crawl.`);

  // データベースから既存のスキー場一覧を取得する．
  const existingResorts = await prisma.skiResort.findMany({
    select: { id: true, nameJa: true, sources: true },
  });

  // Snow Japan 名 -> Surf&Snow 名の辞書から，Surf&Snow 名 -> Snow Japan 名への逆引きマップを作成する．
  const ssNameToSjNameMap = Object.entries(SurfSnowDict).reduce(
    (acc, [sjName, ssName]) => {
      if (ssName) acc[ssName] = sjName;
      return acc;
    },
    {} as Record<string, string>,
  );

  let resultElems = await page.locator(".list_result");

  // 一覧ページをページネーションしながら巡回する．
  for (const total_i of tqdm(totalResultNum)) {
    const page_i = Math.floor(total_i / 20) + 1;

    try {
      const resultElem = await resultElems.nth(total_i % 20);
      const nameElem = await resultElem.locator("h2").locator("a");
      const name = await trimElem(nameElem);

      if (name === "") continue;

      // 辞書を用いてスキー場名を正規化（Surf&Snow 名 -> Snow Japan 名）する．
      // 辞書にヒットすればその名前（Snow Japan 名）を使用し，ヒットしなければ元の名前を使用する．
      const normalizedName = ssNameToSjNameMap[name] || name;

      // データベース上の名前とマッチングする．
      const matchingResort = existingResorts.find(
        r =>
          r.nameJa === normalizedName ||
          r.nameJa.includes(normalizedName) ||
          normalizedName.includes(r.nameJa),
      );

      // マッチしないリゾートはスキップする．
      if (!matchingResort) continue;

      // 詳細ページを新しいタブで開く．
      const [detailPage] = await Promise.all([
        context.waitForEvent("page"),
        nameElem.click(),
      ]);
      const currentUrl = await detailPage.url();
      await detailPage.goto(currentUrl);

      if ((await detailPage.title()) !== "404 Not Found - SURF&SNOW") {
        // 画像 URL を収集する．
        const images: string[] = [];
        const imageElems = await detailPage.locator(".sp-image");
        for (let i = 0; i < (await imageElems.count()); i++) {
          const src = await imageElems.nth(i).getAttribute("src");
          if (src) images.push(src);
        }

        // 基本情報（概要，天気状況，レビューなど）を取得する．
        const shortDesc = await trimElem(
          await detailPage.locator(".section_info").nth(0).locator("h3"),
        );
        const longDesc = await trimElem(
          await detailPage.locator(".section_info").nth(0).locator("p"),
        );
        const condition = (
          await trimElem(
            await detailPage.locator(
              "#content_main > table.weather_infoBox > tbody > tr:nth-child(2) > td:nth-child(1)",
            ),
          )
        )
          .split("\n")
          .slice(0, -1)
          .join("");
        const status = await trimElem(
          await detailPage.locator(
            "#content_main > table.weather_infoBox > tbody > tr:nth-child(3) > td.bottom > em",
          ),
        );
        const review = Number(
          await trimElem(
            await detailPage.locator(
              "#content_main > table.section_voice > tbody > tr:nth-child(1) > th.total > p > em",
            ),
          ),
        );

        const newSources = Array.from(
          new Set([...(matchingResort.sources || []), currentUrl]),
        );

        // スキー場情報を更新する．
        await prisma.skiResort.update({
          where: { id: matchingResort.id },
          data: {
            descriptionShort: shortDesc,
            descriptionLong: longDesc,
            outlineImages: images,
            condition,
            status,
            review: Number.isNaN(review) ? null : review,
            sources: newSources,
          },
        });

        // コース詳細ページに移動する．
        await detailPage.goto(
          (await detailPage.url()).replace("s.htm", "gc1.htm"),
        );

        if (
          (await detailPage.title()) !== "404 Not Found - SURF&SNOW" &&
          (await trimElem(await detailPage.locator("#ContentsWrap"))) !==
            "※現在コース情報はございません。"
        ) {
          // 既存のコースとリフト情報を削除する．
          await prisma.course.deleteMany({
            where: { skiResortId: matchingResort.id },
          });
          await prisma.lift.deleteMany({
            where: { skiResortId: matchingResort.id },
          });

          // コース情報を取得し保存する．
          const courseElems = await detailPage.locator("#course").locator("tr");
          for (
            let course_i = 1;
            course_i < (await courseElems.count());
            course_i += 2
          ) {
            const courseElem = await courseElems.nth(course_i);
            await prisma.course.create({
              data: {
                skiResortId: matchingResort.id,
                name: await trimElem(
                  await courseElem.locator("td:nth-child(2)"),
                ),
                snowboard: await trimElem(
                  await courseElem.locator("td:nth-child(3)"),
                ),
                difficulty: await trimElem(
                  await courseElem.locator("td:nth-child(4)"),
                ),
                distance: StrToNum(
                  await trimElem(await courseElem.locator("td:nth-child(5)")),
                ),
                angle: StrToNum(
                  await trimElem(await courseElem.locator("td:nth-child(6)")),
                ),
                note: await trimElem(await courseElems.nth(course_i + 1)),
              },
            });
          }

          // リフト情報を取得し保存する．
          const liftElems = await detailPage.locator("#Lift").locator("tr");
          for (let lift_i = 1; lift_i < (await liftElems.count()); lift_i++) {
            const liftElem = await liftElems.nth(lift_i);
            await prisma.lift.create({
              data: {
                skiResortId: matchingResort.id,
                name: await trimElem(await liftElem.locator("td:nth-child(2)")),
                type: await trimElem(await liftElem.locator("td:nth-child(3)")),
                distance: StrToNum(
                  await trimElem(await liftElem.locator("td:nth-child(4)")),
                ),
                hood: await trimElem(await liftElem.locator("td:nth-child(5)")),
              },
            });
          }

          // コースタイプ（圧雪，非圧雪など）と斜度情報を更新する．
          const typeNotPressed = StrToNum(
            await trimElem(
              await detailPage.locator(
                "#Courses > tbody > tr:nth-child(2) > th.level01",
              ),
            ),
          );
          const typePressed = StrToNum(
            await trimElem(
              await detailPage.locator(
                "#Courses > tbody > tr:nth-child(2) > th.level02",
              ),
            ),
          );
          const typeBump = StrToNum(
            await trimElem(
              await detailPage.locator(
                "#Courses > tbody > tr:nth-child(2) > th.level03",
              ),
            ),
          );
          const angleMax = StrToNum(
            await trimElem(
              await detailPage
                .locator("dt:has-text('最大斜度')")
                .locator("xpath=following-sibling::dd[1]"),
            ),
          );
          const angleAvg = StrToNum(
            await trimElem(
              await detailPage
                .locator("dt:has-text('平均斜度')")
                .locator("xpath=following-sibling::dd[1]"),
            ),
          );
          const liftCapacity = StrToNum(
            await trimElem(
              await detailPage
                .locator("dt:has-text('リフト運送能力')")
                .locator("xpath=following-sibling::dd[1]"),
            ),
          );

          await prisma.skiResort.update({
            where: { id: matchingResort.id },
            data: {
              typeNotPressed,
              typePressed,
              typeBump,
              angleMax,
              angleAvg,
              liftCapacity,
            },
          });
        }
      }
      detailPage.close();
    } catch {
      // 処理中にエラーが発生した場合はスキップする．
    }

    // 20件ごとに次のページへ移動する．
    if (total_i % 20 === 19 || total_i === totalResultNum - 1) {
      await page.goto(
        `https://surfsnow.jp/search/list/spl_area01.php?key=&sort=initial&page=${page_i + 1}`,
      );
      resultElems = await page.locator(".list_result");
    }
  }

  await browser.close();

  const courseCount = await prisma.course.count();
  const liftCount = await prisma.lift.count();
  console.log(
    `\n✅ Successfully saved ${courseCount} courses and ${liftCount} lifts to the database.`,
  );
}

export { main as runCrawlGelendes };

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
