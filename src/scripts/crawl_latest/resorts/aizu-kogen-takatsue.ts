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

const weatherUrl: string[] = ["http://takatsue.jp/gelande"];
const commentUrl: string[] = [
  "http://takatsue.jp/gelande",
  `http://takatsue.jp/info-all`,
];
const courseUrl: string[] = ["http://takatsue.jp/gelande"];
const liftUrl: string[] = ["http://takatsue.jp/gelande"];

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

// スキー場名
const resortName = "aizu-kogen-takatsue";
const url1 = "http://takatsue.jp/gelande";
const selector1 = '.slope_weather_box:has-text("天気") .slope_weather_update';
const success1 = await navigateWithRetry(page, url1, selector1);
if (success1) {
  // コメントにURLを埋め込む
  comment =
    (await trimAndToHalfWidth(page.locator(".slope_information_desc"))) +
    `\n\n最新のお知らせは<a href="${commentUrl[1]}">こちら</a>`;
  const update = await trimAndToHalfWidth(page.locator(".slope_date"));
  // 天気・積雪情報
  weather["山麓"] = {
    update: update,
    weather: await trimAndToHalfWidth(
      page.locator('.slope_weather_box:has-text("天気") .slope_weather_update'),
    ),
    temperature: (
      await trimAndToHalfWidth(
        page.locator(
          '.slope_weather_box:has-text("気温") .slope_weather_update',
        ),
      )
    ).replace("℃", ""),
    snowDepth: (
      await trimAndToHalfWidth(
        page.locator(
          '.slope_weather_box:has-text("スキーセンター") .slope_weather_update',
        ),
      )
    ).replace("cm", ""),
    snowfall: null,
    condition: null,
    windSpeed: null,
  };

  weather["中腹(ハイランド前)"] = {
    update: update,
    weather: null,
    temperature: null,
    snowDepth: (
      await trimAndToHalfWidth(
        page.locator(
          '.slope_weather_box:has-text("ハイランド") .slope_weather_update',
        ),
      )
    ).replace("cm", ""),
    snowfall: null,
    condition: null,
    windSpeed: null,
  };

  for (const point of Object.keys(weather)) {
    const pointWeather = weather[point];
    if (!pointWeather?.update) {
      console.warn(`⚠️ [${resortName} (${point})] Time is null or empty`);
    }
    if (point === "山麓" && !pointWeather?.weather) {
      console.warn(`⚠️ [${resortName} (${point})] Weather is null or empty`);
    }
    if (point === "山麓" && pointWeather?.temperature !== "-") {
      pointWeather.temperature = parseFloat(
        pointWeather?.temperature?.toString() || "",
      );
      if (!pointWeather?.temperature) {
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
      if (!pointWeather?.snowDepth) {
        console.warn(`⚠️ [${resortName} (${point})] Snow Depth is null or NaN`);
      }
    }
  }
  const courseElems = page.locator(
    '.slope_course_wrapper:has-text("上級コース") table tbody tr',
  );
  for (let i = 0; i < (await courseElems.count()); i++) {
    const row = courseElems.nth(i);
    const fullText = (
      await trimAndToHalfWidth(row.locator("td").nth(0))
    ).replace("コース", "");
    if (fullText === "滑走可否") {
      continue;
    }
    const spanText = await trimAndToHalfWidth(
      row.locator("td").nth(0).locator("span.numbar_icon"),
    );
    const name = fullText.replace(spanText, "").trim();
    if (!name) {
      console.warn(`⚠️ [${resortName}] Course name is null or empty`);
    }
    const statusClass = await row.locator(".course_mark").getAttribute("class");
    let status = null;
    if (statusClass?.includes("round")) {
      status = "○";
    } else if (statusClass?.includes("cross")) {
      status = "×";
    }
    if (!status) {
      console.warn(`⚠️ [${resortName} ${name} Course] Status is null or empty`);
    } else if (status !== "○" && status !== "△" && status !== "×") {
      console.warn(
        `⚠️ [${resortName} ${name} Course] Status (${status}) is incorrect format`,
      );
    }
    const note = null;
    courses.push({
      name: name,
      status: status,
      update: update,
      note: note,
    });
  }

  // リフト情報
  const liftElems = await page.locator(
    '.slope_course_wrapper:has-text("リフト") table tbody tr',
  );
  for (let i = 0; i < (await liftElems.count()); i++) {
    const row = liftElems.nth(i);
    const name = (
      await trimAndToHalfWidth(await row.locator("td").nth(0))
    ).replace("リフト", "");
    if (name === "運行状況") {
      continue;
    }
    if (!name) {
      console.warn(`⚠️ [${resortName}] Lift name is null or empty`);
    }
    const statusClass = await row.locator(".course_mark").getAttribute("class");
    let status = null;
    if (statusClass?.includes("round")) {
      status = "○";
    } else if (statusClass?.includes("cross")) {
      status = "×";
    }
    if (!status) {
      console.warn(`⚠️ [${resortName} ${name} Lift] Status is null or empty`);
    } else if (status !== "○" && status !== "△" && status !== "×") {
      console.warn(
        `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
      );
    }
    const note =
      "スキー場" +
      (await trimAndToHalfWidth(page.locator(".slope_hours_desc")));
    lifts.push({
      name: name,
      status: status,
      update: update,
      note: note,
    });
  }

  const courseNum = 22;
  const liftNum = 8;
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
