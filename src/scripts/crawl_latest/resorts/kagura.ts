import fs from "node:fs";
import { chromium, type Locator } from "playwright";

function toHalfWidth(str: string): string {
  return str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, s =>
    String.fromCharCode(s.charCodeAt(0) - 0xfee0),
  );
}
async function trimElem(element: Locator): Promise<string> {
  return ((await element.allInnerTexts())[0] || "").trim();
}
async function trimAndToHalfWidth(element: Locator): Promise<string> {
  const text = await trimElem(element);
  return toHalfWidth(text);
}

interface WeatherData {
  time: string | null;
  weather: string | null;
  temperature: number | null;
  snowDepth: number | null;
  snowfall: number | null;
  condition: string | null;
  windSpeed: number | null;
}

const browser = await chromium.launch();
const context = await browser.newContext({
  locale: "ja-JP",
});
const page = await context.newPage();

// スキー場のURL
await page.goto("https://www.princehotels.co.jp/ski/kagura/winter/");

const resortName = "kagura"; // スキー場名
const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;

await page
  .locator(".ski-info-weather .top .weather")
  .waitFor({ state: "visible" });

const comment = await trimAndToHalfWidth(page.locator(".alart")); // コメント（適宜変更）

// 天気・積雪情報
const weather: Record<string, WeatherData> = {};

weather.かぐらエリア = {
  time: await trimAndToHalfWidth(page.locator(".ski-info-time")),
  weather: await trimAndToHalfWidth(
    page.locator(".ski-info-weather .top .weather"),
  ),
  temperature: parseFloat(
    (
      await trimAndToHalfWidth(page.locator(".ski-info-weather .top .temp"))
    ).replace("℃", ""),
  ),
  snowDepth: parseFloat(
    (
      await trimAndToHalfWidth(
        page
          .locator(".ski-info-snow-condition-item")
          .nth(0)
          .locator("span.fall-value"),
      )
    )
      .replace("cm", "")
      .replace("山頂", ""),
  ),
  snowfall: null,
  condition: await trimAndToHalfWidth(
    page.locator(".ski-info-snow-condition-item").nth(1),
  ),
  windSpeed: null,
};

weather.山麓 = {
  time: await trimAndToHalfWidth(page.locator(".ski-info-time")),
  weather: null,
  temperature: null,
  snowDepth: parseFloat(
    (
      await trimAndToHalfWidth(
        page
          .locator(".ski-info-snow-condition-item")
          .nth(0)
          .locator('span:has-text("山麓")'),
      )
    )
      .replace("cm", "")
      .replace("山麓", ""),
  ),
  snowfall: null,
  condition: null,
  windSpeed: null,
};

