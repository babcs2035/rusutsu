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
  temperature: number | string | null;
  snowDepth: number | string | null;
  snowfall: number | string | null;
  condition: string | null;
  windSpeed: number | string | null;
}

const browser = await chromium.launch();
const context = await browser.newContext({
  locale: "ja-JP",
});
const page = await context.newPage();

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

// スキー場名
const resortName = "";
// スキー場のURL
const url1 = "";
let success1 = true;
try {
  await page.goto(url1, { timeout: 30000 });
  const targetLocator = page.locator("");
  const isVisible = await targetLocator.isVisible({ timeout: 15000 });
  if (!isVisible) {
    console.error(
      `❌ [${resortName}] Target element not found or not visible in ${url1}`,
    );
    success1 = false;
  }
} catch (error) {
  let message = "Unknown error";
  if (error instanceof Error) {
    message = error.message.split("\n")[0]; // 最初の1行だけ
  } else {
    message = String(error);
  }
  console.error(`❌ [${resortName}] Error navigating to ${url1}: ${message}`);
  success1 = false;
}

let comment = null;
const weather: Record<string, WeatherData> = {};
const courses = [];
const lifts = [];

if (success1) {
  // コメント
  comment = await trimAndToHalfWidth(page.locator(""));

  // 天気・積雪情報
  weather["山頂"] = {
    time: await trimAndToHalfWidth(page.locator("")),
    weather: await trimAndToHalfWidth(page.locator("")),
    temperature: (await trimAndToHalfWidth(page.locator(""))).replace("℃", ""),
    snowDepth: (await trimAndToHalfWidth(page.locator(""))).replace("cm", ""),
    snowfall: (await trimAndToHalfWidth(page.locator(""))).replace("cm", ""),
    condition: await trimAndToHalfWidth(page.locator("")),
    windSpeed: (await trimAndToHalfWidth(page.locator(""))).replace("m/s", ""),
  };

  weather["山麓"] = {
    time: await trimAndToHalfWidth(page.locator("")),
    weather: await trimAndToHalfWidth(page.locator("")),
    temperature: (await trimAndToHalfWidth(page.locator(""))).replace("℃", ""),
    snowDepth: (await trimAndToHalfWidth(page.locator(""))).replace("cm", ""),
    snowfall: (await trimAndToHalfWidth(page.locator(""))).replace("cm", ""),
    condition: await trimAndToHalfWidth(page.locator("")),
    windSpeed: (await trimAndToHalfWidth(page.locator(""))).replace("m/s", ""),
  };

  for (const point of Object.keys(weather)) {
    const pointWeather = weather[point];
    if (pointWeather?.time == null || pointWeather?.time === "") {
      console.warn(`⚠️ [${resortName} (${point})] Time is null or empty`);
    }
    if (pointWeather?.weather == null || pointWeather?.weather === "") {
      console.warn(`⚠️ [${resortName} (${point})] Weather is null or empty`);
    }
    if (pointWeather?.temperature !== "-") {
      pointWeather.temperature = parseFloat(
        pointWeather?.temperature?.toString() || "",
      );
      if (
        pointWeather?.temperature == null ||
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
        pointWeather?.snowDepth == null ||
        Number.isNaN(pointWeather?.snowDepth)
      ) {
        console.warn(`⚠️ [${resortName} (${point})] Snow Depth is null or NaN`);
      }
    }

    if (pointWeather?.snowfall !== "-") {
      pointWeather.snowfall = parseFloat(
        pointWeather?.snowfall?.toString() || "",
      );
      if (
        pointWeather?.snowfall == null ||
        Number.isNaN(pointWeather?.snowfall)
      ) {
        console.warn(`⚠️ [${resortName} (${point})] Snowfall is null or NaN`);
      } else if (
        pointWeather?.snowfall > 130.0 ||
        pointWeather?.snowfall < -0.1
      ) {
        console.warn(
          `⚠️ [${resortName} (${point})] Snowfall is ${pointWeather?.snowfall}cm. Impossible!`,
        );
      }
    }

    if (pointWeather?.condition == null || pointWeather?.condition === "") {
      console.warn(`⚠️ [${resortName} (${point})] Condition is null or empty`);
    }
    if (pointWeather?.windSpeed !== "-") {
      pointWeather.windSpeed = parseFloat(
        pointWeather?.windSpeed?.toString() || "",
      );
      if (
        pointWeather?.windSpeed == null ||
        Number.isNaN(pointWeather?.windSpeed)
      ) {
        console.warn(`⚠️ [${resortName} (${point})] WindSpeed is null or NaN`);
      }
    }
  }
}

// スキー場のURL
const url2 = "";
let success2 = true;
try {
  await page.goto(url2, { timeout: 30000 });
  const targetLocator = page.locator("");
  const isVisible = await targetLocator.isVisible({ timeout: 15000 });
  if (!isVisible) {
    console.error(
      `❌ [${resortName}] Target element not found or not visible in ${url2}`,
    );
    success2 = false;
  }
} catch (error) {
  let message = "Unknown error";
  if (error instanceof Error) {
    message = error.message.split("\n")[0]; // 最初の1行だけ
  } else {
    message = String(error);
  }
  console.error(`❌ [${resortName}] Error navigating to ${url2}: ${message}`);
  success2 = false;
}
if (success2) {
  const courseElems = page.locator("");
  for (let i = 0; i < (await courseElems.count()); i++) {
    const row = courseElems.nth(i);
    const name = (await trimAndToHalfWidth(await row.locator(""))).replace(
      "コース",
      "",
    );
    if (name == null || name === "") {
      console.warn(`⚠️ [${resortName}] Course name is null or empty`);
    }
    const status = await trimAndToHalfWidth(await row.locator(""));
    if (status == null || status === "") {
      console.warn(`⚠️ [${resortName} ${name} Course] Status is null or empty`);
    } else if (status !== "○" && status !== "△" && status !== "×") {
      console.warn(
        `⚠️ [${resortName} ${name} Course] Status (${status}) is incorrect format`,
      );
    }
    const note = await trimElem(await row.locator(""));
    courses.push({
      name: name,
      status: status,
      time: null,
      note: note,
    });
  }

  // リフト情報
  const liftElems = await page.locator("");
  for (let i = 0; i < (await liftElems.count()); i++) {
    const row = liftElems.nth(i);
    const name = (await trimAndToHalfWidth(await row.locator(""))).replace(
      "リフト",
      "",
    );
    if (name == null || name === "") {
      console.warn(`⚠️ [${resortName}] Lift name is null or empty`);
    }
    const status = await trimAndToHalfWidth(await row.locator(""));
    if (status == null || status === "") {
      console.warn(`⚠️ [${resortName} ${name} Lift] Status is null or empty`);
    } else if (status !== "○" && status !== "△" && status !== "×") {
      console.warn(
        `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
      );
    }
    const note = await trimElem(await row.locator(""));
    lifts.push({
      name: name,
      status: status,
      note: note,
    });
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

if (success1 === true && success2 === true) {
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
    `✅ Saved: ../../data/resorts-temporary/latest_data/${resortName}/${formattedNow}.json`,
  );
} else {
  console.error(`❌ Failed to retrieve data from one or more URLs.`);
}
await browser.close();
