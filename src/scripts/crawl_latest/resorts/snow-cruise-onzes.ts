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

const weatherUrl: string[] = [""];
const commentUrl: string[] = [""];
const courseUrl: string[] = [""];
const liftUrl: string[] = [""];

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const formattedNow = Utils.getFormattedTime(now);
console.log(formattedNow);

// スキー場名
const resortName: string = "snow-cruise-onze";
const url1 = "https://onze.jp/";
const selector1 = ".sloped_state";
const success1 = await Utils.navigateSafely(page, url1, selector1);
if (success1) {
  // コメント
  const commentHp = await Utils.trimAndToHalfWidth(
    page.locator(".sloped_state"),
  );

  const commentNews = `<a href="https://onze.jp/category/contents/">最新ニュースはこちらから</a>`;

  if (commentHp) {
    comment = `${commentHp}\n\n${commentNews}`;
  } else {
    comment = commentNews;
  }

  const openClose = await Utils.trimAndToHalfWidth(
    page.locator('.eigyo_data li:has-text("営業") span'),
  );
  const weatherImgUrl = await Utils.safeGetAttribute(
    page,
    '.eigyo_data li:has-text("天気") span',
    "img",
  );
  let weatherText = "";
  if (weatherImgUrl) {
    if (weatherImgUrl?.endsWith("fine_icon.png")) {
      weatherText = "晴れ";
    } else if (weatherImgUrl?.endsWith("cloud_icon.png")) {
      weatherText = "曇り";
    } else if (weatherImgUrl?.endsWith("snow_icon.png")) {
      weatherText = "雪";
    } else if (weatherImgUrl?.endsWith("rain_icon.png")) {
      weatherText = "雨";
    }
  }

  let weatherUpdate = "";
  let liftUpdate = "";
  let courseUpdate = "";
  if (openClose === "○") {
    weatherUpdate = await Utils.trimAndToHalfWidth(
      page.locator(".eigyo_all_block time").nth(0),
    );
    liftUpdate = await Utils.trimAndToHalfWidth(
      page.locator(".eigyo_all_block time").nth(1),
    );
    courseUpdate = await Utils.trimAndToHalfWidth(
      page.locator(".eigyo_all_block time").nth(2),
    );
  }

  // 天気・積雪情報
  weather["中腹"] = {
    update: weatherUpdate,
    weather: weatherText,
    temperature: (
      await Utils.trimAndToHalfWidth(
        page.locator('.eigyo_data li:has-text("気温") span'),
      )
    ).replace("℃", ""),
    snowDepth: (
      await Utils.trimAndToHalfWidth(
        page.locator('.eigyo_data li:has-text("積雪") span'),
      )
    ).replace("cm", ""),
    snowfall: null,
    condition: await Utils.trimAndToHalfWidth(
      page.locator('.eigyo_data li:has-text("雪質") span'),
    ),
    windSpeed: (
      await Utils.trimAndToHalfWidth(
        page.locator('.eigyo_data li:has-text("風速") span'),
      )
    ).replace("m/s", ""),
  };

  const courseElemsList = [
    page.locator(".course ul li"),
    page.locator(".course2 ul li"),
  ];
  for (const courseElems of courseElemsList) {
    for (let i = 0; i < (await courseElems.count()); i++) {
      const row = courseElems.nth(i);
      const name = (await Utils.trimAndToHalfWidth(row.locator("p"))).replace(
        "コース",
        "",
      );
      const status = await Utils.trimAndToHalfWidth(row.locator("div"));
      Utils.checkCourse(resortName, name, status);

      courses.push({
        name: name,
        status: status,
        update: courseUpdate,
        note: null,
      });
    }
  }

  // リフト情報
  const liftNameMap: Record<string, string> = {
    "4人乗りクワッド": "パノラマクワッド",
    "2人乗りペア": "サンシャインペア",
  };
  const liftElems = page.locator(".lift ul li");
  for (let i = 0; i < (await liftElems.count()); i++) {
    const row = liftElems.nth(i);
    const rawName = (await Utils.trimAndToHalfWidth(row.locator("p"))).replace(
      "リフト",
      "",
    );
    const name = liftNameMap[rawName] ?? rawName;

    const status = await Utils.trimAndToHalfWidth(row.locator("div"));
    Utils.checkLift(resortName, name, status);

    const note = await Utils.trimAndToHalfWidth(row.locator("span"));
    lifts.push({
      name: name,
      status: status,
      update: liftUpdate,
      note: note,
    });
  }
}

const allLiftsClosed =
  lifts.length > 0 && lifts.every(lift => lift.status === "×");
const config: WeatherValidationConfig = {
  temperature: { disabled: allLiftsClosed },
  snowDepth: { disabled: allLiftsClosed },
  snowfall: { disabled: allLiftsClosed },
  condition: { disabled: true },
  windSpeed: { disabled: true },
};

weather = Utils.checkAllWeatherData(resortName, weather, config);
const courseNum = 46;
const liftNum = 6;
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
