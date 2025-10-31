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
await page.goto("https://www.akihachi.jp/"); // 実際のURLに差し替えて

const resortName = "akita-hachimantai"; // スキー場名
const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

const comment = await page.locator("#hitokoto").innerHTML(); // コメント（適宜変更）

// 天気・積雪情報
const weather: Record<string, WeatherData> = {};
weather["中腹"] = {
  time: await trimAndToHalfWidth(
    page.locator(
      "#contents > div.today_left1 > div > table > tbody > tr:nth-child(1) > td:nth-child(2)",
    ),
  ),
  weather: await trimAndToHalfWidth(
    page.locator(
      "#contents > div.today_left1 > div > table > tbody > tr:nth-child(1) > td:nth-child(4)",
    ),
  ),
  temperature: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(
          "#contents > div.today_left1 > div > table > tbody > tr:nth-child(2) > td:nth-child(4)",
        ),
      )
    ).replace("℃", ""),
  ),
  snowDepth: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(
          "#contents > div.today_left1 > div > table > tbody > tr:nth-child(4) > td:nth-child(2)",
        ),
      )
    ).replace("cm", ""),
  ),
  snowfall: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(
          "#contents > div.today_left1 > div > table > tbody > tr:nth-child(3) > td:nth-child(4)",
        ),
      )
    ).replace("cm", ""),
  ),
  condition: await trimAndToHalfWidth(
    page.locator(
      "#contents > div.today_left1 > div > table > tbody > tr:nth-child(2) > td:nth-child(2)",
    ),
  ),
  windSpeed: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(
          "#contents > div.today_left1 > div > table > tbody > tr:nth-child(3) > td:nth-child(2)",
        ),
      )
    ).replace("m", ""),
  ),
};

for (const point of Object.keys(weather)) {
  const pointWeather = weather[point];
  if (pointWeather?.time == null || pointWeather?.time === "") {
    console.warn(`⚠️ [${resortName} (${point})] Time is incorrect`);
  }
  if (pointWeather?.weather == null || pointWeather?.weather === "") {
    console.warn(`⚠️ [${resortName} (${point})] Weather is incorrect`);
  }
  if (
    pointWeather?.temperature == null ||
    Number.isNaN(pointWeather?.temperature)
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Temperature is incorrect`);
  } else if (
    pointWeather?.temperature > 45.0 ||
    pointWeather?.temperature < -45.0
  ) {
    console.warn(
      `⚠️ [${resortName} (${point})] Temperature is ${pointWeather?.temperature}°C. Too high or too low !`,
    );
  }
  if (
    pointWeather?.snowDepth == null ||
    Number.isNaN(pointWeather?.snowDepth)
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Snow Depth is incorrect`);
  }
  if (pointWeather?.snowfall == null || Number.isNaN(pointWeather?.snowfall)) {
    console.warn(`⚠️ [${resortName} (${point})] Snowfall is incorrect`);
  } else if (pointWeather?.snowfall > 130.0 || pointWeather?.snowfall < -0.1) {
    console.warn(
      `⚠️ [${resortName} (${point})] Snowfall is ${pointWeather?.snowfall}cm. Impossible!`,
    );
  }
  if (pointWeather?.condition == null || pointWeather?.condition === "") {
    console.warn(`⚠️ [${resortName} (${point})] Condition is incorrect`);
  }
  if (
    pointWeather?.windSpeed == null ||
    Number.isNaN(pointWeather?.windSpeed)
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Wind Speed is incorrect`);
  }
}

// コース情報
const courseStatus = await trimAndToHalfWidth(
  page.locator(
    "#contents > div.today_left1 > div > table > tbody > tr:nth-child(4) > td:nth-child(4)",
  ),
);
const courseName1 = "ぶな森ゲレンデ";
const courseName2 = "トド松ゲレンデ";
const courses = [];
if (courseStatus === "全面可") {
  courses.push({
    name: courseName1,
    status: "○",
    time: null,
    note: null,
  });
  courses.push({
    name: courseName2,
    status: "○",
    time: null,
    note: null,
  });
} else if (courseStatus === "不可") {
  courses.push({
    name: courseName1,
    status: "×",
    time: null,
    note: null,
  });
  courses.push({
    name: courseName2,
    status: "×",
    time: null,
    note: null,
  });
} else {
  console.warn(
    `⚠️ [${resortName}] Course status (${courseStatus}) is incorrect`,
  );
}

// リフト情報
const lifts = [];
const note = await trimAndToHalfWidth(
  page.locator(
    "#contents > div.today_left1 > div > table > tbody > tr:nth-child(5) > td:nth-child(4)",
  ),
);
if (courseStatus === "全面可") {
  lifts.push({
    name: "ロマンス",
    status: "○",
    note: null,
  });
} else if (courseStatus === "不可") {
  lifts.push({
    name: "ロマンス",
    status: "×",
    note: null,
  });
} else {
  console.warn(`⚠️ [${resortName}] Lift status is incorrect`);
}

if (courses.length === 0) {
  console.warn(`⚠️ [${resortName}] No course data found`);
} else if (courses.length !== 2) {
  console.warn(
    `⚠️ [${resortName}] Course count is ${courses.length}. Expected 2.`,
  );
}
if (lifts.length === 0) {
  console.warn(`⚠️ [${resortName}] No lift data found`);
} else if (lifts.length !== 1) {
  console.warn(`⚠️ [${resortName}] Lift count is ${lifts.length}. Expected 1.`);
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
