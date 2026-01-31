import fs from "node:fs";
import { chromium, type Locator } from "playwright";

async function trimElem(element: Locator): Promise<string> {
  return ((await element.allInnerTexts())[0] || "").trim();
}

const browser = await chromium.launch();
const context = await browser.newContext({
  locale: "ja-JP",
});
const page = await context.newPage();

// スキー場のURL
await page.goto("https://nozawaski.com/winter/course/"); // 実際のURLに差し替えて

const resortName = "nozawa-onsen"; // スキー場名
const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));

const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);
const comment = await trimElem(page.locator(".news-board.block-group")); // コメント(これどうすればいい？)

// 天気・積雪情報
const snowfallTables = page.locator(".table-default.info-snowfall");
const weather: Record<string, unknown> = {};
for (let i = 0; i < (await snowfallTables.count()); i++) {
  const table = snowfallTables.nth(i);
  const title = await table
    .locator('xpath=./preceding-sibling::h4[@class="sub-ttl"][1]')
    .innerText()
    .catch(() => `section_${i}`);

  weather[title] = {
    time: "",
    weather: await trimElem(table.locator("tr:nth-child(1) td")),
    temperature: await trimElem(table.locator("tr:nth-child(2) td span.num")),
    snowDepth: await trimElem(table.locator("tr:nth-child(4) td span.num")),
    snowfall: await trimElem(table.locator("tr:nth-child(5) td")),
    quality: await trimElem(table.locator("tr:nth-child(3) td")),
    //昨日15時〜8時までの降雪量
    windSpeed: "",
  };
}

// コース情報
const courseElems = await page.locator("table.table-default");
const courses = [];
for (let i = 0; i < (await courseElems.count()); i++) {
  const elem = courseElems.nth(i);
  const text = await trimElem(elem.locator("thead tr th").first());
  if (text !== "コースNo.") continue; // コース名の列を見つける
  const rowElems = elem.locator("tbody tr");

  for (let j = 0; j < (await rowElems.count()); j++) {
    const row = rowElems.nth(j);
    const cells = row.locator("td");

    const nameText = await cells.nth(1).innerText();
    const rawStatus = await cells.nth(2).innerText();

    courses.push({
      name: nameText.replace(/コース$/, "").trim(),
      open: rawStatus.trim(),
      time: null,
      note: null,
    });
  }
}

// リフト情報
const liftPage = await context.newPage();
await liftPage.goto("https://nozawaski.com/winter/lift_price/lift_time/");

const liftElems = await liftPage.locator("table.table-default"); // 例えばtable使っている場合
const lifts = [];

for (let i = 0; i < (await liftElems.count()); i++) {
  const elem = liftElems.nth(i);
  const text = await trimElem(elem.locator("thead tr th").first());
  if (text !== "リフトNo.") continue; // リフトNo.の列を見つける

  const rowElems = elem.locator("tbody tr");
  for (let j = 0; j < (await rowElems.count()); j++) {
    const row = rowElems.nth(j);
    const cells = row.locator("td");

    const nameText = await cells.nth(1).innerText();
    const status = await cells.nth(3).innerText();
    const statusText = await cells.nth(2).innerText();

    lifts.push({
      name: nameText,
      open: status, // "open" / "close"
      note: statusText, // 実際の表示："運休" / "運行中" など（必要なら）
    });
  }
}

const result = {
  resortName,
  time: now,
  comment,
  weather,
  courses,
  lifts,
};

fs.writeFileSync(
  `../../data/resorts-temporary/latest_data/${resortName}/${formattedNow}.json`,
  JSON.stringify(result, null, 2),
);
console.log(
  `✅ Saved: ../../data/resorts_cousce_lift/latest_data/${resortName}/${formattedNow}.json`,
);

await browser.close();
