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

const weatherUrl: string[] = ["https://www.yukidaruma-kogen.com/winter.html"];
const commentUrl: string[] = [
  "https://www.yukidaruma-kogen.com/winter.html",
  "https://www.yukidaruma-kogen.com/winter/news-event-winter/",
];
const courseUrl: string[] = [""];
const liftUrl: string[] = ["https://www.yukidaruma-kogen.com/winter.html"];

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const formattedNow = Utils.getFormattedTime(now);
console.log(formattedNow);

// スキー場名
const resortName: string = "cupid-valley";
const url1 = "https://www.yukidaruma-kogen.com/winter.html";
const selector1 =
  '.todayBlk05:has-text("温度") tbody tr:has-text("TOP") td:nth-child(3)';
const success1 = await Utils.navigateSafely(page, url1, selector1);
if (success1) {
  // コメント
  const commentHp = await Utils.trimAndToHalfWidth(
    page.locator(".todaysInfo dl dd"),
  );
  const newsUrl = `https://www.yukidaruma-kogen.com/winter/news-event-winter/`;
  const commentLink = `<a href="${newsUrl}">最新ニュースはこちらから</a>`;
  if (commentHp === "") {
    comment = commentLink;
  } else {
    comment = `${commentHp}\n\n${commentLink}`.trim();
  }

  const amWeatherImgUrl = await Utils.safeGetAttribute(
    page,
    '.todayBlk02:has-text("天気") .todayBlk02__am img',
    "src",
  );
  const pmWeatherImgUrl = await Utils.safeGetAttribute(
    page,
    '.todayBlk02:has-text("天気") .todayBlk02__pm img',
    "src",
  );

  let weatherText = "";
  let weatherImgUrl = "";
  if (amWeatherImgUrl && pmWeatherImgUrl) {
    if (Date.now() < new Date().setHours(12, 0, 0, 0)) {
      weatherImgUrl = amWeatherImgUrl;
    } else {
      weatherImgUrl = pmWeatherImgUrl;
    }
  }
  if (weatherImgUrl !== "") {
    if (weatherImgUrl?.endsWith("sun.png")) {
      weatherText = "晴れ";
    } else if (weatherImgUrl?.endsWith("cloud.png")) {
      weatherText = "曇り";
    } else if (weatherImgUrl?.endsWith("rain.png")) {
      weatherText = "雨";
    } else if (weatherImgUrl?.endsWith("snow.png")) {
      weatherText = "雪";
    }
  }

  // 天気・積雪情報
  weather.山頂 = {
    update: null,
    weather: weatherText,
    temperature: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '.todayBlk05:has-text("温度") tbody tr:has-text("TOP") td:nth-child(3)',
        ),
      )
    ).replace("℃", ""),
    snowDepth: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '.todayBlk05:has-text("積雪") tbody tr:has-text("TOP") td:nth-child(1)',
        ),
      )
    ).replace("cm", ""),
    snowfall: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '.todayBlk05:has-text("降雪") tbody tr:has-text("TOP") td:nth-child(2)',
        ),
      )
    ).replace("cm", ""),
    condition: null,
    windSpeed: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '.todayBlk05:has-text("風速") tbody tr:has-text("TOP") td:nth-child(4)',
        ),
      )
    ).replace("m", ""),
  };

  weather.中腹 = {
    update: null,
    weather: weatherText,
    temperature: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '.todayBlk05:has-text("温度") tbody tr:has-text("MID") td:nth-child(3)',
        ),
      )
    ).replace("℃", ""),
    snowDepth: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '.todayBlk05:has-text("積雪") tbody tr:has-text("MID") td:nth-child(1)',
        ),
      )
    ).replace("cm", ""),
    snowfall: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '.todayBlk05:has-text("降雪") tbody tr:has-text("MID") td:nth-child(2)',
        ),
      )
    ).replace("cm", ""),
    condition: null,
    windSpeed: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '.todayBlk05:has-text("風速") tbody tr:has-text("MID") td:nth-child(4)',
        ),
      )
    ).replace("m", ""),
  };

  weather.山麓 = {
    update: null,
    weather: weatherText,
    temperature: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '.todayBlk05:has-text("温度") tbody tr:has-text("BASE") td:nth-child(3)',
        ),
      )
    ).replace("℃", ""),
    snowDepth: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '.todayBlk05:has-text("積雪") tbody tr:has-text("BASE") td:nth-child(1)',
        ),
      )
    ).replace("cm", ""),
    snowfall: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '.todayBlk05:has-text("降雪") tbody tr:has-text("BASE") td:nth-child(2)',
        ),
      )
    ).replace("cm", ""),
    condition: null,
    windSpeed: (
      await Utils.trimAndToHalfWidth(
        page.locator(
          '.todayBlk05:has-text("風速") tbody tr:has-text("BASE") td:nth-child(4)',
        ),
      )
    ).replace("m", ""),
  };

  // リフト情報
  const liftElems = page.locator(
    '.todayDl03:has-text("運行予定") .todayBlk03__list li dl',
  );
  for (let i = 0; i < (await liftElems.count()); i++) {
    const row = liftElems.nth(i);
    const name = (await Utils.trimAndToHalfWidth(row.locator("dt"))).replace(
      "リフト",
      "",
    );

    let status = "";
    const statusText = await Utils.trimAndToHalfWidth(
      row.locator(".todayBlk03__txt"),
    );
    if (statusText.includes("⚪︎")) {
      status = "○";
    } else if (statusText.includes("-") || statusText.includes("休止中")) {
      status = "×";
    } else if (statusText.includes("準備") || statusText.includes("天候回復")) {
      status = "△";
    }

    Utils.checkLift(resortName, name, status);

    let note = "";
    const start = row.locator(".todayBlk01__start");
    const end = row.locator(".todayBlk01__end");

    if (
      name === "第3ペア" &&
      (await start.count()) === 2 &&
      (await end.count()) === 2
    ) {
      note =
        `${statusText} ${await Utils.trimAndToHalfWidth(start.nth(0))}~${await Utils.trimAndToHalfWidth(end.nth(1))}`.trim();
    } else {
      note =
        `${statusText} ${await Utils.trimAndToHalfWidth(start)}~${await Utils.trimAndToHalfWidth(end)}`.trim();
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
  update: { disabled: true },
  weather: { disabled: allLiftsClosed },
  temperature: { disabled: allLiftsClosed },
  snowDepth: { disabled: allLiftsClosed },
  snowfall: { disabled: allLiftsClosed },
  condition: { disabled: true },
  windSpeed: { disabled: allLiftsClosed },
};

weather = Utils.checkAllWeatherData(resortName, weather, config);
const liftNum = 3;
Utils.checkCourseLiftCount(resortName, lifts, liftNum);
Utils.checkUrl(resortName, weatherUrl, commentUrl, liftUrl);

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
