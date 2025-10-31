import fs from "node:fs";
import { chromium, type Locator, type Page } from "playwright";
import { tqdm } from "ts-tqdm";

async function trimElem(element: Locator): Promise<string> {
  return ((await element.allInnerTexts())[0] || "").trim();
}

function removeSymbols(str: string): string {
  return str.replace(/\D/g, "");
}

function StrToNum(str: string): number | null {
  return removeSymbols(str) === "" ? null : Number(removeSymbols(str));
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(
  `https://surfsnow.jp/search/list/spl_area01.php?key=&sort=initial`,
);
const totalResultNum = Number(
  await trimElem(
    await page.locator(
      "#main_result > div.order > div > div > dl:nth-child(1) > dd > big",
    ),
  ),
);

const gelendes = [];
let gelendes_partial = [];
let resultElems = await page.locator(".list_result");
for (const total_i of tqdm(totalResultNum)) {
  const page_i = Math.floor(total_i / 20) + 1;
  if (fs.existsSync(`../data/temp/gelendes/${page_i}.json`)) {
    if (total_i % 20 === 0) {
      gelendes_partial.push(
        ...JSON.parse(
          fs.readFileSync(`../data/temp/gelendes/${page_i}.json`, "utf-8"),
        ),
      );
    }
  } else {
    const resultElem = await resultElems.nth(total_i % 20);
    const nameElem = await resultElem.locator("h2").locator("a");
    const name = await trimElem(nameElem);
    if (name !== "") {
      const [detailPage] = await Promise.all([
        context.waitForEvent("page"),
        nameElem.click(),
      ]);
      await detailPage.goto(await detailPage.url());
      if ((await detailPage.title()) !== "404 Not Found - SURF&SNOW") {
        const images = [];
        const imageElems = await detailPage.locator(".sp-image");
        for (let i = 0; i < (await imageElems.count()); i++) {
          images.push(await imageElems.nth(i).getAttribute("src"));
        }
        let res = {
          name,
          outline: {
            description: {
              short: await trimElem(
                await detailPage.locator(".section_info").nth(0).locator("h3"),
              ),
              long: await trimElem(
                await detailPage.locator(".section_info").nth(0).locator("p"),
              ),
            },
            images,
            condition: (
              await trimElem(
                await detailPage.locator(
                  "#content_main > table.weather_infoBox > tbody > tr:nth-child(2) > td:nth-child(1)",
                ),
              )
            )
              .split("\n")
              .slice(0, -1)
              .join(""),
            status: await trimElem(
              await detailPage.locator(
                "#content_main > table.weather_infoBox > tbody > tr:nth-child(3) > td.bottom > em",
              ),
            ),
            review: Number(
              await trimElem(
                await detailPage.locator(
                  "#content_main > table.section_voice > tbody > tr:nth-child(1) > th.total > p > em",
                ),
              ),
            ),
          },
          source: await detailPage.url(),
        };

        await detailPage.goto(
          (await detailPage.url()).replace("s.htm", "gc1.htm"),
        );
        if (
          (await detailPage.title()) !== "404 Not Found - SURF&SNOW" &&
          (await trimElem(await detailPage.locator("#ContentsWrap"))) !==
            "※現在コース情報はございません。"
        ) {
          const courses = [];
          const courseElems = await detailPage.locator("#course").locator("tr");
          for (
            let course_i = 1;
            course_i < (await courseElems.count());
            course_i += 2
          ) {
            const courseElem = await courseElems.nth(course_i);
            courses.push({
              name: await trimElem(await courseElem.locator("td:nth-child(2)")),
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
            });
          }

          const lifts = [];
          const liftElems = await detailPage.locator("#Lift").locator("tr");
          for (let lift_i = 1; lift_i < (await liftElems.count()); lift_i++) {
            const courseElem = await liftElems.nth(lift_i);
            lifts.push({
              name: await trimElem(await courseElem.locator("td:nth-child(2)")),
              type: await trimElem(await courseElem.locator("td:nth-child(3)")),
              distance: StrToNum(
                await trimElem(await courseElem.locator("td:nth-child(4)")),
              ),
              hood: await trimElem(await courseElem.locator("td:nth-child(5)")),
            });
          }

          res = Object.assign(res, {
            details: {
              type: {
                notPressed: StrToNum(
                  await trimElem(
                    await detailPage.locator(
                      "#Courses > tbody > tr:nth-child(2) > th.level01",
                    ),
                  ),
                ),
                pressed: StrToNum(
                  await trimElem(
                    await detailPage.locator(
                      "#Courses > tbody > tr:nth-child(2) > th.level02",
                    ),
                  ),
                ),
                bump: StrToNum(
                  await trimElem(
                    await detailPage.locator(
                      "#Courses > tbody > tr:nth-child(2) > th.level03",
                    ),
                  ),
                ),
              },
              angle: {
                max: StrToNum(
                  await trimElem(
                    await detailPage
                      .locator("dt:has-text('最大斜度')")
                      .locator("xpath=following-sibling::dd[1]"),
                  ),
                ),
                avg: StrToNum(
                  await trimElem(
                    await detailPage
                      .locator("dt:has-text('平均斜度')")
                      .locator("xpath=following-sibling::dd[1]"),
                  ),
                ),
              },
              maxDistance: StrToNum(
                await trimElem(
                  await detailPage
                    .locator("dt:has-text('最長滑走距離')")
                    .locator("xpath=following-sibling::dd[1]"),
                ),
              ),
              lift: StrToNum(
                await trimElem(
                  await detailPage
                    .locator("dt:has-text('リフト運送能力')")
                    .locator("xpath=following-sibling::dd[1]"),
                ),
              ),
            },
            courses: {
              data: courses,
              img:
                "https://surfsnow.jp" +
                (await detailPage
                  .locator("#CourseMap")
                  .locator("img")
                  .getAttribute("src")),
            },
            lifts,
          });
        }
        gelendes_partial.push(res);
      }
      detailPage.close();
    }
  }

  if (total_i % 20 === 19 || total_i === totalResultNum - 1) {
    if (!fs.existsSync(`../data/temp/gelendes/${page_i}.json`)) {
      fs.writeFileSync(
        `../data/temp/gelendes/${page_i}.json`,
        JSON.stringify(gelendes_partial, null, 0),
      );
    }
    gelendes.push(...gelendes_partial);
    gelendes_partial = [];
    await page.goto(
      `https://surfsnow.jp/search/list/spl_area01.php?key=&sort=initial&page=${page_i + 1}`,
    );
    resultElems = await page.locator(".list_result");
  }
}
console.log(`\nFound ${gelendes.length} gelendes`);
fs.writeFileSync("../data/Gelendes.json", JSON.stringify(gelendes, null, 0));

await browser.close();
