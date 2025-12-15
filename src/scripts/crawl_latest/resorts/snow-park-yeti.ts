import fs from "node:fs";
import { chromium } from "playwright";
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

const resortName: string = "snow-park-yeti";
const weatherUrl: string[] = ["https://www.yeti-resort.com/"];
const commentUrl: string[] = ["https://www.yeti-resort.com/"];
const courseUrl: string[] = ["https://www.yeti-resort.com/guide/#gelande"];
const liftUrl: string[] = [""];

// コース名, リフト名対応表の定義
const courseNameMap: Record<string, string> = {
  "": "",
};
const _liftNameMap: Record<string, string> = {
  "": "",
};
const _liftTwoLine: Record<string, string[]> = {
  "": ["", ""],
};

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const formattedNow = Utils.getFormattedTime(now);
console.log(formattedNow);

const url1 = "https://www.yeti-resort.com/";
const selector1 = '#weather .panel:has-text("天気") tbody tr:has-text("天気")';
const success1 = await Utils.navigateSafely(page, url1, selector1);
if (success1) {
  // コメント
  comment = await Utils.safeInnerHTML(page, "#weather .text");

  // 天気・積雪情報
  weather.中腹 = {
    update: await Utils.trimAndToHalfWidth(page.locator("#weather .time")),
    weather: await Utils.trimAndToHalfWidth(
      page.locator(
        '#weather .panel:has-text("天気") tbody tr:has-text("天気") td .txt .large',
      ),
    ),
    temperature: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '#weather .panel:has-text("天気") tbody tr:has-text("天気") td .txt p:has-text("気温")',
        ),
      )
    )
      .replace("℃", "")
      .replace("気温:", ""),
    snowDepth: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '#weather .panel:has-text("天気") tbody tr:has-text("天気") td .txt p:has-text("積雪量")',
        ),
      )
    )
      .replace("cm", "")
      .replace("積雪量:", ""),
    snowfall: null,
    condition: null,
    windSpeed: null,
  };
}

const url2 = "https://www.yeti-resort.com/guide/";
const selector2 = "table.tbr.guide_tbl02 tbody tr td.mark img";
const success2 = await Utils.navigateSafely(page, url2, selector2);
if (success2) {
  const courseElems = page.locator("table.tbr.guide_tbl02 tbody tr");
  for (let i = 0; i < (await courseElems.count()); i++) {
    const row = courseElems.nth(i);
    const rawName = (await Utils.trimAndToHalfWidth(row.locator("th"))).replace(
      "コース",
      "",
    );

    const name = courseNameMap[rawName] ?? rawName;

    const statusImg = await row.locator("td.mark img").getAttribute("src");
    let status = "";
    if (statusImg?.endsWith("icon01.png")) {
      status = "○";
    } else if (statusImg?.endsWith("icon02.png")) {
      status = "△";
    } else if (statusImg?.endsWith("icon03.png")) {
      status = "×";
    }
    Utils.checkCourse(resortName, name, status);

    const note = await Utils.trimAndToHalfWidth(row.locator("td.tal"));
    courses.push({
      name: name,
      status: status,
      update: null,
      note: note,
    });
  }

  // リフト情報
  //   const liftElems = page.locator('');
  //   for (let i = 0; i < await liftElems.count(); i++) {
  //     const row = liftElems.nth(i);
  //     const rawName = (await Utils.trimAndToHalfWidth(row.locator(''))).replace('リフト', '');

  //     const name = liftNameMap[rawName] ?? rawName;
  //     const status = await Utils.trimAndToHalfWidth(row.locator(''));
  //     Utils.checkLift(resortName, name, status);

  //     const note = await Utils.trimAndToHalfWidth(row.locator(''));
  //     if (name in liftTwoLine) {
  //       const liftNames = liftTwoLine[name];
  //       for (const liftName of liftNames) {
  //         lifts.push({
  //           name: liftName,
  //           status: status,
  //           update: null,
  //           note: note,
  //         });
  //       }
  //     } else {
  //       lifts.push({
  //         name: name,
  //         status: status,
  //         update: null,
  //         note: note
  //       });
  //     }
  //   }
}

const allCoursesClosed =
  courses.length > 0 && courses.every(course => course.status === "×");
const config: WeatherValidationConfig = {
  temperature: { disabled: allCoursesClosed },
  snowDepth: { disabled: allCoursesClosed },
  snowfall: { disabled: true },
  condition: { disabled: true },
  windSpeed: { disabled: true },
};

weather = Utils.checkAllWeatherData(resortName, weather, config);

const courseNum = 7;
const liftNum = 0;
Utils.checkCourseLiftCount(resortName, courses, courseNum, lifts, liftNum);
Utils.checkUrl(resortName, weatherUrl, commentUrl, courseUrl, liftUrl);

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
