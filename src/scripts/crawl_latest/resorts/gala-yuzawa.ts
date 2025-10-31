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
context.setDefaultTimeout(300000);
const page = await context.newPage();

// スキー場のURL
await page.goto("https://gala.co.jp/winter/");

const resortName = "gala-yuzawa"; // スキー場名
const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

await page.locator("#item_openclose").waitFor({ state: "visible" });
const comment = await trimAndToHalfWidth(page.locator("#item_openclose")); // コメント（適宜変更）

// 天気・積雪情報
const weather: Record<string, WeatherData> = {};
await page.locator("#item_temp1").waitFor({ state: "visible" });
const rawTemperature = (await trimAndToHalfWidth(page.locator("#item_temp1")))
  .replace("℃", "")
  .replace(/−/g, "-");
const rawSnowDepth = (
  await trimAndToHalfWidth(page.locator("#item_temp2"))
).replace("cm", "");
weather["中腹"] = {
  time: await trimAndToHalfWidth(page.locator("#item_update")),
  weather: await trimAndToHalfWidth(page.locator(".weather_txt:visible")),
  temperature: parseFloat(rawTemperature),
  snowDepth: parseFloat(rawSnowDepth),
  snowfall: null,
  condition: await trimAndToHalfWidth(page.locator("#item_snow_cond")),
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
  if (rawTemperature === "---" || rawTemperature === "-") {
  } else if (
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
  if (rawSnowDepth === "---" || rawSnowDepth === "-") {
  } else if (
    pointWeather?.snowDepth == null ||
    Number.isNaN(pointWeather?.snowDepth)
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Snow Depth is incorrect`);
  }
  if (pointWeather?.condition == null || pointWeather?.condition === "") {
    console.warn(`⚠️ [${resortName} (${point})] Condition is incorrect`);
  }
}

await page.goto("https://gala.co.jp/winter/gelande/");

const tables = page.locator("table.table-bordered");
await tables.nth(5).waitFor({ state: "visible" }); // 5番目のテーブルがリフト運行予定とかのはず
const courses = [];
const lifts = [];

for (let i = 0; i < (await tables.count()); i++) {
  const table = tables.nth(i);
  const headerTexts = await table
    .locator("tbody tr")
    .first()
    .locator("th")
    .allInnerTexts();

  const hasCourseHeaders = ["エリア", "区分", "コース名", "OPEN予定"].every(
    keyword => headerTexts.some(text => text.includes(keyword)),
  );

  const hasLiftHeaders = ["エリア", "リフト名", "運行予定"].every(keyword =>
    headerTexts.some(text => text.includes(keyword)),
  );

  if (hasCourseHeaders) {
    const rows = table.locator("tbody tr");
    for (let j = 1; j < (await rows.count()); j++) {
      const row = rows.nth(j);
      const cells = row.locator("td");
      const texts = await Promise.all(
        Array.from({ length: await cells.count() }, (_, j) =>
          trimAndToHalfWidth(cells.nth(j)),
        ),
      );

      // 4 セルなら [エリア, レベル, 名前, ステータス]
      // 3 セルなら [レベル, 名前, ステータス]
      let name: string = "",
        status: string = "";
      if (texts.length === 4) {
        [, , name, status] = texts;
      } else if (texts.length === 3) {
        [, name, status] = texts;
      }
      if (status === "－") {
        status = "×";
      }

      name = name
        .replace("コース", "")
        .replace(/[（(].*?[）)]/, "")
        .trim();
      if (name == null || name === "") {
        console.warn(`⚠️ [${resortName}] Course name is incorrect`);
      }
      if (status == null || status === "") {
        console.warn(`⚠️ [${resortName} ${name} Course] Status is incorrect`);
      } else if (status !== "○" && status !== "△" && status !== "×") {
        console.warn(
          `⚠️ [${resortName} ${name} Course] Status is incorrect format`,
        );
      }
      const note = null;
      courses.push({
        name: name,
        status: status,
        time: null,
        note: note,
      });
    }
  } else if (hasLiftHeaders) {
    const rows = table.locator("tbody tr");
    for (let j = 1; j < (await rows.count()); j++) {
      const row = rows.nth(j);
      const cells = row.locator("td");
      const texts = await Promise.all(
        Array.from({ length: await cells.count() }, (_, j) =>
          trimAndToHalfWidth(cells.nth(j)),
        ),
      );

      let name: string = "",
        status: string = "";
      if (texts.length === 3) {
        [, name, status] = texts;
      } else if (texts.length === 2) {
        [name, status] = texts;
      }
      name = name
        .replace("リフト", "")
        .replace(/[（(].*?[）)]/, "")
        .trim();
      if (name == null || name === "") {
        console.warn(`⚠️ [${resortName}] Lift name is incorrect`);
      }
      if (status == null || status === "") {
        console.warn(`⚠️ [${resortName} ${name} Lift] Status is incorrect`);
      } else if (status !== "○" && status !== "△" && status !== "×") {
        console.warn(
          `⚠️ [${resortName} ${name} Lift] Status is incorrect format`,
        );
      }
      const note = null;
      lifts.push({
        name: name,
        status: status,
        note: note,
      });
    }
  }
}

const courseNum = 21;
const liftNum = 11;
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

const result = {
  resortName,
  time: now,
  comment,
  weather,
  courses,
  lifts,
};

fs.writeFileSync(
  `../../data/resorts-temporary/latest_data/${resortName}/${formattedNow}.json`,
  JSON.stringify(result, null, 2),
);
console.log(
  `✅ Saved: ../../data/resorts_cousce_lift/latest_data/${resortName}/${formattedNow}.json`,
);

await browser.close();
