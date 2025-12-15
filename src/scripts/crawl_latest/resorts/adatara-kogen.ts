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
const weather: Record<string, WeatherData> = {};
const courses: Course[] = [];
const lifts: Lift[] = [];

// コース名, リフト名対応表の定義
const courseNameMap: Record<string, string> = {
  "アルタイル(上部)": "アルタイル上部",
  "アルタイル(下部)": "アルタイル下部",
};

const weatherUrl: string[] = ["https://www.adatara-resort.com/ski/"];
const commentUrl: string[] = ["https://www.adatara-resort.com/ski/"];
const courseUrl: string[] = ["https://www.adatara-resort.com/ski/"];
const liftUrl: string[] = ["https://www.adatara-resort.com/ski/"];

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

// スキー場名
const resortName = "adatara-kogen";
const url1 = "https://www.adatara-resort.com/ski/";
const selector1 = '.gelande-date-box:has-text("気温") .naiyo';
const success1 = await navigateWithRetry(page, url1, selector1);
if (success1) {
  // コメント
  comment = await trimAndToHalfWidth(page.locator(".gelande-text"));
  if (comment === "") {
    console.warn(`⚠️ [${resortName}] Comment is empty`);
  }
  const openStatus = await trimAndToHalfWidth(
    page.locator('.gelande-date-box:has-text("滑走状況") .naiyo'),
  );
  // 天気・積雪情報
  weather.中腹 = {
    update: null,
    weather: await trimAndToHalfWidth(
      page.locator('.gelande-date-box:has-text("天候") .naiyo'),
    ),
    temperature: (
      await trimAndToHalfWidth(
        page.locator('.gelande-date-box:has-text("気温") .naiyo'),
      )
    ).replace("℃", ""),
    snowDepth: (
      await trimAndToHalfWidth(
        page.locator('.gelande-date-box:has-text("積雪量") .naiyo'),
      )
    ).replace("cm", ""),
    snowfall: null,
    condition: null,
    windSpeed: null,
  };

  for (const point of Object.keys(weather)) {
    const pointWeather = weather[point];
    if (openStatus !== "不可") {
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

  const courseElems = page.locator(".service-box-course");
  for (
    let i = 0;
    i < (await courseElems.locator(".title-course").count());
    i++
  ) {
    const rawName = (
      await trimAndToHalfWidth(courseElems.locator(".title-course").nth(i))
    ).replace("コース", "");
    const name = courseNameMap[rawName] ?? rawName;
    if (!name) {
      console.warn(`⚠️ [${resortName}] Course name is null or empty`);
    }
    let status = await trimAndToHalfWidth(
      courseElems.locator(".naiyo-course").nth(i),
    );
    if (openStatus === "不可") {
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
      note: null,
    });
  }

  // リフト情報
  const liftElems = page.locator('.service-box:has-text("リフト")');
  for (let i = 0; i < (await liftElems.locator(".title").count()); i++) {
    const name = (
      await trimAndToHalfWidth(liftElems.locator(".title").nth(i))
    ).replace("リフト", "");
    if (!name) {
      console.warn(`⚠️ [${resortName}] Lift name is null or empty`);
    }
    const note = await trimAndToHalfWidth(liftElems.locator(".naiyo").nth(i));
    let status = null;

    if (openStatus === "不可") {
      status = "×";
    } else if (note.includes("運休")) {
      status = "×";
    } else if (note === "運行") {
      status = "○";
    }
    if (!status) {
      console.warn(`⚠️ [${resortName} ${name} Lift] Status is null or empty`);
    } else if (status !== "○" && status !== "△" && status !== "×") {
      console.warn(
        `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
      );
    }
    lifts.push({
      name: name,
      status: status,
      update: null,
      note: note,
    });
  }

  const courseNum = 7;
  const liftNum = 4;
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
