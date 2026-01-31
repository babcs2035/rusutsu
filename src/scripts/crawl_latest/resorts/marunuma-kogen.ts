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
await page.goto("https://www.marunuma.jp/winter/"); // 実際のURLに差し替えて

const resortName = "marunuma-kogen"; // スキー場名
const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

const comment = null; // コメント（適宜変更）

// 天気・積雪情報
const weather: Record<string, unknown> = {};
weather.山頂 = {
  time: await trimElem(
    page.locator(
      "body > div.body-container > main > div.main-container.top-container > section.section.section_top-05 > div > div > div > div > h3",
    ),
  ),
  weather: await trimElem(
    page.locator(
      "body > div.body-container > main > div.main-container.top-container > section.section.section_top-05 > div > div > div > div > div.weatherarea-main > div.weatherarea-main-weather > p",
    ),
  ),
  temperature: parseFloat(
    (
      await trimElem(
        page.locator(
          "body > div.body-container > main > div.main-container.top-container > section.section.section_top-05 > div > div > div > div > div.weatherarea-main > div.weatherarea-main-temperature > p > span",
        ),
      )
    ).replace("℃", ""),
  ),
  snowDepth: parseFloat(
    (
      await trimElem(
        page.locator(
          "body > div.body-container > main > div.main-container.top-container > section.section.section_top-05 > div > div > div > div > div.weatherarea-bottom > div.weatherarea-bottom-snow > p > span",
        ),
      )
    ).replace("cm", ""),
  ), // 文字列から"cm"を削除して数値に変換,
  snowfall: "",
  quality: "",
  windSpeed: parseFloat(
    (
      await trimElem(
        page.locator(
          "body > div.body-container > main > div.main-container.top-container > section.section.section_top-05 > div > div > div > div > div.weatherarea-bottom > div.weatherarea-bottom-wind > p > span.oswald",
        ),
      )
    ).replace("m/s", ""),
  ),
};

// コース情報, リフト情報
await page.goto("https://www.marunuma.jp/winter/status/");
const sections = await page.locator("div.sub_content_inner");

const courses = [];
const lifts = [];
for (let i = 0; i < (await sections.count()); i++) {
  const section = sections.nth(i);
  const h3Text = await trimElem(section.locator("h3"));
  if (h3Text.includes("コース")) {
    const rows = await section.locator("table tbody tr");
    for (let j = 1; j < (await rows.count()); j++) {
      // j=1にしてるのはヘッダー(コース名/営業/備考など)をスキップするため
      const row = rows.nth(j);
      const name =
        (await trimElem(row.locator("th"))).replace(/コース$/, "") ??
        "コース名不明";
      const status = (await trimElem(row.locator("td").nth(1))) || "";
      const note = (await trimElem(row.locator("td").nth(3))) || "";

      // キッズパークは除外
      if (!name.includes("キッズパーク")) {
        courses.push({
          name: name,
          open: status,
          time: null,
          note: note,
        });
      }
    }
  }

  if (h3Text.includes("リフト")) {
    const rows = await section.locator("table tbody tr");
    for (let j = 1; j < (await rows.count()); j++) {
      // j=1にしてるのはヘッダー(リフト名/営業/備考など)をスキップするため
      const row = rows.nth(j);
      const name =
        (await trimElem(row.locator("th"))).replace(/リフト$/, "") ??
        "リフト名不明";
      const status =
        (await row.locator("td").nth(0).textContent())?.trim() || "";
      const note = (await trimElem(row.locator("td").nth(2))) || "";

      lifts.push({
        name: name,
        open: status, // "open" / "close"
        note: note, // 実際の表示："運休" / "運行中" など（必要なら）
      });
    }
  }
}

await page.goto("https://www.marunuma.jp/winter/course-map/");
const nameSilver = "シルバー連絡路";
const imgSrcSilver = await page
  .locator("#ca4 > img")
  .first()
  .getAttribute("src");
// ID ca4が二箇所に存在したから、その一つ目(今日の状況の画像)を取得
let statusSilver = "";
if (imgSrcSilver?.endsWith("_a.png")) {
  statusSilver = "◯";
} else if (imgSrcSilver?.endsWith("_c.png")) {
  statusSilver = "×";
}
courses.push({
  name: nameSilver,
  open: statusSilver,
  time: null,
  note: null,
});

const nameViolet = "バイオレット連絡路";
const imgSrcViolet = await page
  .locator("#course >> #ca11 img")
  .first()
  .getAttribute("src");
// ID ca4が二箇所に存在したから、その一つ目(今日の状況の画像)を取得
let statusViolet = "";
if (imgSrcViolet?.endsWith("_a.png")) {
  statusViolet = "◯";
} else if (imgSrcViolet?.endsWith("_c.png")) {
  statusViolet = "×";
}
courses.push({
  name: nameViolet,
  open: statusViolet,
  time: null,
  note: null,
});

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
