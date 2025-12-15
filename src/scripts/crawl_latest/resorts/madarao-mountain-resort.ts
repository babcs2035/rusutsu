import fs from "node:fs";
import { chromium, type Locator } from "playwright";

function toHalfWidth(str: string): string {
  return str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, s =>
    String.fromCharCode(s.charCodeAt(0) - 0xfee0),
  );
}
async function trimElem(element: Locator): Promise<string> {
  return ((await element.allInnerTexts())[0] || "").trim();
}
async function trimAndToHalfWidth(element: Locator): Promise<string> {
  const text = await trimElem(element);
  return toHalfWidth(text);
}

interface WeatherData {
  time: string | null;
  weather: string | null;
  temperature: number | string | null;
  snowDepth: number | string | null;
  snowfall: number | string | null;
  condition: string | null;
  windSpeed: number | string | null;
}

const browser = await chromium.launch();
const context = await browser.newContext({
  locale: "ja-JP",
});
const page = await context.newPage();

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;

// スキー場名
const resortName = "madarao-mountain-resort";
// スキー場のURL
const url1 = "https://www.madarao.jp/ski/conditions";
let success1 = true;
try {
  await page.goto(url1, { timeout: 60000 });
  const targetLocator = page.locator("img.lift_name");
  const targetLocator2 = page.locator(".flex-table-head.print-half").first();
  const isVisible = await targetLocator.isVisible({ timeout: 15000 });
  const isVisible2 = await targetLocator2.isVisible({ timeout: 15000 });
  if (!isVisible || !isVisible2) {
    console.error(
      `❌ [${resortName}] Target element not found or not visible in ${url1}`,
    );
    success1 = false;
  }
} catch (error) {
  let message = "Unknown error";
  if (error instanceof Error) {
    message = error.message.split("\n")[0]; // 最初の1行だけ
  } else {
    message = String(error);
  }
  console.error(`❌ [${resortName}] Error navigating to ${url1}: ${message}`);
  success1 = false;
}

let comment: string | undefined;
const weather: Record<string, WeatherData> = {};
const courses = [];
const lifts = [];
const treeruns = [];
let time = null;