for (const point of Object.keys(weather)) {
  const pointWeather = weather[point];
  if (pointWeather?.time == null || pointWeather?.time === "") {
    console.warn(`⚠️ [${resortName} (${point})] Time is incorrect`);
  }
  if (
    point === "かぐらエリア" &&
    (pointWeather?.weather == null || pointWeather?.weather === "")
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Weather is incorrect`);
  }
  if (
    point === "かぐらエリア" &&
    (pointWeather?.temperature == null ||
      Number.isNaN(pointWeather?.temperature))
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Temperature is incorrect`);
  } else if (
    pointWeather?.temperature != null &&
    (pointWeather?.temperature > 45.0 || pointWeather?.temperature < -45.0)
  ) {
    console.warn(
      `⚠️ [${resortName} (${point})] Temperature is ${pointWeather?.temperature}°C. Too high or too low !`,
    );
  }
  if (
    pointWeather?.snowDepth == null ||
    Number.isNaN(pointWeather?.snowDepth)
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Snow depth is incorrect`);
  }
}

await page.goto("https://www.princehotels.co.jp/ski/kagura/winter/coursemap/");

await page
  .locator("#tab-body01 > div.course-cont .cont .open-popup")
  .first()
  .waitFor({ state: "visible" });

// コース情報
const courseElems = await page.locator(
  "#tab-body01 > div.course-cont .cont .open-popup",
);
const courses = [];
for (let i = 0; i < (await courseElems.count()); i++) {
  const row = courseElems.nth(i);
  const nameLocator = await row.locator(".top .name");
  const name = await nameLocator.evaluate(el => {
    // span要素を除いたテキストノードだけを抽出
    return Array.from(el.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent?.trim())
      .join("")
      .replace("コース", "")
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s =>
        String.fromCharCode(s.charCodeAt(0) - 0xfee0),
      );
  });
  if (name == null || name === "") {
    console.warn(`⚠️ [${resortName}] Course name is incorrect`);
  }
  const statusImgSrc = await row
    .locator(".top .status img")
    .getAttribute("src");
  let status: string | null = null;
  if (statusImgSrc?.includes("open")) {
    status = "◯";
  } else if (statusImgSrc?.includes("close")) {
    status = "×";
  } else if (statusImgSrc?.includes("part")) {
    status = "△";
  }
  if (status == null || status === "") {
    console.warn(`⚠️ [${resortName} ${name} Course] Status is incorrect`);
  }

  const noteText = await trimAndToHalfWidth(row.locator(".note"));
  // 改行で分ける
  const META_BLOCK =
    /起点[:：]\s*[\d０-９,]+[ｍm]?[　\s/／]*終点[:：]\s*[\d０-９,]+[ｍm]?[　\s/／]*標高差[:：]\s*[\d０-９,]+[ｍm]?/;
  // 2行目（インデックス1）を取る
  const note = noteText
    .replace(META_BLOCK, "")
    .replace(/"/g, "") // " を削除
    .trim();

  courses.push({
    name: name,
    open: status,
    time: null,
    note: note,
  });
}

// リフト情報
const liftElems = await page.locator(
  "#tab-body02 > div.course-cont .cont .open-popup",
);
const lifts = [];
for (let i = 0; i < (await liftElems.count()); i++) {
  const row = liftElems.nth(i);
  const nameLocator = await row.locator(".top .name");
  const name = await nameLocator.evaluate(el => {
    // span要素を除いたテキストノードだけを抽出
    return Array.from(el.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent?.trim())
      .join("")
      .replace("リフト", "")
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s =>
        String.fromCharCode(s.charCodeAt(0) - 0xfee0),
      );
  });
  if (!name.includes("スノーエスカレーター")) {
    const statusImgSrc = await row
      .locator(".top .status img")
      .getAttribute("src");
    let status = "";
    if (statusImgSrc?.includes("open")) {
      status = "◯";
    } else if (statusImgSrc?.includes("close")) {
      status = "×";
    } else if (statusImgSrc?.includes("part")) {
      status = "△";
    }
    const note1 = await trimAndToHalfWidth(
      row.locator('.data li:has-text("時間") span'),
    );
    const note2 = await trimAndToHalfWidth(row.locator(".note"));
    let note = note1;
    if (note2 != null) {
      note = `${note1}\n${note2}`;
    }
    lifts.push({
      name: name,
      open: status, // "open" / "close"
      note: note,
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

const courseNum = 30;
const liftNum = 18;
if (courses.length === 0) {
  console.warn(`⚠️ [${resortName}] No course data found`);
} else if (courses.length !== courseNum) {
  console.warn(
    `⚠️ [${resortName}] Course count is ${courses.length}. Expected ${courseNum}.`,
  );
}
if (lifts.length === 0) {
  console.warn(`⚠️ [${resortName}] No lift data found`);
} else if (lifts.length !== liftNum) {
  console.warn(
    `⚠️ [${resortName}] Lift count is ${lifts.length}. Expected ${liftNum}.`,
  );
}

fs.writeFileSync(
  `../../data/resorts-temporary/latest_data/${resortName}/${formattedNow}.json`,
  JSON.stringify(result, null, 2),
);
console.log(
  `✅ Saved: ../../data/resorts_cousce_lift/latest_data/${resortName}/${formattedNow}.json`,
);

await browser.close();
