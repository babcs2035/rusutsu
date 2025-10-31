import fs from "node:fs";
import { chromium, type Locator, type Page } from "playwright";
import type {
  Course,
  Lift,
  WeatherData,
  WeatherValidationConfig,
} from "../shared/type";
import * as Utils from "../shared/utils";

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    locale: "ja-JP",
  });
  const page = await context.newPage();

  let comment = null;
  let weather: Record<string, WeatherData> = {};
  const courses: Course[] = [];
  const lifts: Lift[] = [];

  const resortName: string = "rusutsu-resort";
  const weatherUrl: string[] = ["https://rusutsu.com/snow-and-weather-report/"];
  const commentUrl: string[] = [
    "https://rusutsu.com/news-and-topics/",
    "https://rusutsu.com/blog/",
  ];
  const courseUrl: string[] = ["https://rusutsu.com/lift-and-trail-status/"];
  const liftUrl: string[] = ["https://rusutsu.com/lift-and-trail-status/"];

  // コース名, リフト名対応表の定義
  const courseNameMap: Record<string, string> = {
    "バンビ - 上部": "バンビ上部",
    "バンビ - 下部": "バンビ下部",
    "レインボー - 上部": "レインボー上部",
    "レインボー - 中部": "レインボー中部",
    "レインボー - 下部": "レインボー下部",
    "スカイ - 上部": "スカイ上部",
    "スカイ - 下部": "スカイ下部",
    "ジャイアント - 上部": "ジャイアント上部",
    "ジャイアント - 下部": "ジャイアント下部",
    "イーストティーニュ - 上部": "イーストティーニュ上部",
    "イーストティーニュ - 下部": "イーストティーニュ下部",
    "フリコ沢 - 上部": "フリコ沢上部",
    "フリコ沢 - 中部": "フリコ沢中部",
    "フリコ沢 - 下部": "フリコ沢下部",
    "イゾラグラン - 上部": "イゾラグラン上部",
    "イゾラグラン - 中部": "イゾラグラン中部",
    "イゾラグラン - 下部": "イゾラグラン下部",
    "スティームボートA - 上部": "スティームボートA上部",
    "スティームボートA - 下部": "スティームボートA下部",
    "スティームボートB - 上部": "スティームボートB上部",
    "スティームボートB - 中部": "スティームボートB中部",
    "スティームボートB - 下部": "スティームボートB下部",
  };
  const liftNameMap: Record<string, string> = {
    "": "",
  };
  const liftTwoLine: Record<string, string[]> = {
    "": ["", ""],
  };

  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const formattedNow = Utils.getFormattedTime(now);
  console.log(formattedNow);

  const url1 = "https://rusutsu.com/snow-and-weather-report/";
  const selector1 = ".weather-info-wrap.mt-west";
  const success1 = await Utils.navigateSafely(page, url1, selector1);
  if (success1) {
    // コメント
    comment = `最新ニュースは<a href="${commentUrl[0]}">こちら</a>から。\n
  最新ブログは<a href="${commentUrl[1]}">こちら</a>から。
  `;

    // 天気・積雪情報
    const westMt = page.locator(".weather-info-wrap.mt-west");
    weather["ウエストMt."] = {
      update: await Utils.trimAndToHalfWidth(westMt.locator(".date-time")),
      weather: await Utils.trimAndToHalfWidth(westMt.locator(".weather")),
      temperature: (
        await Utils.trimAndToHalfWidth(westMt.locator(".temperature"))
      ).replace("℃", ""),
      snowDepth: (
        await Utils.trimAndToHalfWidth(westMt.locator(".snowfall"))
      ).replace("cm", ""),
      snowfall: (
        await Utils.trimAndToHalfWidth(westMt.locator(".snowfall-24"))
      ).replace("cm", ""),
      condition: await Utils.trimAndToHalfWidth(westMt.locator(".quality")),
      windSpeed: null,
    };

    const eastMt = page.locator(".weather-info-wrap.mt-east");
    weather["イーストMt."] = {
      update: await Utils.trimAndToHalfWidth(eastMt.locator(".date-time")),
      weather: await Utils.trimAndToHalfWidth(eastMt.locator(".weather")),
      temperature: (
        await Utils.trimAndToHalfWidth(eastMt.locator(".temperature"))
      ).replace("℃", ""),
      snowDepth: (
        await Utils.trimAndToHalfWidth(eastMt.locator(".snowfall"))
      ).replace("cm", ""),
      snowfall: (
        await Utils.trimAndToHalfWidth(eastMt.locator(".snowfall-24"))
      ).replace("cm", ""),
      condition: await Utils.trimAndToHalfWidth(eastMt.locator(".quality")),
      windSpeed: null,
    };

    const MtIsola = page.locator(".weather-info-wrap.mt-isola");
    weather["Mt.イゾラ"] = {
      update: await Utils.trimAndToHalfWidth(MtIsola.locator(".date-time")),
      weather: await Utils.trimAndToHalfWidth(MtIsola.locator(".weather")),
      temperature: (
        await Utils.trimAndToHalfWidth(MtIsola.locator(".temperature"))
      ).replace("℃", ""),
      snowDepth: (
        await Utils.trimAndToHalfWidth(MtIsola.locator(".snowfall"))
      ).replace("cm", ""),
      snowfall: (
        await Utils.trimAndToHalfWidth(MtIsola.locator(".snowfall-24"))
      ).replace("cm", ""),
      condition: await Utils.trimAndToHalfWidth(MtIsola.locator(".quality")),
      windSpeed: null,
    };
  }

  const url2 = "https://rusutsu.com/lift-and-trail-status/";
  const selector2 =
    '.section-inner:has-text("TRAIL STATUS") .lift-status-wrap .status-list li.encode_on';
  const success2 = await Utils.navigateSafely(page, url2, selector2);
  if (success2) {
    const courseElems = page.locator(
      '.section-inner:has-text("TRAIL STATUS") .lift-status-wrap .status-list li.encode_on',
    );
    const courseUpdate = await Utils.trimAndToHalfWidth(
      page.locator('.section-inner:has-text("TRAIL STATUS") .real-time-txt'),
    );
    for (let i = 0; i < (await courseElems.count()); i++) {
      const row = courseElems.nth(i);
      const rawName = (
        await Utils.trimAndToHalfWidth(row.locator(".item"))
      ).replace("コース", "");
      const name = courseNameMap[rawName] ?? rawName;

      const statusElem = await row.locator(".status").getAttribute("class");
      let status = null;
      if (statusElem?.includes("open")) {
        status = "○";
      } else if (statusElem?.includes("close")) {
        status = "×";
      } else if (statusElem?.includes("wait")) {
        status = "△";
      }

      const note = await Utils.trimAndToHalfWidth(
        row.locator(".info.encode_on"),
      );
      courses.push({
        name: name,
        status: status,
        update: courseUpdate,
        note: note,
      });
    }

    // リフト情報
    const liftElems = page.locator(
      '.section-inner:has-text("リフト運行状況") .lift-status-wrap .status-list li.encode_on',
    );
    const liftUpdate = await Utils.trimAndToHalfWidth(
      page.locator('.section-inner:has-text("リフト運行状況") .real-time-txt'),
    );
    for (let i = 0; i < (await liftElems.count()); i++) {
      const row = liftElems.nth(i);

      const rawName = (
        await Utils.trimAndToHalfWidth(row.locator(".item"))
      ).replace("リフト", "");
      const name = liftNameMap[rawName] ?? rawName;

      const statusElem = await row.locator(".status").getAttribute("class");
      let status = null;
      if (statusElem?.includes("open")) {
        status = "○";
      } else if (statusElem?.includes("close")) {
        status = "×";
      } else if (statusElem?.includes("wait")) {
        status = "△";
      }
      Utils.checkLift(resortName, name, status);

      const note1 = await Utils.trimAndToHalfWidth(
        row.locator(".info.encode_on"),
      );
      const note2 = await Utils.trimAndToHalfWidth(row.locator(".time"));
      const note = note1 ? `${note1} ${note2}` : note2;
      if (name in liftTwoLine) {
        const liftNames = liftTwoLine[name];
        for (const liftName of liftNames) {
          lifts.push({
            name: liftName,
            status: status,
            update: liftUpdate,
            note: note,
          });
        }
      } else {
        lifts.push({
          name: name,
          status: status,
          update: liftUpdate,
          note: note,
        });
      }
    }
  }

  const allLiftsClosed =
    lifts.length > 0 && lifts.every(lift => lift.status === "×");
  const config: WeatherValidationConfig = {
    temperature: { disabled: allLiftsClosed },
    snowDepth: { disabled: allLiftsClosed },
    snowfall: { disabled: allLiftsClosed },
    condition: { disabled: allLiftsClosed },
    windSpeed: { disabled: true },
  };

  weather = Utils.checkAllWeatherData(resortName, weather, config);

  const courseNum = 60;
  const liftNum = 18;
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
}

main();
