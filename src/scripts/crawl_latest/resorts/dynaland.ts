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

let comment = "";
let weather: Record<string, WeatherData> = {};
const courses: Course[] = [];
const lifts: Lift[] = [];

const weatherUrl: string[] = ["https://www.dynaland.co.jp/condition/#gelande"];
const commentUrl: string[] = [
  "https://www.dynaland.co.jp/condition/#comment",
  "https://www.dynaland.co.jp/news/category/news/",
  "https://www.dynaland.co.jp/news/category/event/",
];
const courseUrl: string[] = ["https://www.dynaland.co.jp/condition/#course"];
const liftUrl: string[] = ["https://www.dynaland.co.jp/condition/#lift_anch"];

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const formattedNow = Utils.getFormattedTime(now);
console.log(formattedNow);

// コース名, リフト名対応表の定義
const courseNameMap: Record<string, string> = {
  "乙女(上部)": "乙女上部",
  "乙女(下部)": "乙女下部",
  "スカイラインB(上部)": "スカイラインB上部",
  "スカイラインB(下部)": "スカイラインB下部",
  ウマノセツリーランエリア: "ウマノセツリーラン",
  チャレンジツリーランエリア: "チャレンジツリーラン",
  乙女ツリーランエリア: "オトメツリーラン",
};
const liftNameMap: Record<string, string> = {
  からまつビギナー: "から松ビギナー",
  アルファーライナー: "αライナー",
  ベータライナー: "βライナー",
  ガンマライナー: "γライナー",
};

// スキー場名
const resortName: string = "dynaland";
const url1 = "https://www.dynaland.co.jp/condition/";
const selector1 = "#course .inner .content_inner .table_basic tbody tr";
const success1 = await Utils.navigateSafely(page, url1, selector1);
if (success1) {
  // コメント
  comment += `<a href="${commentUrl[1]}">最新のニュースはこちら</a>\n`;
  comment += `<a href="${commentUrl[2]}">イベント情報はこちら</a>\n\n`;
  comment += await Utils.safeInnerHTML(page, "#comment .inner .content_inner");
  comment = comment.trim();

  // 天気・積雪情報
  weather.中腹 = {
    update: await Utils.trimAndToHalfWidth(page.locator(".date .inner .en")),
    weather: await Utils.trimAndToHalfWidth(page.locator(".weather")),
    temperature: (
      await Utils.trimAndToHalfWidth(page.locator(".temperature"))
    ).replace("℃", ""),
    snowDepth: (await Utils.trimAndToHalfWidth(page.locator(".snow"))).replace(
      "cm",
      "",
    ),
    snowfall: null,
    condition: await Utils.trimAndToHalfWidth(page.locator(".quality")),
    windSpeed: null,
  };

  const courseElems = page.locator(
    "#course .inner .content_inner .table_basic tbody tr",
  );
  for (let i = 0; i < (await courseElems.count()); i++) {
    const row = courseElems.nth(i);
    const rawName = (
      await Utils.trimAndToHalfWidth(row.locator("td").nth(0))
    ).replace("コース", "");
    if (rawName === "") continue; // ヘッダー行をスキップ

    const name = courseNameMap[rawName] ?? rawName;
    const status = await Utils.trimAndToHalfWidth(row.locator("td").nth(1));
    Utils.checkCourse(resortName, name, status);

    const note = await Utils.trimAndToHalfWidth(row.locator("td").nth(2));
    courses.push({
      name: name,
      status: status,
      update: null,
      note: note,
    });
  }

  // リフト情報
  const liftElems = page.locator(
    "#lift_anch .inner .content_inner .table_basic tbody tr",
  );
  for (let i = 0; i < (await liftElems.count()); i++) {
    const row = liftElems.nth(i);
    const rawName = (
      await Utils.trimAndToHalfWidth(row.locator("td").nth(0))
    ).replace("リフト", "");

    if (rawName === "") continue; // ヘッダー行をスキップ

    const name = liftNameMap[rawName] ?? rawName;
    const status = await Utils.trimAndToHalfWidth(row.locator("td").nth(2));
    Utils.checkLift(resortName, name, status);

    const openingTime = await Utils.trimAndToHalfWidth(
      row.locator("td").nth(1),
    );
    const noteText = await Utils.trimAndToHalfWidth(row.locator("td").nth(3));
    let note = "";
    if (openingTime === "-") {
      note = noteText;
    } else {
      note = `${openingTime} ${noteText}`.trim();
    }

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
  temperature: { disabled: allLiftsClosed },
  snowDepth: { disabled: allLiftsClosed },
  snowfall: { disabled: true },
  condition: { disabled: allLiftsClosed },
  windSpeed: { disabled: true },
};

weather = Utils.checkAllWeatherData(resortName, weather, config);
const courseNum = 24;
const liftNum = 5;
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
