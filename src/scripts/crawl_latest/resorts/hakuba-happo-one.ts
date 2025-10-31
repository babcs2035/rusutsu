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
    await page.waitForSelector(selector, { state: "visible", timeout: 15000 });
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
const weather: Record<string, WeatherData> = {};
const courses: Course[] = [];
const lifts: Lift[] = [];

const weatherUrl: string[] = ["https://www.happo-one.jp/winter/"];
const commentUrl: string[] = [
  "https://www.snownavi.com/archives/ski/category/hakuba/happo-one",
];
const courseUrl: string[] = ["https://www.happo-one.jp/gelande/condition/"];
const liftUrl: string[] = ["https://www.happo-one.jp/gelande/lift/"];

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

// スキー場名
const resortName = "hakuba-happo-one";
// スキー場のURL
const url1 = "https://www.happo-one.jp/winter/";
const selector1 = ".place-box.clearfix .weather";
const success1 = await navigateWithRetry(page, url1, selector1);
if (success1) {
  // weatherUrlに含む文字列から天候を決定する関数
  function determineWeatherCondition(url: string | null): string | null {
    if (!url) {
      console.warn(`⚠️ [${resortName}] Weather URL is null`);
      return null;
    }
    if (url.includes("sun.svg")) {
      return "晴れ";
    } else if (url.includes("cloud.svg")) {
      return "曇り";
    } else if (url.includes("rain.svg")) {
      return "雨";
    } else if (url.includes("snow.svg")) {
      return "雪";
    } else if (url.includes("blizzard")) {
      return "吹雪";
    } else {
      return null; // 不明な天候
    }
  }

  // コメント
  const reportUrl =
    "https://www.snownavi.com/archives/ski/category/hakuba/happo-one";
  comment = `最新のゲレンデレポートは<a href="${reportUrl}">こちら</a>から。`;

  // 天気・積雪情報
  const weatherElem = page.locator(".place-box.clearfix");

  const topWeatherElem = weatherElem.filter({ hasText: "黒菱" });
  const topWeatherUrl = await topWeatherElem
    .locator(".weather img")
    .getAttribute("src");

  weather["黒菱 (1680m)"] = {
    update: await trimAndToHalfWidth(topWeatherElem.locator(".update")),
    weather: determineWeatherCondition(topWeatherUrl),
    temperature: (
      await trimAndToHalfWidth(topWeatherElem.locator(".temp strong"))
    ).replace("℃", ""),
    snowDepth: (
      await trimAndToHalfWidth(topWeatherElem.locator(".snow strong").nth(0))
    ).replace("cm", ""),
    snowfall: (
      await trimAndToHalfWidth(topWeatherElem.locator(".snow strong").nth(1))
    ).replace("cm", ""),
    condition: null,
    windSpeed: null,
  };

  const midWeatherElem = weatherElem.filter({ hasText: "兎平" });
  const midWeatherUrl = await midWeatherElem
    .locator(".weather img")
    .getAttribute("src");
  weather["兎平 (1400m)"] = {
    update: await trimAndToHalfWidth(midWeatherElem.locator(".update")),
    weather: determineWeatherCondition(midWeatherUrl),
    temperature: (
      await trimAndToHalfWidth(midWeatherElem.locator(".temp strong"))
    ).replace("℃", ""),
    snowDepth: (
      await trimAndToHalfWidth(midWeatherElem.locator(".snow strong").nth(0))
    ).replace("cm", ""),
    snowfall: (
      await trimAndToHalfWidth(midWeatherElem.locator(".snow strong").nth(1))
    ).replace("cm", ""),
    condition: null,
    windSpeed: null,
  };

  const bottomWeatherElem = weatherElem.filter({ hasText: "名木山" });
  const bottomWeatherUrl = await bottomWeatherElem
    .locator(".weather img")
    .getAttribute("src");
  weather["名木山 (800m)"] = {
    update: await trimAndToHalfWidth(bottomWeatherElem.locator(".update")),
    weather: determineWeatherCondition(bottomWeatherUrl),
    temperature: (
      await trimAndToHalfWidth(bottomWeatherElem.locator(".temp strong"))
    ).replace("℃", ""),
    snowDepth: (
      await trimAndToHalfWidth(bottomWeatherElem.locator(".snow strong").nth(0))
    ).replace("cm", ""),
    snowfall: (
      await trimAndToHalfWidth(bottomWeatherElem.locator(".snow strong").nth(1))
    ).replace("cm", ""),
    condition: null,
    windSpeed: null,
  };

  for (const point of Object.keys(weather)) {
    const pointWeather = weather[point];
    if (pointWeather?.update == null || pointWeather?.update === "") {
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
  }
}

const url2 = "https://www.happo-one.jp/gelande/condition/";
const selector2 = ".gelande-table.gelande-table-jp tbody tr";
const success2 = await navigateWithRetry(page, url2, selector2);
if (success2) {
  const courseElems = page.locator(".gelande-table.gelande-table-jp tbody tr");
  const courseTime = await trimAndToHalfWidth(
    page.locator(".lift-note-list li").nth(0),
  );
  if (courseTime == null || courseTime === "") {
    console.warn(`⚠️ [${resortName}] Course update time is null or empty`);
  }
  for (let i = 1; i < (await courseElems.count()); i++) {
    const row = courseElems.nth(i);
    let name = (await trimAndToHalfWidth(row.locator("td").nth(1))).replace(
      "コース",
      "",
    );
    if (name == null || name === "") {
      console.warn(`⚠️ [${resortName}] Course name is null or empty`);
    }
    // nameが' 上段・中段'で終わっていたら'_#上部'に
    // nameが' 下段'で終わっていたら'_#下部'に置き換える
    if (name.endsWith(" 上段・中段")) {
      name = name.replace("上段・中段", "上部");
    } else if (name.endsWith(" 下段")) {
      name = name.replace("下段", "下部");
    }
    const statusUrl = await row
      .locator("td")
      .nth(2)
      .locator("img")
      .getAttribute("data-src");
    let status = "";
    if (statusUrl == null) {
      console.warn(`⚠️ [${resortName} ${name} Course] Status URL is null`);
    } else if (statusUrl.includes("icon_circle.svg")) {
      status = "○";
    } else if (statusUrl.includes("icon_triangle.svg")) {
      status = "△";
    } else if (statusUrl.includes("icon_cross.svg")) {
      status = "×";
    }
    if (status == null || status === "") {
      console.warn(`⚠️ [${resortName} ${name} Course] Status is null or empty`);
    } else if (status !== "○" && status !== "△" && status !== "×") {
      console.warn(
        `⚠️ [${resortName} ${name} Course] Status (${status}) is incorrect format`,
      );
    }
    const note = await trimAndToHalfWidth(row.locator("td").nth(3));
    courses.push({
      name: name,
      status: status,
      update: courseTime,
      note: note,
    });
  }
}

const url3 = "https://www.happo-one.jp/gelande/lift/";
const selector3 = ".lift-table tbody tr";
const success3 = await navigateWithRetry(page, url3, selector3);
if (success3) {
  // リフト情報
  const liftElems = await page.locator(".lift-table tbody tr");
  for (let i = 1; i < (await liftElems.count()); i++) {
    const row = liftElems.nth(i);
    const name = (
      await trimAndToHalfWidth(await row.locator("td").nth(0))
    ).replace("リフト", "");
    if (name == null || name === "") {
      console.warn(`⚠️ [${resortName}] Lift name is null or empty`);
    }
    const statusUrl = await row
      .locator("td")
      .nth(1)
      .locator("img")
      .getAttribute("data-src");
    let status = "";
    if (statusUrl == null) {
      console.warn(`⚠️ [${resortName} ${name} Lift] Status URL is null`);
    } else if (statusUrl.includes("icon_circle.svg")) {
      status = "○";
    } else if (statusUrl.includes("icon_cross.svg")) {
      status = "×";
    } else if (statusUrl.includes("icon_bar.svg")) {
      status = "×";
    }
    if (status == null || status === "") {
      console.warn(`⚠️ [${resortName} ${name} Lift] Status is null or empty`);
    } else if (status !== "○" && status !== "△" && status !== "×") {
      console.warn(
        `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
      );
    }
    const openingTime = await trimAndToHalfWidth(row.locator("td").nth(2));
    const closingTime = await trimAndToHalfWidth(row.locator("td").nth(3));
    const remarks = await trimAndToHalfWidth(row.locator("td").nth(4));
    if (remarks == null || remarks === "") {
      console.warn(`⚠️ [${resortName} ${name} Lift] Remarks is null or empty`);
    } else if (remarks !== "営業期間外") {
      if (openingTime == null || openingTime === "") {
        console.warn(
          `⚠️ [${resortName} ${name} Lift] Opening time is null or empty`,
        );
      }
      if (closingTime == null || closingTime === "") {
        console.warn(
          `⚠️ [${resortName} ${name} Lift] Closing time is null or empty`,
        );
      }
    }
    let note = "";
    if (!openingTime && !closingTime) {
      note = `${openingTime}〜${closingTime} ${remarks}`;
    } else {
      note = remarks;
    }
    if (name === "名木山第3トリプル") {
      lifts.push({
        name: "名木山第3トリプルA",
        status,
        update: null,
        note,
      });
      lifts.push({
        name: "名木山第3トリプルB",
        status,
        update: null,
        note,
      });
    } else if (name === "国際第3ペア") {
      lifts.push({
        name: "国際第3ペアA",
        status,
        update: null,
        note,
      });
      lifts.push({
        name: "国際第3ペアB",
        status,
        update: null,
        note,
      });
    } else {
      lifts.push({
        name: name,
        status: status,
        update: null,
        note: note,
      });
    }
  }

  const courseNum = 33;
  const liftNum = 21;
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
