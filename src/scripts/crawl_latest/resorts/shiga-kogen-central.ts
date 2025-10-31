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

const weatherUrl: string[] = [
  "https://www.shigakogen-ski.or.jp/lift/ichinosefamily/",
];
const commentUrl: string[] = ["https://shigakogen.co.jp/winter/"];
const courseUrl: string[] = [
  "https://www.shigakogen-ski.or.jp/lift/index.html",
];
const liftUrl: string[] = ["https://www.shigakogen-ski.or.jp/lift/index.html"];

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const formattedNow = Utils.getFormattedTime(now);
console.log(formattedNow);

console.log(Utils.toHalfWidth("サンバレーB＋メイン"));

// スキー場名
const resortName: string = "shiga-kogen-central";

const url1 = "https://shigakogen.co.jp/winter/";
const selector1 = ".info_list .weather";
const success1 = await Utils.navigateSafely(page, url1, selector1);
if (success1) {
  // コメント
  comment = await page.innerHTML(".left_box .text");
}

const url2 = "https://www.shigakogen-ski.or.jp/lift/ichinosefamily/";
const selector2 = '.blue-back:has-text("天気")';
const success2 = await Utils.navigateSafely(page, url2, selector2);
if (success2) {
  // 天気・積雪情報
  weather["一の瀬ファミリー"] = {
    update: await Utils.trimAndToHalfWidth(
      page.locator('.sub-data:has-text("最終更新")'),
    ),
    weather: await Utils.trimAndToHalfWidth(
      page.locator('.blue-back:has-text("天気") p'),
    ),
    temperature: (
      await Utils.trimAndToHalfWidth(
        page.locator('.blue-back:has-text("気温") p'),
      )
    ).replace("℃", ""),
    snowDepth: (
      await Utils.trimAndToHalfWidth(
        page.locator('.blue-back:has-text("積雪") p'),
      )
    ).replace("cm", ""),
    snowfall: null,
    condition: null,
    windSpeed: null,
  };

  const config: WeatherValidationConfig = {
    weather: { disabled: raw => raw === "準備中" },
    temperature: { disabled: raw => raw === "シーズン終了" },
    snowDepth: { disabled: raw => raw === "シーズン終了" },
    snowfall: { disabled: true },
    condition: { disabled: true },
    windSpeed: { disabled: true },
  };

  weather = Utils.checkAllWeatherData(resortName, weather, config);
}

// コース名, リフト名対応表の定義
const courseNameMap: Record<string, string> = {
  ジャイアント連絡: "蓮池・ジャイアント連絡",
  "東館山オリンピック(上部)": "東館山オリンピック上部",
  "東館山オリンピック(下部)": "東館山オリンピック下部",
  "東館山オリンピック(中部)": "東館山オリンピック中部",
  "高天ヶ原マンモスゲレンデ(上部)": "高天ヶ原マンモスゲレンデ上部",
  "高天ヶ原マンモスゲレンデ(下部)": "高天ヶ原マンモスゲレンデ下部",
  "【上部】ワールドカップ(上部)": "ワールドカップ上部",
  "【上部】西館山初級(上部)": "西館山初級上部",
  "【上部】西館山高天ヶ原ゲレンデ": "西館山高天ヶ原ゲレンデ",
  "【下部】西館山初級(下部)": "西館山初級下部",
  "【下部】ワールドカップ(下部)": "ワールドカップ下部",
  "一の瀬ファミリー正面ゲレンデ(上部)": "一の瀬ファミリー正面ゲレンデ上部",
  "一の瀬ファミリー正面ゲレンデ(下部)": "一の瀬ファミリー正面ゲレンデ下部",
  ダイヤモンドゲレンデ: "一の瀬ダイヤモンドゲレンデ",
};
const liftNameMap: Record<string, string> = {
  "【下部】西館山クワッド": "西館山クワッド",
  "【上部】西館第1フーディークワッド": "西館第1フーディークワッド",
  "【上部】西館第2トリプル": "西館第2トリプル",
};
const url3 = "https://shigakogen-ski.or.jp/lift/";
const selector3 = '.live-detail:has-text("詳細")';
const success3 = await Utils.navigateSafely(page, url3, selector3);
const targetResorts = [
  "サンバレー",
  "丸池",
  "蓮池",
  "ジャイアント",
  "東館山",
  "発哺ブナ平",
  "高天ヶ原マンモス",
  "西館山",
  "タンネの森",
  "一の瀬ファミリー",
  "寺小屋",
  "一の瀬ダイヤモンド",
  "一の瀬山の神",
];

