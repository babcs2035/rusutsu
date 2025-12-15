import fs from "node:fs";
import { chromium, type Locator, type Page } from "playwright";

interface WeatherData {
  update: string | null;
  weather: string | null;
  temperature: number | string | null;
  snowDepth: number | string | null;
  snowfall: number | string | null;
  condition: string | null;
  windSpeed: number | string | null;
}

interface Course {
  name: string;
  status: string | null;
  update: string | null;
  note: string | null;
}

interface Lift {
  name: string;
  status: string | null;
  update: string | null;
  note: string | null;
}

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

async function navigateWithRetry(
  page: Page,
  url: string,
  selector: string,
): Promise<boolean> {
  try {
    await page.goto(url, { timeout: 30000 });
    await page.waitForSelector(selector, { state: "attached", timeout: 15000 });
    return true;
  } catch (e) {
    console.error(
      `❌ [${resortName}] Error navigating to ${url}: ${e instanceof Error ? e.message.split("\n")[0] : e}`,
    );
    return false;
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({
  locale: "ja-JP",
});
const page = await context.newPage();

let comment = null;
const _snowDepth = null;
const weather: Record<string, WeatherData> = {};
const courses: Course[] = [];
const lifts: Lift[] = [];

const weatherUrl: string[] = [""];
const commentUrl: string[] = [""];
const courseUrl: string[] = [""];
const liftUrl: string[] = [""];

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

// スキー場名
const resortName = "shiga-kogen-central";

const url0 = "https://shigakogen.co.jp/winter/";
const selector0 = ".info_list .weather";
const success0 = await navigateWithRetry(page, url0, selector0);
if (success0) {
  // コメントURL
  commentUrl.push(url0);
}

const url1 = "https://shigakogen.co.jp/winter/";
const selector1 = ".info_list .weather";
const success1 = await navigateWithRetry(page, url1, selector1);
if (success1) {
  // コメント
  comment = await page.innerHTML(".left_box .text");

  // 天気・積雪情報
  weather.中腹 = {
    update: await trimAndToHalfWidth(page.locator(".temperature time")),
    weather: await trimAndToHalfWidth(page.locator(".weather .text")),
    temperature: (
      await trimAndToHalfWidth(page.locator(".temperature span"))
    ).replace("℃", ""),
    snowDepth: (await trimAndToHalfWidth(page.locator(""))).replace("cm", ""),
    snowfall: null,
    condition: null,
    windSpeed: null,
  };

  for (const point of Object.keys(weather)) {
    const pointWeather = weather[point];
    if (pointWeather?.update === null || pointWeather?.update === "") {
      console.warn(`⚠️ [${resortName} (${point})] Time is null or empty`);
    }
    if (pointWeather?.weather === null || pointWeather?.weather === "") {
      console.warn(`⚠️ [${resortName} (${point})] Weather is null or empty`);
    }
    if (pointWeather?.temperature !== "-") {
      pointWeather.temperature = parseFloat(
        pointWeather?.temperature?.toString() || "",
      );
      if (
        pointWeather?.temperature === null ||
        Number.isNaN(pointWeather?.temperature)
      ) {
        console.warn(`⚠️ [${resortName} (${point})] Temperature is null or NaN`);
      } else if (
        pointWeather?.temperature > 45.0 ||
        pointWeather?.temperature < -45.0
      ) {
        console.warn(
          `⚠️ [${resortName} (${point})] Temperature is ${pointWeather?.temperature}°C. Too high or too low !`,
        );
      }
    }

    if (pointWeather?.snowDepth !== "-") {
      pointWeather.snowDepth = parseFloat(
        pointWeather?.snowDepth?.toString() || "",
      );
      if (
        pointWeather?.snowDepth === null ||
        Number.isNaN(pointWeather?.snowDepth)
      ) {
        console.warn(`⚠️ [${resortName} (${point})] Snow Depth is null or NaN`);
      }
    }
  }
}

// コース名, リフト名対応表の定義
const courseNameMap: Record<string, string> = {
  "": "",
};
const liftNameMap: Record<string, string> = {
  "": "",
};
const liftTwoLine: Record<string, string[]> = {
  "": ["", ""],
};
const url2 = "";
const selector2 = "";
const success2 = await navigateWithRetry(page, url2, selector2);
if (success2) {
  const courseElems = page.locator("");
  for (let i = 0; i < (await courseElems.count()); i++) {
    const row = courseElems.nth(i);
    const rawName = (await trimAndToHalfWidth(row.locator(""))).replace(
      "コース",
      "",
    );
    const name = courseNameMap[rawName] ?? rawName;
    if (!name) {
      console.warn(`⚠️ [${resortName}] Course name is null or empty`);
    }
    const status = await trimAndToHalfWidth(row.locator(""));
    if (!status) {
      console.warn(`⚠️ [${resortName} ${name} Course] Status is null or empty`);
    } else if (status !== "○" && status !== "△" && status !== "×") {
      console.warn(
        `⚠️ [${resortName} ${name} Course] Status (${status}) is incorrect format`,
      );
    }
    const note = await trimAndToHalfWidth(row.locator(""));
    courses.push({
      name: name,
      status: status,
      update: null,
      note: note,
    });
  }

  // リフト情報
  const liftElems = page.locator("");
  for (let i = 0; i < (await liftElems.count()); i++) {
    const row = liftElems.nth(i);
    const rawName = (await trimAndToHalfWidth(row.locator(""))).replace(
      "リフト",
      "",
    );
    const name = liftNameMap[rawName] ?? rawName;
    if (!name) {
      console.warn(`⚠️ [${resortName}] Lift name is null or empty`);
    }
    const status = await trimAndToHalfWidth(row.locator(""));
    if (!status) {
      console.warn(`⚠️ [${resortName} ${name} Lift] Status is null or empty`);
    } else if (status !== "○" && status !== "△" && status !== "×") {
      console.warn(
        `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
      );
    }
    const note = await trimAndToHalfWidth(row.locator(""));
    if (name in liftTwoLine) {
      const liftNames = liftTwoLine[name];
      for (const liftName of liftNames) {
        lifts.push({
          name: liftName,
          status: status,
          update: null,
          note: note,
        });
      }
    } else {
      lifts.push({
        name: name,
        status: status,
        update: null,
        note: note,
      });
    }
  }

  const courseNum = 12;
  const liftNum = 6;
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
}

if (weatherUrl.length === 1 && weatherUrl[0] === "") {
  console.warn(`⚠️ [${resortName}] No weather URL found`);
}
if (commentUrl.length === 1 && commentUrl[0] === "") {
  console.warn(`⚠️ [${resortName}] No comment URL found`);
}
if (courseUrl.length === 1 && courseUrl[0] === "") {
  console.warn(`⚠️ [${resortName}] No course URL found`);
}
if (liftUrl.length === 1 && liftUrl[0] === "") {
  console.warn(`⚠️ [${resortName}] No lift URL found`);
}

if (success1 === true && success2 === true) {
  const result = {
    resortName,
    time: now,
    comment,
    commentUrl,
    weather,
    weatherUrl,
    courses,
    courseUrl,
    lifts,
    liftUrl,
  };
  fs.writeFileSync(
    `../../data/resorts-temporary/latest_data/${resortName}/${formattedNow}.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(
    `✅ Saved: ../../data/resorts-temporary/latest_data/${resortName}/${formattedNow}.json`,
  );
} else {
  console.error(`❌ Failed to retrieve data from one or more URLs.`);
}
await browser.close();