if (success1) {
  // コメント
  comment = await trimAndToHalfWidth(
    page
      .locator('div.title-line-bottom:has-text("ゲレンデインフォメーション")')
      .locator("xpath=following-sibling::p[1]"),
  );
  if (comment == null || comment === "") {
    console.warn(`⚠️ [${resortName}] Comment is incorrect`);
  }
  time = await trimAndToHalfWidth(
    page.locator("div.col.col-main p.is-center.t-small"),
  );

  // 天気・積雪情報
  weather.中腹 = {
    time: time,
    weather: await trimAndToHalfWidth(
      page
        .locator('div.flex-table-head:has-text("天候")')
        .locator(
          'xpath=following-sibling::div[@class="flex-table-cell print-half"][1]',
        ),
    ),
    temperature: (
      await trimAndToHalfWidth(
        page
          .locator('div.flex-table-head:has-text("気温")')
          .locator('xpath=following-sibling::div[@class="flex-table-cell"][1]'),
      )
    )
      .replace("℃", "")
      .trim(),
    snowDepth: (
      await trimAndToHalfWidth(
        page
          .locator('div.flex-table-head:has-text("積雪")')
          .locator(
            'xpath=following-sibling::div[@class="flex-table-cell print-half"][1]',
          ),
      )
    )
      .replace("cm", "")
      .trim(),
    snowfall: (
      await trimAndToHalfWidth(
        page
          .locator('div.flex-table-head:has-text("降雪(24H)")')
          .locator(
            'xpath=following-sibling::div[@class="flex-table-cell print-half"][1]',
          ),
      )
    )
      .replace("cm", "")
      .trim(),
    condition: await trimAndToHalfWidth(
      page
        .locator('div.flex-table-head:has-text("雪質")')
        .locator('xpath=following-sibling::div[@class="flex-table-cell"][1]'),
    ),
    windSpeed: null,
  };

  for (const point of Object.keys(weather)) {
    const pointWeather = weather[point];
    if (pointWeather?.time == null || pointWeather?.time === "") {
      console.warn(`⚠️ [${resortName} (${point})] Time is incorrect`);
    }
    if (!comment.includes("シーズンの営業は終了")) {
      if (pointWeather?.weather == null || pointWeather?.weather === "") {
        console.warn(`⚠️ [${resortName} (${point})] Weather is null`);
      }
      pointWeather.temperature = parseFloat(
        pointWeather?.temperature?.toString() || "",
      );
      if (
        pointWeather?.temperature == null ||
        Number.isNaN(pointWeather?.temperature)
      ) {
        console.warn(`⚠️ [${resortName} (${point})] Temperature is null`);
      } else if (
        pointWeather?.temperature > 45.0 ||
        pointWeather?.temperature < -45.0
      ) {
        console.warn(
          `⚠️ [${resortName} (${point})] Temperature is ${pointWeather?.temperature}°C. Too high or too low !`,
        );
      }

      pointWeather.snowDepth = parseFloat(
        pointWeather?.snowDepth?.toString() || "",
      );
      if (
        pointWeather?.snowDepth == null ||
        Number.isNaN(pointWeather?.snowDepth)
      ) {
        console.warn(`⚠️ [${resortName} (${point})] Snow Depth is null`);
      }

      pointWeather.snowfall = parseFloat(
        pointWeather?.snowfall?.toString() || "",
      );
      if (
        pointWeather?.snowfall == null ||
        Number.isNaN(pointWeather?.snowfall)
      ) {
        console.warn(`⚠️ [${resortName} (${point})] Snowfall is null`);
      } else if (
        pointWeather?.snowfall > 130.0 ||
        pointWeather?.snowfall < -0.1
      ) {
        console.warn(
          `⚠️ [${resortName} (${point})] Snowfall is ${pointWeather?.snowfall}cm. Impossible!`,
        );
      }

      if (pointWeather?.condition == null || pointWeather?.condition === "") {
        console.warn(`⚠️ [${resortName} (${point})] Condition is incorrect`);
      }
    }
  }
  // コース情報
  // 2634: パラダイス
  // 2635: 初心者A
  // 2636: 初心者B
  // 2637: ユートピア
  // 2638: 白樺
  // 2639: チャンピオン下部
  // 2640: チャンピオン上部
  // 2641: ワールドカップ
  // 2642: カービング
  // 2643: ジャイアント下部
  // 2644: ジャイアント中部
  // 2645: ジャイアント上部
  // 2646: ポールバーンA
  // 2647: オーシャンビュー
  // 2648: トラバース
  // 2649: クリスタル下部
  // 2650: クリスタル中部
  // 2651: クリスタル上部
  // 2652: パウダーライン
  // 2653: スカイラブ上部
  // 2654: スカイラブ下部
  // 2655: スカイビュー

  const courseMap: Record<number, string> = {
    2634: "パラダイス",
    2635: "初心者A",
    2636: "初心者B",
    2637: "ユートピア",
    2638: "白樺",
    2639: "チャンピオン下部",
    2640: "チャンピオン上部",
    2641: "ワールドカップ",
    2642: "カービング",
    2643: "ジャイアント下部",
    2644: "ジャイアント中部",
    2645: "ジャイアント上部",
    2646: "ポールバーンA",
    2647: "オーシャンビュー",
    2648: "トラバース",
    2649: "クリスタル下部",
    2650: "クリスタル中部",
    2651: "クリスタル上部",
    2652: "パウダーライン",
    2653: "スカイラブ上部",
    2654: "スカイラブ下部",
    2655: "スカイビュー",
  };
  const foundIds = new Set<number>();

  const courseElems = page.locator('#course_canvas div[id^="open_"]');
  for (let i = 0; i < (await courseElems.count()); i++) {
    const row = courseElems.nth(i);
    const idAttr = await row.getAttribute("id"); // 例: "open_2635"
    const styleAttr = await row.getAttribute("style"); // style属性から背景画像を取得
    if (!idAttr || !styleAttr) continue;

    const idMatch = idAttr.match(/open_(\d+)/);
    if (!idMatch) continue;

    const courseId = parseInt(idMatch[1], 10);
    const name = courseMap[courseId];
    if (!name) continue;

    let status = null;
    let note = null;
    if (styleAttr.includes("_open.png")) {
      status = "○";
      note = "営業中";
    } else if (styleAttr.includes("_hold.png")) {
      status = "×";
      note = "見合わせ中";
    }

    if (status == null || status === "") {
      console.warn(`⚠️ [${resortName} ${name} Course] Status isincorrect`);
    } else if (status !== "○" && status !== "△" && status !== "×") {
      console.warn(
        `⚠️ [${resortName} ${name} Course] Status ({status}) is incorrect format`,
      );
    }

    foundIds.add(courseId);
    courses.push({
      name: name,
      status: status,
      time: null,
      note: note,
    });
  }

  for (const courseId in courseMap) {
    const id = parseInt(courseId, 10);
    if (!foundIds.has(id)) {
      courses.push({
        name: courseMap[id],
        status: "×",
        time: null,
        note: null,
      });
    }
  }

  // リフト情報, ツリーラン情報
  const elems = await page.locator(
    "div.panel-condition.mt-1l table.is-full tbody tr",
  );
  for (let i = 0; i < (await elems.count()); i++) {
    const row = elems.nth(i);
    const name = await trimAndToHalfWidth(await row.locator("th"));
    if (
      name.includes("リフト運行予定") ||
      name.includes("ツリーラン・パーク情報")
    ) {
    } else if (name.includes("リフト")) {
      const liftName = name.replace("リフト", "").trim();
      const note = await trimAndToHalfWidth(await row.locator("td"));
      let status = null;
      const timeRangeRegex = /^\d{1,2}:\d{2}〜\d{1,2}:\d{2}$/;
      if (note.includes("営業終了")) {
        status = "×";
      } else if (timeRangeRegex.test(note)) {
        status = "○";
      }
      if (!status) {
        console.warn(
          `⚠️ [${resortName} ${name} Lift] Status is null. Note is ${note}`,
        );
      }
      lifts.push({
        name: liftName,
        status: status,
        note: note,
      });
    } else {
      const courseName = name.replace("コース", "").trim();
      const statusImg = await row.locator("td img").getAttribute("src");
      let status = null;
      if (statusImg?.includes("open.svg")) {
        status = "○";
      } else if (statusImg?.includes("close.svg")) {
        status = "×";
      }
      if (!status) {
        console.warn(
          `⚠️ [${resortName} ${courseName} Tree Run] Status is null. `,
        );
      }
      treeruns.push({
        name: courseName,
        status: status,
        note: null,
      });
    }
  }

  const courseNum = 22;
  const liftNum = 9;
  const treeRunNum = 13;
  if (courses.length === 0) {
    console.warn(`⚠️ [${resortName}] No course data found`);
  } else if (courses.length !== courseNum) {
    console.warn(
      `⚠️ [${resortName}] Course count is ${courses.length}. Expected ${courseNum}.`,
    );
  }
  if (lifts.length === 0) {
    console.warn(`⚠️ [${resortName}] No lift data found`);
  } else if (lifts.length !== liftNum) {
    console.warn(
      `⚠️ [${resortName}] Lift count is ${lifts.length}. Expected ${liftNum}.`,
    );
  }
  if (treeruns.length === 0) {
    console.warn(`⚠️ [${resortName}] No treerun data found`);
  } else if (treeruns.length !== treeRunNum) {
    console.warn(
      `⚠️ [${resortName}] Treerun count is ${treeruns.length}. Expected ${treeRunNum}.`,
    );
  }
}

if (success1 === true) {
  const result = {
    resortName,
    time: now,
    comment,
    weather,
    courses,
    lifts,
    treeruns,
  };
  fs.writeFileSync(
    `../../data/resorts-temporary/latest_data/${resortName}/${formattedNow}.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(
    `✅ Saved: ../../data/resorts-temporary/latest_data/${resortName}/${formattedNow}.json`,
  );
} else {
  console.error(`❌ Failed to retrieve data from one or more URLs.`);
}
await browser.close();
