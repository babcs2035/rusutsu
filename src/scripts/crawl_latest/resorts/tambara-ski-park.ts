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
await page.goto("https://www.tambara.co.jp/winter/"); // 実際のURLに差し替えて

const resortName = "tambara-ski-park"; // スキー場名
const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

// 天気・積雪情報
interface WeatherInfo {
  time: string;
  weather: string;
  temperature: number;
  snowDepth: number;
  snowfall: string;
  quality: string;
  windSpeed: string;
}

const weather: Record<string, WeatherInfo> = {};
weather.山頂 = {
  time: await trimElem(
    page.locator(
      "#is-home > section.s25-conditions > div > a > span:nth-child(2)",
    ),
  ),
  weather: await trimElem(
    page.locator(
      "#is-home > section.s25-conditions > div > div > div:nth-child(1) > span:nth-child(2) > p",
    ),
  ),
  temperature: parseFloat(
    (
      await trimElem(
        page.locator(
          "#is-home > section.s25-conditions > div > div > div:nth-child(2) > span:nth-child(2)",
        ),
      )
    ).replace("℃", ""),
  ),
  snowDepth: parseFloat(
    (
      await trimElem(
        page.locator(
          "#is-home > section.s25-conditions > div > div > div:nth-child(5) > span:nth-child(2)",
        ),
      )
    ).replace("cm", ""),
  ),
  snowfall: "",
  quality: await trimElem(
    page.locator(
      "#is-home > section.s25-conditions > div > div > div:nth-child(6) > span:nth-child(2)",
    ),
  ),
  windSpeed: "",
};

await page.goto("https://www.tambara.co.jp/winter/gelande/");
const comment1 = await page
  .locator(
    "#is-gelande > section.s25-section.noBackground > div > div:nth-child(2) > div:nth-child(4)",
  )
  .innerHTML(); // コメント（適宜変更）
const comment2 = await page
  .locator(
    "#is-gelande > section.s25-section.noBackground > div > div:nth-child(4) > div.s25-gelandeInfoContent",
  )
  .innerHTML();
const comment = `${comment1}\n\n■コース状況\n${comment2}`;

// コース情報
const courseElems = await page.locator(".s25-courseGuideSpec");
const courses = [];
for (let i = 0; i < (await courseElems.count()); i++) {
  const row = courseElems.nth(i);
  const name = (
    await trimElem(await row.locator("div.s25-courseGuideSpecNames"))
  )
    .replace("コース", "")
    .split("\n")[0]
    ?.trim();
  const note = await trimElem(
    await row.locator("span.s25-courseGuideSpecStatus"),
  );
  let status = "";
  if (note.includes("滑走可")) {
    status = "○";
  } else if (note.includes("滑走不可")) {
    status = "×";
  } else if (note.includes("一部滑走可")) {
    status = "△";
  }
  courses.push({
    name: name,
    open: status,
    time: null,
    note: note,
  });
}

// リフト情報
const liftElems = await page.locator(".s25-gelandeInfoData.lift");
const lifts = [];
for (let i = 0; i < (await liftElems.count()); i++) {
  const row = liftElems.nth(i);
  const rawName = (await trimElem(await row.locator("p")))
    .replace("リフト", "")
    .replace(/（.*?）/g, "")
    .trim();
  let name = rawName;
  if (rawName === "第一B") {
    name = "第1・B";
  } else if (rawName === "第一A") {
    name = "第1・A";
  }
  const note = await trimElem(await row.locator("span").last());
  let status = "";
  if (note.includes("運休")) {
    status = "×";
  } else if (note.includes("運行中")) {
    status = "○";
  }

  lifts.push({
    name: name,
    open: status, // "open" / "close"
    note: note, // 実際の表示："運休" / "運行中" など（必要なら）
  });
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
