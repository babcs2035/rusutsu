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

const currentYear = new Date().getFullYear();
const year1before = currentYear - 1;
const currentYearUrl = `https://sakaeclub.securesite.jp/${currentYear}/`;
const year1beforeUrl = `https://sakaeclub.securesite.jp/${year1before}/`;

const weatherUrl: string[] = ["https://sakaeclub.securesite.jp/"];
const commentUrl: string[] = [
  "https://sakaeclub.securesite.jp/",
  currentYearUrl,
  year1beforeUrl,
];
const courseUrl: string[] = ["https://sakaeclub.securesite.jp/"];
const liftUrl: string[] = ["https://sakaeclub.securesite.jp/"];

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const formattedNow = Utils.getFormattedTime(now);
console.log(formattedNow);

// スキー場名
const resortName: string = "sakae-club";

const url1 = "https://sakaeclub.securesite.jp/";
const selector1 = '.wp-block-heading:has-text("本日のコンディション")';
const success1 = await Utils.navigateSafely(page, url1, selector1);
if (success1) {
  // コメント
  const heading = page.locator(
    '.wp-block-heading:has-text("本日のコンディション")',
  );
  comment = await Utils.trimAndToHalfWidth(
    heading.locator("xpath=following-sibling::p[1]"),
  );

  if (comment !== "" && comment !== null) {
    comment += `\n\n`;
  }
  comment += `<a href = ${currentYearUrl}>${currentYear}年の新着情報はこちら</a>\n`;
  comment += `<a href = ${year1beforeUrl}>${year1before}年の新着情報はこちら</a>`;
  const match = comment.match(/\((.*?更新)\)/);
  const updateText = match ? match[1].replace("更新", "") : "";

  // 天気・積雪情報
  weather["山麓"] = {
    update: updateText,
    weather: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '.wp-block-flexible-table-block-table.is-style-stripes:has-text("積雪量(山麓)") tbody tr td:has-text("天気")',
        ),
      )
    ).replace("天気:", ""),
    temperature: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '.wp-block-flexible-table-block-table.is-style-stripes:has-text("積雪量(山麓)") tbody tr td:has-text("気温")',
        ),
      )
    )
      .replace("℃", "")
      .replace("気温:", ""),
    snowDepth: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '.wp-block-flexible-table-block-table.is-style-stripes:has-text("積雪量(山麓)") tbody tr td:has-text("積雪量(山麓)")',
        ),
      )
    )
      .replace("cm", "")
      .replace("積雪量(山麓):", ""),
    snowfall: null,
    condition: null,
    windSpeed: null,
  };

  const courseElems = page.locator(
    '.wp-block-flexible-table-block-table.is-style-stripes:has-text("コース名") tbody tr',
  );
  for (let i = 1; i < (await courseElems.count()); i++) {
    const row = courseElems.nth(i);
    const name = (
      await Utils.trimAndToHalfWidth(row.locator("td").nth(1))
    ).replace("コース", "");

    const statusText = await Utils.trimAndToHalfWidth(row.locator("td").nth(0));
    let status = "";
    if (statusText.includes("⚪︎")) {
      status = "○";
    } else if (statusText.includes("×") || statusText.includes("ー")) {
      status = "×";
    }
    Utils.checkCourse(resortName, name, status);

    const note = statusText;
    courses.push({
      name: name,
      status: status,
      update: null,
      note: note,
    });
  }

  // リフト情報
  const liftElems = page.locator(
    '.wp-block-flexible-table-block-table.is-style-stripes:has-text("リフト") tbody tr td',
  );
  for (let i = 0; i < (await liftElems.count()); i++) {
    const row = liftElems.nth(i);
    const name = (
      await Utils.trimAndToHalfWidth(row.locator("strong"))
    ).replace("リフト", "");

    const statusText = (await Utils.trimAndToHalfWidth(row))
      .replace(name, "")
      .replace("リフト", "");
    let status = "";
    if (statusText.includes("運行")) {
      status = "○";
    } else if (statusText.includes("運休") || statusText.includes("ー")) {
      status = "×";
    }
    Utils.checkLift(resortName, name, status);

    const note = statusText;
    lifts.push({
      name: name,
      status: status,
      update: null,
      note: note,
    });
  }
}

const allLiftsClosed =
  lifts.length > 0 && lifts.every(lift => lift.status === "×");
const config: WeatherValidationConfig = {
  update: { disabled: allLiftsClosed },
  weather: { disabled: allLiftsClosed },
  temperature: { disabled: allLiftsClosed },
  snowDepth: { disabled: allLiftsClosed },
  snowfall: { disabled: true },
  condition: { disabled: true },
  windSpeed: { disabled: true },
};
weather = Utils.checkAllWeatherData(resortName, weather, config);

const courseNum = 9;
const liftNum = 3;
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
