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
console.log(formattedNow);

// スキー場名
const resortName = "kurobushi-kogen-snow-park-jangle-jungle";
// スキー場のURL
const url1 = "https://jxj.co.jp/gelande/#todays";
let success1 = true;
try {
  await page.goto(url1, { timeout: 30000 });
  const targetLocator = page.locator("table.normal.main tbody");
  const isVisible = await targetLocator.isVisible({ timeout: 15000 });
  if (!isVisible) {
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

let comment = null;
const weather: Record<string, WeatherData> = {};
const courses = [];
const lifts = [];
const park = [];

if (success1) {
  // コメント
  comment = await page.locator("div.comment").innerHTML();
  const weatherElems = page.locator("li.row2.right ul.base_factor.flexbox");

  // 天気・積雪情報
  weather.中腹 = {
    time: await trimAndToHalfWidth(page.locator("div.titlearea .update")),
    weather: await trimAndToHalfWidth(weatherElems.locator("li.sub").nth(0)),
    temperature: (
      await trimAndToHalfWidth(weatherElems.locator('li.sub:has-text("℃")'))
    ).replace("℃", ""),
    snowDepth: (
      await trimAndToHalfWidth(weatherElems.locator('li.sub:has-text("cm")'))
    ).replace("cm", ""),
    snowfall: null,
    condition: null,
    windSpeed: (
      await trimAndToHalfWidth(weatherElems.locator('li.sub:has-text("m/s")'))
    ).replace("m/s", ""),
  };

  for (const point of Object.keys(weather)) {
    const pointWeather = weather[point];
    if (pointWeather?.time == null || pointWeather?.time === "") {
      console.warn(`⚠️ [${resortName} (${point})] Time is null or empty`);
    }
    if (pointWeather?.weather == null || pointWeather?.weather === "") {
      console.warn(`⚠️ [${resortName} (${point})] Weather is null or empty`);
    }
    if (pointWeather?.temperature !== "-") {
      pointWeather.temperature = parseFloat(
        pointWeather?.temperature?.toString() || "",
      );
      if (
        pointWeather?.temperature == null ||
        Number.isNaN(pointWeather?.temperature)
      ) {
        console.warn(`⚠️ [${resortName} (${point})] Temperature is null or NaN`);
      } else if (
        pointWeather?.temperature > 45.0 ||
        pointWeather?.temperature < -45.0
      ) {
        console.warn(
          `⚠️ [${resortName} (${point})] Temperature is ${pointWeather?.temperature}°C. Too high or too low !`,
        );
      }
    }

    if (pointWeather?.snowDepth !== "-") {
      pointWeather.snowDepth = parseFloat(
        pointWeather?.snowDepth?.toString() || "",
      );
      if (
        pointWeather?.snowDepth == null ||
        Number.isNaN(pointWeather?.snowDepth)
      ) {
        console.warn(`⚠️ [${resortName} (${point})] Snow Depth is null or NaN`);
      }
    }

    if (pointWeather?.windSpeed !== "-") {
      pointWeather.windSpeed = parseFloat(
        pointWeather?.windSpeed?.toString() || "",
      );
      if (
        pointWeather?.windSpeed == null ||
        Number.isNaN(pointWeather?.windSpeed)
      ) {
        console.warn(`⚠️ [${resortName} (${point})] WindSpeed is null or NaN`);
      }
    }
  }

  const elems = page.locator("table.normal.main tbody tr");
  let crawlStatus = null;
  for (let i = 0; i < (await elems.count()); i++) {
    const row = elems.nth(i);
    const rowText = await trimAndToHalfWidth(row);
    if (rowText.includes("リフト")) {
      crawlStatus = "リフト";
      continue;
    } else if (rowText.includes("コースオープン状況")) {
      crawlStatus = "コース";
      continue;
    } else if (rowText.includes("パークアイテム")) {
      crawlStatus = "パーク";
      continue;
    } else if (rowText.includes("コース") && rowText.includes("レベル")) {
      continue;
    }
    if (crawlStatus === "コース") {
      const courseName = (await trimAndToHalfWidth(row.locator("td.title")))
        .replace("コース", "")
        .replace(/^\d+\)\s*/, "");
      if (courseName == null || courseName === "") {
        console.warn(`⚠️ [${resortName}] Course name is null or empty`);
      }
      const status = await trimAndToHalfWidth(row.locator("td").nth(2));
      if (status == null || status === "") {
        console.warn(
          `⚠️ [${resortName} ${courseName} Course] Status is null or empty`,
        );
      } else if (status !== "○" && status !== "△" && status !== "×") {
        console.warn(
          `⚠️ [${resortName} ${courseName} Course] Status (${status}) is incorrect format`,
        );
      }
      const note = await trimElem(row.locator("td").nth(3));
      courses.push({
        name: courseName,
        status: status,
        note: note,
      });
    } else if (crawlStatus === "リフト") {
      const liftName = (
        await trimAndToHalfWidth(row.locator("td.title"))
      ).replace("リフト", "");
      if (liftName == null || liftName === "") {
        console.warn(`⚠️ [${resortName}] Lift name is null or empty`);
      }
      const status = await trimAndToHalfWidth(row.locator("td").nth(2));
      if (status == null || status === "") {
        console.warn(
          `⚠️ [${resortName} ${liftName} Lift] Status is null or empty`,
        );
      } else if (status !== "○" && status !== "△" && status !== "×") {
        console.warn(
          `⚠️ [${resortName} ${liftName} Lift] Status (${status}) is incorrect format`,
        );
      }
      const note = await trimElem(row.locator("td").nth(3));
      lifts.push({
        name: liftName,
        status: status,
        note: note,
      });
    } else if (crawlStatus === "パーク") {
      const parkName = (
        await trimAndToHalfWidth(row.locator("td.title"))
      ).replace(/^\d+\)\s*/, "");
      if (parkName == null || parkName === "") {
        console.warn(`⚠️ [${resortName}] Park name is null or empty`);
      }
      const status = await trimAndToHalfWidth(row.locator("td").nth(2));
      if (status == null || status === "") {
        console.warn(
          `⚠️ [${resortName} ${parkName} Park] Status is null or empty`,
        );
      } else if (status !== "○" && status !== "△" && status !== "×") {
        console.warn(
          `⚠️ [${resortName} ${parkName} Park] Status (${status}) is incorrect format`,
        );
      }
      const note = await trimElem(row.locator("td").nth(3));
      park.push({
        name: parkName,
        status: status,
        note: note,
      });
    }
  }

  const courseNum = 5;
  const liftNum = 3;
  const parkNum = 4;
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
  if (park.length === 0) {
    console.warn(`⚠️ [${resortName}] No park data found`);
  } else if (park.length !== parkNum) {
    console.warn(
      `⚠️ [${resortName}] Park count is ${park.length}. Expected ${parkNum}.`,
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
    park,
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
