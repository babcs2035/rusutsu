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
  return ((await element.allTextContents())[0] || "").trim();
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

const comment = null;
const weather: Record<string, WeatherData> = {};
const courses: Course[] = [];
const lifts: Lift[] = [];

const weatherUrl: string[] = ["https://alpenblick-resort.com/ski"];
const commentUrl: string[] = [""];
const courseUrl: string[] = ["https://alpenblick-resort.com/ski"];
const liftUrl: string[] = ["https://alpenblick-resort.com/ski"];

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

// スキー場名
const resortName = "ikenotaira-onsen-alpen-blick";
const url1 = "https://alpenblick-resort.com/ski";
const selector1 = ".ski_weather .weather img";
const success1 = await navigateWithRetry(page, url1, selector1);
if (success1) {
  const weatherImgUrl = await page
    .locator(".ski_weather .weather img")
    .getAttribute("src");
  let weatherText = null;
  if (weatherImgUrl?.includes("ic_sun.svg")) {
    weatherText = "晴れ";
  } else if (weatherImgUrl?.includes("ic_cloud.svg")) {
    weatherText = "曇り";
  } else if (weatherImgUrl?.includes("ic_rain.svg")) {
    weatherText = "雨";
  } else if (weatherImgUrl?.includes("ic_snow.svg")) {
    weatherText = "雪";
  } else {
    // 天気画像が予期しない形式の場合、ic_XX.svgのXXを抽出して天気テキストを設定
    console.warn(
      `⚠️ [${resortName}] Unexpected weather image URL format: ${weatherImgUrl}`,
    );
  }

  // 天気・積雪情報
  weather["中腹"] = {
    update: await trimAndToHalfWidth(page.locator(".ski_weather .update")),
    weather: weatherText,
    temperature: (
      await trimAndToHalfWidth(
        page.locator(".ski_weather .temperature .futura"),
      )
    ).replace("℃", ""),
    snowDepth: (
      await trimAndToHalfWidth(page.locator(".ski_weather .snow .futura"))
    ).replace("cm", ""),
    snowfall: null,
    condition: null,
    windSpeed: null,
  };

  const slopeStatusText = await trimAndToHalfWidth(
    page.locator(".ski_weather .status .futura"),
  );
  const statusHour = (
    await trimAndToHalfWidth(page.locator(".ski_weather .status .hour"))
  ).replace("営業時間／", "");
  if (!statusHour) {
    console.warn(`⚠️ [${resortName}] Status hour is null or empty`);
  }

  if (slopeStatusText !== "CLOSE") {
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
          console.warn(
            `⚠️ [${resortName} (${point})] Temperature is null or NaN`,
          );
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
          console.warn(
            `⚠️ [${resortName} (${point})] Snow Depth is null or NaN`,
          );
        }
      }
    }
  }

  const courseElems = page.locator(".ski_guide_table.table03 tbody tr");
  for (let i = 0; i < (await courseElems.count()); i++) {
    const row = courseElems.nth(i);
    const name = (await trimAndToHalfWidth(row.locator("th .t_ttl"))).replace(
      "コース",
      "",
    );
    if (!name) {
      console.warn(`⚠️ [${resortName}] Course name is null or empty`);
    }
    const note = await trimAndToHalfWidth(row.locator("td"));
    let status = null;
    if (note === "滑走可") {
      status = "○";
    } else if (note === "滑走不可") {
      status = "×";
    }
    if (!status) {
      console.warn(`⚠️ [${resortName} ${name} Course] Status is null or empty`);
    } else if (status !== "○" && status !== "△" && status !== "×") {
      console.warn(
        `⚠️ [${resortName} ${name} Course] Status (${status}) is incorrect format`,
      );
    }
    courses.push({
      name: name,
      status: status,
      update: null,
      note: note,
    });
  }

  const parkElems = page.locator(".ski_guide_table.table02 tbody tr");
  for (let i = 0; i < (await parkElems.count()); i++) {
    const row = parkElems.nth(i);
    const name = (
      await trimAndToHalfWidth(row.locator("th span.t_ttl02"))
    ).replace("コース", "");
    if (!name) {
      console.warn(`⚠️ [${resortName}] Course name is null or empty`);
    }
    const note = await trimAndToHalfWidth(row.locator("td"));
    let status = null;
    if (note === "滑走可") {
      status = "○";
    } else if (note === "滑走不可") {
      status = "×";
    }
    if (!status) {
      console.warn(`⚠️ [${resortName} ${name} Course] Status is null or empty`);
    } else if (status !== "○" && status !== "△" && status !== "×") {
      console.warn(
        `⚠️ [${resortName} ${name} Course] Status (${status}) is incorrect format`,
      );
    }
    courses.push({
      name: name,
      status: status,
      update: null,
      note: note,
    });
  }

  // リフト情報
  const liftElems = page.locator(".ski_guide_table.table01 tbody tr");
  for (let i = 0; i < (await liftElems.count()); i++) {
    const row = liftElems.nth(i);
    const name = (
      await trimAndToHalfWidth(row.locator("th span.num_ttl"))
    ).replace("リフト", "");
    if (!name) {
      console.warn(`⚠️ [${resortName}] Lift name is null or empty`);
    }
    let status = null;
    const statusText = await trimAndToHalfWidth(row.locator("td"));
    if (statusText === "運行中" || statusText === "運行") {
      status = "○";
    } else if (statusText === "運行停止") {
      status = "×";
    }
    if (!status) {
      console.warn(`⚠️ [${resortName} ${name} Lift] Status is null or empty`);
    } else if (status !== "○" && status !== "△" && status !== "×") {
      console.warn(
        `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
      );
    }
    const note = statusText + "\nスキー場営業時間: " + statusHour;
    lifts.push({
      name: name,
      status: status,
      update: null,
      note: note,
    });
  }

  const courseNum = 17;
  const liftNum = 5;
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

if (success1 === true) {
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
