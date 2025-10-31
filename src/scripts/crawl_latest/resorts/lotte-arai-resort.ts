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
  temperature: number | null;
  snowDepth: number | null;
  snowfall: number | null;
  condition: string | null;
  windSpeed: number | null;
}

const browser = await chromium.launch();
const context = await browser.newContext({
  locale: "ja-JP",
});
const page = await context.newPage();

const resortName = "lotte-arai-resort"; // スキー場名

await page.goto("https://www.lottehotel.com/arai-resort/ja/snow/slopes-map"); // 実際のURLに差し替えて
try {
  await page.locator('button:has-text("完全な同意")').click({ timeout: 5000 });
} catch (e) {
  console.log(
    `[${resortName}] Cookieボタンは表示されていないか、クリックできませんでした`,
  );
}

// スキー場のURL
await page.goto("https://www.lottehotel.com/arai-resort/ja/snow/slopes-guide"); // 実際のURLに差し替えて
// try {
//   await page.locator('button:has-text("完全な同意")').click({ timeout: 5000 });
// } catch (e) {
//   console.log(`[${resortName}] Cookieボタンは表示されていないか、クリックできませんでした`);
// }

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
const formattedNow2 = `${year}-${month}-${day} ${hour}:${minute}`;
console.log(formattedNow);

await page.locator(".box-notice-wrap").waitFor({ state: "visible" });
const comment = await trimAndToHalfWidth(page.locator(".box-notice-wrap")); // コメント（適宜変更）

// 天気・積雪情報
const weather: Record<string, WeatherData> = {};
await page.locator(".weather-item.current").waitFor({ state: "visible" });
await page.locator(".temperature").waitFor({ state: "visible" });
weather["山頂"] = {
  time:
    (
      await trimAndToHalfWidth(
        page.locator('.sub-txt04:has-text("最近のアップデート")'),
      )
    ).replace("最近のアップデート", "") + `  ※気温は${formattedNow2}`,
  weather: await page
    .locator(".weather-item.current")
    .locator(".ico")
    .getAttribute("aria-label"),
  temperature: parseFloat(
    (await trimAndToHalfWidth(page.locator(".temperature"))).replace("℃", ""),
  ),
  snowDepth: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator('.snow-item:has-text("積雪量")').locator(".snowfall"),
      )
    ).replace("cm", ""),
  ),
  snowfall: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator('.snow-item:has-text("新雪")').locator(".snowfall"),
      )
    ).replace("cm", ""),
  ),
  condition: await trimAndToHalfWidth(
    page
      .locator('.snow-item:has-text("雪質")')
      .locator('.quality:has-text("上部")')
      .locator(".state"),
  ),
  windSpeed: null,
};

for (const point of Object.keys(weather)) {
  const pointWeather = weather[point];
  if (pointWeather?.time == null || pointWeather?.time === "") {
    console.warn(`⚠️ [${resortName} (${point})] Time is incorrect`);
  }
  if (pointWeather?.weather == null || pointWeather?.weather === "") {
    console.warn(`⚠️ [${resortName} (${point})] Weather is incorrect`);
  }
  if (
    pointWeather?.temperature == null ||
    Number.isNaN(pointWeather?.temperature)
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Temperature is incorrect`);
  } else if (
    pointWeather?.temperature > 45.0 ||
    pointWeather?.temperature < -45.0
  ) {
    console.warn(
      `⚠️ [${resortName} (${point})] Temperature is ${pointWeather?.temperature}°C. Too high or too low !`,
    );
  }
  if (
    pointWeather?.snowDepth == null ||
    Number.isNaN(pointWeather?.snowDepth)
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Snow Depth is incorrect`);
  }
  if (pointWeather?.snowfall == null || Number.isNaN(pointWeather?.snowfall)) {
    console.warn(`⚠️ [${resortName} (${point})] Snowfall is incorrect`);
  } else if (pointWeather?.snowfall > 130.0 || pointWeather?.snowfall < -0.1) {
    console.warn(
      `⚠️ [${resortName} (${point})] Snowfall is ${pointWeather?.snowfall}cm. Impossible!`,
    );
  }
  if (pointWeather?.condition == null || pointWeather?.condition === "") {
    console.warn(`⚠️ [${resortName} (${point})] Condition is incorrect`);
  }
}

// コース情報
try {
  await page
    .locator('button.chip-btn:has-text("コース")')
    .click({ timeout: 5000 });
} catch (e) {
  console.log(
    `[${resortName}] Course button is not displayed or could not be clicked`,
  );
}

