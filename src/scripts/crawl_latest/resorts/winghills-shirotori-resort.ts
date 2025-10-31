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

const resortName: string = "winghills-shirotori-resort";
const weatherUrl: string[] = ["https://winghills.net/snow/coursemap/#lnk1"];
const commentUrl: string[] = ["https://winghills.net/news/"];
const courseUrl: string[] = ["https://winghills.net/snow/coursemap/#lnk_gere"];
const liftUrl: string[] = ["https://winghills.net/snow/coursemap/#lnk_lift"];

const courseNameMap: Record<string, string> = {
  "タワーリング・ダウンヒル(上部)": "タワーリング・ダウンヒル上部",
  "タワーリング・ダウンヒル(中間)": "タワーリング・ダウンヒル中部",
  "タワーリング・ダウンヒル(下部)": "タワーリング・ダウンヒル下部",
  クルージング・: "クルージング",
  スカイフロント・: "スカイフロント",
};
const liftNameMap: Record<string, string> = {};
const liftTwoLine: Record<string, string[]> = {};

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const formattedNow = Utils.getFormattedTime(now);
console.log(formattedNow);

const url1 = "https://winghills.net/snow/coursemap/";
const selector1 = '.box_info:has-text("上級"):has-text("中級") .item';
const success1 = await Utils.navigateSafely(page, url1, selector1);
if (success1) {
  // コメント
  comment = `最新のニュースは<a href="${commentUrl[0]}">こちら</a>から`;

  // 天気・積雪情報
  const weatherElem = page.locator('.box_center:has-text("気象・積雪情報")');
  weather["中腹"] = {
    update: (
      await Utils.trimAndToHalfWidth(weatherElem.locator(".update"))
    ).replace(/[()]/g, ""),
    weather: await Utils.trimAndToHalfWidth(
      weatherElem.locator(".box_item:has(svg) .text"),
    ),
    temperature: await (async () => {
      const tempText = await Utils.trimAndToHalfWidth(
        weatherElem.locator('.box_item:has-text("最低") .txt_par'),
      );
      // "20℃ / 29℃" → "20~29" の形式に変換
      const numbers = tempText.match(/(\d+)℃/g);
      if (numbers && numbers.length >= 2) {
        const temps = numbers
          .map(temp => temp.replace("℃", ""))
          .map(temp => parseInt(temp)) // 文字列を数値に変換
          .sort((a, b) => a - b);
        return `${temps[0]}~${temps[1]}`; // "20~29" の形式で返す
      }
      return tempText.replace(/℃/g, "");
    })(),
    snowDepth: (
      await Utils.trimAndToHalfWidth(
        weatherElem.locator('.box_item:has-text("積雪") .txt_par .number'),
      )
    ).replace("cm", ""),
    snowfall: (
      await Utils.trimAndToHalfWidth(
        weatherElem.locator('.box_item:has-text("降雪") .txt_par .number'),
      )
    ).replace("cm", ""),
    condition: await Utils.trimAndToHalfWidth(
      weatherElem.locator('.box_item:has-text("雪質") .txt_par'),
    ),
    windSpeed: null,
  };

  const courseElems = page.locator(
    '.box_info:has-text("上級"):has-text("中級") .item',
  );
  for (let i = 0; i < (await courseElems.count()); i++) {
    const row = courseElems.nth(i);
    const rawName = (
      await Utils.trimAndToHalfWidth(row.locator(".box_left .text .txt_st"))
    ).replace("コース", "");

    const name = courseNameMap[rawName] ?? rawName;
    const status = await (async () => {
      const circleElem = row.locator("span.ic.circle");
      const closeElem = row.locator("span.ic.close");

      if ((await circleElem.count()) > 0) {
        return "○";
      } else if ((await closeElem.count()) > 0) {
        return "×";
      }
      return ""; // フォールバック
    })();
    Utils.checkCourse(resortName, name, status);

    const note = "";
    courses.push({
      name: name,
      status: status,
      update: null,
      note: note,
    });
  }

  // リフト情報
  const liftElems = page.locator('.tbl_basic3:has-text("リフト") tbody tr');
  for (let i = 1; i < (await liftElems.count()); i++) {
    // ヘッダー行をタイトルのために1から開始
    const row = liftElems.nth(i);
    const rawName = (
      await Utils.trimAndToHalfWidth(row.locator("td").nth(0))
    ).replace("リフト", "");

    const name = liftNameMap[rawName] ?? rawName;
    const status = await (async () => {
      const circleElem = row.locator("span.ic.circle");
      const closeElem = row.locator("span.ic.close");

      if ((await circleElem.count()) > 0) {
        return "○";
      } else if ((await closeElem.count()) > 0) {
        return "×";
      }
      return ""; // フォールバック
    })();
    Utils.checkLift(resortName, name, status);

    const note = await row
      .locator("td")
      .nth(1)
      .evaluate(td => {
        // span要素を除去してテキストのみ取得
        const span = td.querySelector("span");
        if (span) {
          span.remove();
        }
        return td.textContent?.trim() || "";
      });

    if (name in liftTwoLine) {
      const liftNames = liftTwoLine[name];
      for (const liftName of liftNames) {
        lifts.push({
          name: liftName,
          status: status,
          update: null,
          note: note,
        });
      }
    } else {
      lifts.push({
        name: name,
        status: status,
        update: null,
        note: note,
      });
    }
  }
}

const allLiftsClosed =
  lifts.length > 0 && lifts.every(lift => lift.status === "×");
const config: WeatherValidationConfig = {
  temperature: { type: "string", disabled: allLiftsClosed }, // "20~29" の形式を許容
  snowDepth: { disabled: allLiftsClosed },
  snowfall: { disabled: allLiftsClosed },
  windSpeed: { disabled: true },
};

weather = Utils.checkAllWeatherData(resortName, weather, config);

const courseNum = 16;
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