if (success3) {
  const resortElems = page.locator(".mb70", {
    has: page.locator(".sub-name-b.mb20", {
      hasText: new RegExp(targetResorts.join("|")),
    }),
  });
  for (let i = 0; i < (await resortElems.count()); i++) {
    const postSelector =
      "#sub-contents-c .contents-innner .live-list-data-inner";
    console.log(
      `🔍 Processing resort: ${await Utils.trimAndToHalfWidth(resortElems.nth(i).locator(".sub-name-b.mb20"))}`,
    );
    await Utils.clickSafely(
      page,
      resortElems.nth(i).locator('.live-detail:has-text("詳細") li a'),
      postSelector,
    );

    // コース情報
    const courseElems = page.locator(
      "#sub-contents-c .contents-innner .live-list-data-inner",
    );
    for (let j = 0; j < (await courseElems.count()); j++) {
      const row = courseElems.nth(j);
      // const fullName = (await Utils.trimAndToHalfWidth(row.locator('.live-list-data-a'))).replace('コース', '');
      // const enName = await Utils.trimAndToHalfWidth(row.locator('p.live-list-data-a span'));
      // const rawName = fullName.replace(enName, "").trimEnd();

      const rawName = (
        await row.locator(".live-list-data-a").evaluate(el => {
          // spanをすべて消す
          const spans = el.querySelectorAll("span");
          spans.forEach(span => {
            span.remove();
          });
          return el.textContent?.trim() || "";
        })
      ).replace("コース", "");
      const name = Utils.toHalfWidth(courseNameMap[rawName] ?? rawName);

      const note = await row
        .locator("p")
        .nth(1)
        .evaluate(el => {
          // spanをすべて消す
          const spans = el.querySelectorAll("span");
          spans.forEach(span => {
            span.remove();
          });
          return el.textContent?.trim() || "";
        });
      let status = null;
      if (note.includes("全面滑走可")) {
        status = "○";
      } else if (note.includes("一部")) {
        status = "△";
      } else if (
        note.includes("閉鎖中") ||
        note.includes("滑走不可") ||
        note.includes("天候回復待")
      ) {
        status = "×";
      }
      Utils.checkCourse(resortName, name, status);
      courses.push({
        name: name,
        status: status,
        update: null,
        note: note,
      });
    }

    // リフト情報
    const liftElems = page.locator(
      "#sub-contents-d .sub-contents div.live-list-data-inner",
    );
    for (let k = 0; k < (await liftElems.count()); k++) {
      const row = liftElems.nth(k);
      const rawName = (
        await row.locator(".live-lift-data-a").evaluate(el => {
          // spanをすべて消す
          const spans = el.querySelectorAll("span");
          spans.forEach(span => {
            span.remove();
          });
          return el.textContent?.trim() || "";
        })
      ).replace("リフト", "");
      const name = Utils.toHalfWidth(liftNameMap[rawName] ?? rawName);
      const statusText = await row
        .locator("div.live-lift-r >> div.f-box > p")
        .nth(0)
        .evaluate(el => {
          // spanをすべて消す
          const spans = el.querySelectorAll("span");
          spans.forEach(span => {
            span.remove();
          });
          return el.textContent?.trim() || "";
        });
      const timeNote = await Utils.trimAndToHalfWidth(
        row.locator(
          '.live-lift-feel-la:has-text("運行時間") .live-lift-feel-la',
        ),
      );
      const note = statusText + " " + timeNote;
      let status = null;
      if (statusText.includes("運行中")) {
        status = "○";
      } else if (statusText.includes("準備")) {
        status = "△";
      } else if (statusText.includes("運休")) {
        status = "×";
      }
      Utils.checkLift(resortName, name, status);

      lifts.push({
        name: name,
        status: status,
        update: null,
        note: note,
      });
    }

    await page.goBack();
  }

  const courseNum = 46;
  const liftNum = 24;
  Utils.checkCourseLiftCount(resortName, courses, courseNum, lifts, liftNum);
}

Utils.checkUrl(resortName, weatherUrl, commentUrl, courseUrl, liftUrl);

if (success1 === true && success2 === true && success3 === true) {
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