const courseElems = await page.locator(".txt-data-item");
const courses = [];
const timeCourse = await trimAndToHalfWidth(
  page.locator('.chips-util:has-text("最後の更新")').locator(".datetime"),
);
if (timeCourse == null || timeCourse === "") {
  console.warn(`⚠️ [${resortName}] time(course) is incorrect`);
}
for (let i = 0; i < (await courseElems.count()); i++) {
  const row = courseElems.nth(i);
  const name = (
    await trimAndToHalfWidth(await row.locator(".data-info"))
  ).replace("コース", "");
  if (name == null || name === "") {
    console.warn(`⚠️ [${resortName}] Course name is incorrect`);
  }
  const statusText = await row.locator(".ico").getAttribute("aria-label");
  let status = null;
  if (statusText === "フロントスライド可能") {
    status = "○";
  } else if (
    statusText === "準備中" ||
    statusText === "滑走不可" ||
    statusText === "シーズン終了"
  ) {
    status = "×";
  } else if (statusText === "一部スライド可能") {
    status = "△";
  }
  if (status == null || status === "") {
    console.warn(`⚠️ [${resortName} ${name} Course] Status is incorrect`);
  } else if (status !== "○" && status !== "△" && status !== "×") {
    console.warn(
      `⚠️ [${resortName} ${name} Course] Status (${status}) is incorrect format`,
    );
  }
  courses.push({
    name: name,
    status: status,
    time: timeCourse,
    note: null,
  });
}

// リフト情報
try {
  await page
    .locator('button.chip-btn:has-text("ゴンドラ＆リフト")')
    .click({ timeout: 5000 });
} catch (e) {
  console.log(
    `[${resortName}] Lift button is not displayed or could not be clicked`,
  );
}

const liftElems = await page.locator(".txt-data-item");
const lifts = [];
const timeLift = await trimAndToHalfWidth(
  page.locator('.chips-util:has-text("最後の更新")').locator(".datetime"),
);
if (timeLift == null || timeLift === "") {
  console.warn(`⚠️ [${resortName}] time(lift) is incorrect`);
}
for (let i = 0; i < (await liftElems.count()); i++) {
  const row = liftElems.nth(i);
  const name = (
    await trimAndToHalfWidth(await row.locator(".info-title"))
  ).replace("リフト", "");
  if (name == null || name === "") {
    console.warn(`⚠️ [${resortName}] Lift name is incorrect`);
  }
  const statusText = await row.locator(".ico").getAttribute("aria-label");
  let status = null;
  if (statusText === "運転中") {
    status = "○";
  } else if (statusText === "運転停止" || statusText === "シーズン終了") {
    status = "×";
  } else if (statusText === "準備中") {
    status = "△";
  }
  if (status == null || status === "") {
    console.warn(`⚠️ [${resortName} ${name} Lift] Status is incorrect`);
  } else if (status !== "○" && status !== "△" && status !== "×") {
    console.warn(
      `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
    );
  }
  lifts.push({
    name: name,
    status: status,
    time: timeLift,
    note: null,
  });
}

const courseNum = 14;
const liftNum = 5;
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

// ツリーラン
try {
  await page
    .locator('button.chip-btn:has-text("フリーライディングゾーン")')
    .click({ timeout: 5000 });
} catch (e) {
  console.log(
    `[${resortName}] Lift button is not displayed or could not be clicked`,
  );
}

const treerunElems = await page.locator(".txt-data-item");
const treeruns = [];
const timeTreerun = await trimAndToHalfWidth(
  page.locator('.chips-util:has-text("最後の更新")').locator(".datetime"),
);
if (timeTreerun == null || timeTreerun === "") {
  console.warn(`⚠️ [${resortName}] time(course) is incorrect`);
}
for (let i = 0; i < (await treerunElems.count()); i++) {
  const row = treerunElems.nth(i);
  const name = (
    await trimAndToHalfWidth(await row.locator(".data-info"))
  ).replace("コース", "");
  if (name == null || name === "") {
    console.warn(`⚠️ [${resortName}] Course name is incorrect`);
  }
  const statusText = await row.locator(".ico").getAttribute("aria-label");
  let status = null;
  if (statusText === "フロントスライド可能") {
    status = "○";
  } else if (
    statusText === "準備中" ||
    statusText === "滑走不可" ||
    statusText === "シーズン終了"
  ) {
    status = "×";
  } else if (statusText === "一部スライド可能") {
    status = "△";
  }
  if (status == null || status === "") {
    console.warn(
      `⚠️ [${resortName} ${name} treerun Course] Status is incorrect`,
    );
  } else if (status !== "○" && status !== "△" && status !== "×") {
    console.warn(
      `⚠️ [${resortName} ${name} treerun Course] Status (${status}) is incorrect format`,
    );
  }
  treeruns.push({
    name: name,
    status: status,
    time: timeCourse,
    note: null,
  });
}
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
  `✅ Saved: ../../data/resorts_cousce_lift/latest_data/${resortName}/${formattedNow}.json`,
);

await browser.close();
