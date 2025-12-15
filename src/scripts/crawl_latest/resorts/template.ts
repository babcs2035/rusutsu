import fs from "node:fs";
import { chromium } from "playwright";
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

  const resortName: string = "";
  const weatherUrl: string[] = [""];
  const commentUrl: string[] = [""];
  const courseUrl: string[] = [""];
  const liftUrl: string[] = [""];

  // コース名, リフト名対応表の定義
  const courseNameMap: Record<string, string> = {
    "": "",
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

  const url1 = "";
  const selector1 = "";
  const success1 = await Utils.navigateSafely(page, url1, selector1);
  if (success1) {
    // コメント
    comment = await Utils.trimAndToHalfWidth(page.locator(""));

    // 天気・積雪情報
    weather.山頂 = {
      update: await Utils.trimAndToHalfWidth(page.locator("")),
      weather: await Utils.trimAndToHalfWidth(page.locator("")),
      temperature: (await Utils.trimAndToHalfWidth(page.locator(""))).replace(
        "℃",
        "",
      ),
      snowDepth: (await Utils.trimAndToHalfWidth(page.locator(""))).replace(
        "cm",
        "",
      ),
      snowfall: (await Utils.trimAndToHalfWidth(page.locator(""))).replace(
        "cm",
        "",
      ),
      condition: await Utils.trimAndToHalfWidth(page.locator("")),
      windSpeed: (await Utils.trimAndToHalfWidth(page.locator(""))).replace(
        "m/s",
        "",
      ),
    };

    weather.山麓 = {
      update: await Utils.trimAndToHalfWidth(page.locator("")),
      weather: await Utils.trimAndToHalfWidth(page.locator("")),
      temperature: (await Utils.trimAndToHalfWidth(page.locator(""))).replace(
        "℃",
        "",
      ),
      snowDepth: (await Utils.trimAndToHalfWidth(page.locator(""))).replace(
        "cm",
        "",
      ),
      snowfall: (await Utils.trimAndToHalfWidth(page.locator(""))).replace(
        "cm",
        "",
      ),
      condition: await Utils.trimAndToHalfWidth(page.locator("")),
      windSpeed: (await Utils.trimAndToHalfWidth(page.locator(""))).replace(
        "m/s",
        "",
      ),
    };
  }

  const url2 = "";
  const selector2 = "";
  const success2 = await Utils.navigateSafely(page, url2, selector2);
  if (success2) {
    const courseElems = page.locator("");
    for (let i = 0; i < (await courseElems.count()); i++) {
      const row = courseElems.nth(i);
      const rawName = (await Utils.trimAndToHalfWidth(row.locator(""))).replace(
        "コース",
        "",
      );

      const name = courseNameMap[rawName] ?? rawName;
      const status = await Utils.trimAndToHalfWidth(row.locator(""));
      Utils.checkCourse(resortName, name, status);

      const note = await Utils.trimAndToHalfWidth(row.locator(""));
      courses.push({
        name: name,
        status: status,
        update: null,
        note: note,
      });
    }

    // リフト情報
    const liftElems = page.locator("");
    for (let i = 0; i < (await liftElems.count()); i++) {
      const row = liftElems.nth(i);
      const rawName = (await Utils.trimAndToHalfWidth(row.locator(""))).replace(
        "リフト",
        "",
      );

      const name = liftNameMap[rawName] ?? rawName;
      const status = await Utils.trimAndToHalfWidth(row.locator(""));
      Utils.checkLift(resortName, name, status);

      const note = await Utils.trimAndToHalfWidth(row.locator(""));
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
