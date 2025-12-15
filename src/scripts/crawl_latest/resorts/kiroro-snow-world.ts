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
const resortName = "kiroro-snow-world";
// スキー場のURL
const url1 = "https://www.kiroro.co.jp/ja/dashboard/";
let success1 = true;
try {
  await page.goto(url1, { timeout: 60000 });
  const targetLocator = page.locator(".weather-table");
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
const treeruns = [];

if (success1) {
  // コメント
  comment = await trimAndToHalfWidth(
    page.locator(
      "table.weather-table > tbody > tr:nth-child(8) > td:nth-child(2)",
    ),
  );

  // 天気・積雪情報
  weather.山頂 = {
    time: await trimAndToHalfWidth(
      page.locator('div.panel-header-row:has-text("ゲレンデデータ") > span'),
    ),
    weather: await trimAndToHalfWidth(
      page.locator(
        "table.weather-table > tbody > tr:nth-child(1) > td:nth-child(2)",
      ),
    ),

    temperature: (
      await trimAndToHalfWidth(
        page.locator(
          "table.weather-table > tbody > tr:nth-child(2) > td:nth-child(2)",
        ),
      )
    ).replace("℃", ""),
    snowDepth: (
      await trimAndToHalfWidth(
        page.locator(
          "table.weather-table > tbody > tr:nth-child(3) > td:nth-child(2)",
        ),
      )
    ).replace("cm", ""),
    snowfall: (
      await trimAndToHalfWidth(
        page.locator(
          "table.weather-table > tbody > tr:nth-child(4) > td:nth-child(2)",
        ),
      )
    ).replace("cm", ""),
    condition: await trimAndToHalfWidth(
      page.locator(
        "table.weather-table > tbody > tr:nth-child(6) > td:nth-child(2)",
      ),
    ),
    windSpeed: (
      await trimAndToHalfWidth(
        page.locator(
          "table.weather-table > tbody > tr:nth-child(7) > td:nth-child(2)",
        ),
      )
    ).replace("m/s", ""),
  };

  weather.山麓 = {
    time: await trimAndToHalfWidth(
      page.locator('div.panel-header-row:has-text("ゲレンデデータ") > span'),
    ),
    weather: await trimAndToHalfWidth(
      page.locator(
        "table.weather-table > tbody > tr:nth-child(1) > td:nth-child(3)",
      ),
    ),
    temperature: (
      await trimAndToHalfWidth(
        page.locator(
          "table.weather-table > tbody > tr:nth-child(2) > td:nth-child(3)",
        ),
      )
    ).replace("℃", ""),
    snowDepth: (
      await trimAndToHalfWidth(
        page.locator(
          "table.weather-table > tbody > tr:nth-child(3) > td:nth-child(3)",
        ),
      )
    ).replace("cm", ""),
    snowfall: (
      await trimAndToHalfWidth(
        page.locator(
          "table.weather-table > tbody > tr:nth-child(4) > td:nth-child(3)",
        ),
      )
    ).replace("cm", ""),
    condition: await trimAndToHalfWidth(
      page.locator(
        "table.weather-table > tbody > tr:nth-child(6) > td:nth-child(3)",
      ),
    ),
    windSpeed: (
      await trimAndToHalfWidth(
        page.locator(
          "table.weather-table > tbody > tr:nth-child(7) > td:nth-child(3)",
        ),
      )
    ).replace("m/s", ""),
  };

  for (const point of Object.keys(weather)) {
    const pointWeather = weather[point];
    if (pointWeather?.time == null || pointWeather?.time === "") {
      console.warn(`⚠️ [${resortName} (${point})] Time is incorrect`);
    }
    if (pointWeather?.weather == null || pointWeather?.weather === "") {
      console.warn(`⚠️ [${resortName} (${point})] Weather is incorrect`);
    }

    pointWeather.temperature = parseFloat(
      pointWeather?.temperature?.toString() || "",
    );
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

    pointWeather.snowDepth = parseFloat(
      pointWeather?.snowDepth?.toString() || "",
    );
    if (
      pointWeather?.snowDepth == null ||
      Number.isNaN(pointWeather?.snowDepth)
    ) {
      console.warn(`⚠️ [${resortName} (${point})] Snow Depth is incorrect`);
    }

    pointWeather.snowfall = parseFloat(
      pointWeather?.snowfall?.toString() || "",
    );
    if (
      pointWeather?.snowfall == null ||
      Number.isNaN(pointWeather?.snowfall)
    ) {
      console.warn(`⚠️ [${resortName} (${point})] Snowfall is incorrect`);
    } else if (
      pointWeather?.snowfall > 130.0 ||
      pointWeather?.snowfall < -0.1
    ) {
      console.warn(
        `⚠️ [${resortName} (${point})] Snowfall is ${pointWeather?.snowfall}cm. Impossible!`,
      );
    }

    if (
      (pointWeather?.condition == null || pointWeather?.condition === "") &&
      pointWeather?.snowfall !== 0
    ) {
      console.warn(`⚠️ [${resortName} (${point})] Condition is incorrect`);
    }
    pointWeather.windSpeed = parseFloat(
      pointWeather?.windSpeed?.toString() || "",
    );
    if (pointWeather?.snowfall !== 0) {
      if (
        pointWeather?.windSpeed == null ||
        Number.isNaN(pointWeather?.windSpeed)
      ) {
        console.warn(`⚠️ [${resortName} (${point})] WindSpeed is incorrect`);
      }
    }
  }

  // コース情報
  const courseElems = page.locator(".operation-status-item:not(.ico-lift)");
  for (let i = 0; i < (await courseElems.count()); i++) {
    const row = courseElems.nth(i);
    const fullText = await trimAndToHalfWidth(row);
    const name = fullText.split("\n")[1].trim().replace("コース", "");
    if (name == null || name === "") {
      console.warn(`⚠️ [${resortName}] Course name is incorrect`);
    }
    const note = await trimElem(row.locator(".status"));
    let status: string = "";
    if (note.includes("営業中")) {
      status = "◯";
    } else if (
      note.includes("閉鎖中") ||
      note.includes("本日営業終了") ||
      note.includes("見合わせ")
    ) {
      status = "×";
    } else if (note.includes("一部")) {
      status = "△";
    } else {
      console.warn(
        `⚠️ [${resortName} ${name} Course] Status is incorrect: ${note}`,
      );
    }

    if (
      name === "パウダーリッジ" ||
      name === "オレンジ　ライト" ||
      name === "スノーソー" ||
      name === "フラッシュマン" ||
      name === "バーコード"
    ) {
      treeruns.push({
        name: name,
        status: status,
        note: note,
      });
    } else {
      courses.push({
        name: name,
        status: status,
        time: null,
        note: note,
      });
    }
  }

  // リフト情報
  const liftElems = await page.locator(".operation-status-item.ico-lift");
  for (let i = 0; i < (await liftElems.count()); i++) {
    const row = liftElems.nth(i);
    const fullText = await trimAndToHalfWidth(row);
    const name = fullText.split("\n")[0].replace("リフト", "");
    if (name == null || name === "") {
      console.warn(`⚠️ [${resortName}] Lift name is incorrect`);
    }
    const note = await trimElem(row.locator(".status"));
    let status: string = "";
    if (note.includes("運行中") || note.includes("減速運転")) {
      status = "◯";
    } else if (note.includes("運休") || note.includes("本日営業終了")) {
      status = "×";
    } else if (note.includes("待機") || note.includes("運行待ち")) {
      status = "△";
    } else {
      console.warn(`⚠️ [${resortName} ${name} Lift] Status is incorrect`);
    }

    lifts.push({
      name: name,
      status: status,
      note: note,
    });
  }

  const courseNum = 24;
  const liftNum = 10;
  const treerunNum = 5;
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
  } else if (treeruns.length !== treerunNum) {
    console.warn(
      `⚠️ [${resortName}] Treerun count is ${treeruns.length}. Expected ${treerunNum}.`,
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
