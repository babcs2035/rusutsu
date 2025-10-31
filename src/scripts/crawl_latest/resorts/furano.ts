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

// スキー場名とコメント
const resortName = "furano";

// スキー場のURL
const url1 = "https://furapuri.com/ski/";
let success1 = true;
try {
  await page.goto(url1, { timeout: 15000 });
  const targetLocator = page.locator("#app > div.info > table");
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
    message = error.message.split("\n")[0];
  } else {
    message = String(error);
  }
  console.error(`❌ [${resortName}] Error navigating to ${url1}: ${message}`);
  success1 = false;
}

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;

const comment = null; // コメント（適宜変更）

const dateText = await trimAndToHalfWidth(
  page.locator("#app > div.info > dl > dd"),
);
const match = dateText.match(/^(\d{4}年\d{1,2}月\d{1,2}日\(.\))/);
if (!match) {
  console.warn(`⚠️ [${resortName}] Date format not matched`); // エラーハンドリング
}
const dateOnly = match ? match[1] : null;

const weatherMap: { [key: string]: string } = {
  sunny: "晴れ",
  clear: "晴れ",
  cloudy: "くもり",
  cloud: "くもり",
  rain: "雨",
  showers: "雨",
  sprinkle: "小雨",
  snow: "雪",
  hail: "ひょう",
  sleet: "みぞれ",
};

