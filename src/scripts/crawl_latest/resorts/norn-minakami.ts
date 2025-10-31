import fs from "node:fs";
import { chromium, type Locator, type Page } from "playwright";
import type {
  Course,
  Lift,
  WeatherData,
  WeatherValidationConfig,
} from "../shared/type";
import * as Utils from "../shared/utils";

const browser = await chromium.launch();
const context = await browser.newContext({
  locale: "ja-JP",
});
const page = await context.newPage();

let comment = null;
let weather: Record<string, WeatherData> = {};
const courses: Course[] = [];
const lifts: Lift[] = [];

const resortName: string = "norn-minakami";
const weatherUrl: string[] = ["https://www.norn.co.jp/winter/gerande/#todays"];
const commentUrl: string[] = [
  "https://www.norn.co.jp/winter/gerande/#todays",
  "https://www.norn.co.jp/winter/category/news/norn/",
];
const courseUrl: string[] = ["https://www.norn.co.jp/winter/gerande/#todays"];
const liftUrl: string[] = ["https://www.norn.co.jp/winter/gerande/#todays"];

// コース名, リフト名対応表の定義
const courseNameMap: Record<string, string> = {};
const liftNameMap: Record<string, string> = {
  第1: "第1クワッド",
  第2: "第2ペア",
  第3: "第3クワッド",
  第4: "第4ペア",
};
const liftTwoLine: Record<string, string[]> = {};

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const formattedNow = Utils.getFormattedTime(now);
console.log(formattedNow);

const url1 = "https://www.norn.co.jp/winter/gerande/";
const selector1 = 'table.normal.main:has-text("運行状況") tbody td';
const success1 = await Utils.navigateSafely(page, url1, selector1);
if (success1) {
  // コメント
  comment = await Utils.trimAndToHalfWidth(
    page.locator(".comment:not(.traffic)"),
  );

  if (comment && comment.trim() !== "") {
    comment += `\n\n最新のニュースは<a href="${commentUrl[1]}">こちら</a>から`;
  } else {
    // commentが空の場合はリンクのみ
    comment = `最新のニュースは<a href="${commentUrl[1]}">こちら</a>から`;
  }

  // 天気・積雪情報
  weather["中腹"] = {
    update: await Utils.trimAndToHalfWidth(page.locator(".today .update")),
    weather: await Utils.trimAndToHalfWidth(page.locator(".today .weather")),
    temperature: (
      await Utils.trimAndToHalfWidth(page.locator(".today .temperature"))
    ).replace("℃", ""),
    snowDepth: (
      await Utils.trimAndToHalfWidth(page.locator(".today .snow"))
    ).replace("cm", ""),
    snowfall: null,
    condition: null,
    windSpeed: null,
  };

  const allCells = page.locator(
    'table.normal.main:has-text("運行状況") tbody td',
  );
  const cellCount = await allCells.count();

  for (let i = 0; i < cellCount; i++) {
    const cell = allCells.nth(i);
    const cellText = await Utils.trimAndToHalfWidth(cell);

    // 空のセルや "--" はスキップ
    if (cellText === "--" || cellText.trim() === "" || cellText === "×") {
      continue;
    }

    // コース情報の処理
    if (
      cellText.includes("コース") ||
      cellText.includes("スノーパーク") ||
      cellText.includes("スノーランド")
    ) {
      // 隣接するセルから状態を取得
      const nextCell = allCells.nth(i + 1);
      const status = await Utils.trimAndToHalfWidth(nextCell);
      i += 1; // 状態セルをスキップするためにインデックスを増やす

      // "コース"を除去
      const cleanName = cellText.replace("コース", "");
      const name = courseNameMap[cleanName] ?? cleanName;
      Utils.checkCourse(resortName, name, status);

      courses.push({
        name: name,
        status: status,
        update: null,
        note: null,
      });
    }

    // リフト情報の処理
    if (cellText.includes("リフト")) {
      // 隣接するセルから状態を取得
      const nextCell = allCells.nth(i + 1);
      const status = await Utils.trimAndToHalfWidth(nextCell);
      i += 1; // 状態セルをスキップするためにインデックスを増やす

      // "リフト"を除去
      const cleanName = cellText.replace("リフト", "");
      const name = liftNameMap[cleanName] ?? cleanName;
      Utils.checkLift(resortName, name, status);

      if (name in liftTwoLine) {
        const liftNames = liftTwoLine[name];
        for (const liftName of liftNames) {
          lifts.push({
            name: liftName,
            status: status,
            update: null,
            note: null,
          });
        }
      } else {
        lifts.push({
          name: name,
          status: status,
          update: null,
          note: null,
        });
      }
    }
  }
}

const allLiftsClosed =
  lifts.length > 0 && lifts.every(lift => lift.status === "×");
const config: WeatherValidationConfig = {
  temperature: { disabled: allLiftsClosed },
  snowDepth: { disabled: allLiftsClosed },
  snowfall: { disabled: true },
  condition: { disabled: true },
  windSpeed: { disabled: true },
};

weather = Utils.checkAllWeatherData(resortName, weather, config);

const courseNum = 7;
const liftNum = 4;
Utils.checkCourseLiftCount(resortName, courses, courseNum, lifts, liftNum);
Utils.checkUrl(resortName, weatherUrl, commentUrl, courseUrl, liftUrl);

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
    `../../../data/resorts-temporary/latest_data/${resortName}/${formattedNow}.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(
    `✅ Saved: ../../../data/resorts-temporary/latest_data/${resortName}/${formattedNow}.json`,
  );
} else {
  console.error(`❌ Failed to retrieve data from one or more URLs.`);
}
await browser.close();