// 天気・積雪情報
const weather: Record<string, WeatherData> = {};
if (success1) {
  // 日付だけ抽出
  const dateText = await trimAndToHalfWidth(
    page.locator("#app > div.info > dl > dd"),
  );
  const match = dateText.match(/^(\d{4}年\d{1,2}月\d{1,2}日\(.\))/);
  const dateOnly = match ? match[1] : null;
  if (!match) {
    console.warn(`⚠️ [${resortName}] Date format not matched`);
  }

  // マッピング
  const weatherMap: { [key: string]: string } = {
    sunny: "晴れ",
    clear: "晴れ",
    cloudy: "くもり",
    cloud: "くもり",
    rain: "雨",
    showers: "雨",
    sprinkle: "小雨",
    snow: "雪",
    hail: "ひょう",
    sleet: "みぞれ",
  };

  const topClass = await page
    .locator(
      "#app > div.info > table > tbody > tr:nth-child(2) > td:nth-child(2) > i",
    )
    .getAttribute("class");
  let topWeather: string | null = null;
  if (topClass) {
    for (const key in weatherMap) {
      if (topClass.includes(key)) {
        topWeather = weatherMap[key];
        break;
      }
    }
  }

  weather["山頂"] = {
    time: dateOnly,
    weather: topWeather,
    temperature: (
      await trimAndToHalfWidth(
        page.locator(
          "#app > div.info > table > tbody > tr:nth-child(2) > td:nth-child(6)",
        ),
      )
    ).replace("℃", ""),
    snowDepth: (
      await trimAndToHalfWidth(
        page.locator(
          "#app > div.info > table > tbody > tr:nth-child(2) > td:nth-child(5)",
        ),
      )
    ).replace("cm", ""),
    snowfall: (
      await trimAndToHalfWidth(
        page.locator(
          "#app > div.info > table > tbody > tr:nth-child(2) > td:nth-child(4)",
        ),
      )
    ).replace("cm", ""),
    condition: null,
    windSpeed: (
      await trimAndToHalfWidth(
        page.locator(
          "#app > div.info > table > tbody > tr:nth-child(2) > td:nth-child(3)",
        ),
      )
    ).replace("m/s", ""),
  };

  const botClass = await page
    .locator(
      "#app > div.info > table > tbody > tr:nth-child(3) > td:nth-child(2) > i",
    )
    .getAttribute("class");
  let botWeather: string | null = null;
  if (botClass) {
    for (const key in weatherMap) {
      if (botClass.includes(key)) {
        botWeather = weatherMap[key];
        break;
      }
    }
  }

  weather["山麓"] = {
    time: dateOnly,
    weather: botWeather,
    temperature: (
      await trimAndToHalfWidth(
        page.locator(
          "#app > div.info > table > tbody > tr:nth-child(3) > td:nth-child(6)",
        ),
      )
    ).replace("℃", ""),
    snowDepth: (
      await trimAndToHalfWidth(
        page.locator(
          "#app > div.info > table > tbody > tr:nth-child(3) > td:nth-child(5)",
        ),
      )
    ).replace("cm", ""),
    snowfall: (
      await trimAndToHalfWidth(
        page.locator(
          "#app > div.info > table > tbody > tr:nth-child(3) > td:nth-child(4)",
        ),
      )
    ).replace("cm", ""),
    condition: null,
    windSpeed: (
      await trimAndToHalfWidth(
        page.locator(
          "#app > div.info > table > tbody > tr:nth-child(3) > td:nth-child(3)",
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
    if (pointWeather.temperature !== "-") {
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
    }
    if (pointWeather.snowDepth !== "-") {
      pointWeather.snowDepth = parseFloat(
        pointWeather?.snowDepth?.toString() || "",
      );
      if (
        pointWeather?.snowDepth == null ||
        Number.isNaN(pointWeather?.snowDepth)
      ) {
        console.warn(`⚠️ [${resortName} (${point})] Snow Depth is incorrect`);
      }
    }
    if (pointWeather.snowfall !== "-") {
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
        pointWeather?.snowfall < -1.0
      ) {
        console.warn(
          `⚠️ [${resortName} (${point})] Snowfall is ${pointWeather?.snowfall}cm. Impossible!`,
        );
      }
    }
    if (pointWeather.windSpeed !== "-") {
      pointWeather.windSpeed = parseFloat(
        pointWeather?.windSpeed?.toString() || "",
      );
      if (
        pointWeather?.windSpeed == null ||
        Number.isNaN(pointWeather?.windSpeed)
      ) {
        console.warn(`⚠️ [${resortName} (${point})] Wind Speed is incorrect`);
      }
    }
  }
}

await page.goto("https://www.princehotels.co.jp/ski/furano/winter/coursemap/"); // 実際のURLに差し替えて

// コース情報
const courseElems = await page.locator(
  "#tab-body01 > div.course-cont .cont .open-popup",
);
const courses = [];
for (let i = 0; i < (await courseElems.count()); i++) {
  const row = courseElems.nth(i);
  const nameLocator = await row.locator(".top .name");
  const name = await nameLocator.evaluate(el => {
    // span要素を除いたテキストノードだけを抽出
    return Array.from(el.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent?.trim())
      .join("")
      .replace("コース", "")
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s =>
        String.fromCharCode(s.charCodeAt(0) - 0xfee0),
      );
  });
  if (name == null || name === "") {
    console.warn(`⚠️ [${resortName}] Course name is incorrect`);
  }
  const statusImgSrc = await row
    .locator(".top .status img")
    .getAttribute("src");
  let status: string | null = null;
  if (statusImgSrc?.includes("open")) {
    status = "◯";
  } else if (statusImgSrc?.includes("close")) {
    status = "×";
  } else if (statusImgSrc?.includes("part")) {
    status = "△";
  }
  if (status == null || status === "") {
    console.warn(`⚠️ [${resortName} ${name} Course] Status is incorrect`);
  }

  const noteText = await trimAndToHalfWidth(row.locator(".note"));
  // 改行で分ける
  const META_BLOCK =
    /起点\(Top\):\s*[\d０-９,]+(?:ｍ|m)?\s*終点\(Bottom\):\s*[\d０-９,]+(?:ｍ|m)?\s*標高差\(Vertical drop\):\s*[\d０-９,]+(?:ｍ|m)?/;
  // 2行目（インデックス1）を取る
  const note = noteText
    .replace(META_BLOCK, "")
    .replace(/"/g, "") // " を削除
    .trim();

  courses.push({
    name: name,
    open: status,
    time: null,
    note: note,
  });
}

// リフト情報
const liftElems = await page.locator("#tab-body02 > div.course-cont .cont");
const lifts = [];
for (let i = 0; i < (await liftElems.count()); i++) {
  const row = liftElems.nth(i);
  const name = (await trimAndToHalfWidth(row.locator(".top .name")))
    .replace("リフト", "")
    .replace(/\s/g, "")
    .replace(/^[A-ZＡ-Ｚ]\s*/, "");
  if (!name.includes("スノーエスカレーター")) {
    const statusImgSrc = await row
      .locator(".top .status img")
      .getAttribute("src");
    let status = "";
    if (statusImgSrc?.includes("open")) {
      status = "◯";
    } else if (statusImgSrc?.includes("close")) {
      status = "×";
    } else if (statusImgSrc?.includes("part")) {
      status = "△";
    }
    const rawNote = await trimAndToHalfWidth(
      row.locator("div.data > ul > li:nth-child(1) > span"),
    );
    const note = /[0-9０-９]/.test(rawNote) ? rawNote : "";
    lifts.push({
      name: name,
      open: status, // "open" / "close"
      note: note, // 実際の表示："運休" / "運行中" など（必要なら）
    });
  }
}

const result = {
  resortName,
  time: now,
  comment,
  weather,
  courses,
  lifts,
};

const courseNum = 28;
const liftNum = 9;
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

fs.writeFileSync(
  `../../data/resorts-temporary/latest_data/${resortName}/${formattedNow}.json`,
  JSON.stringify(result, null, 2),
);
console.log(
  `✅ Saved: ../../data/resorts_cousce_lift/latest_data/${resortName}/${formattedNow}.json`,
);

await browser.close();
