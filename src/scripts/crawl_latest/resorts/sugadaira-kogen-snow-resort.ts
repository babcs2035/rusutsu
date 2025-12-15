import fs from "node:fs";
import { chromium, type Locator, type Page } from "playwright";

interface WeatherData {
  update: string | null;
  weather: string | null;
  temperature: number | string | null;
  snowDepth: number | string | null;
  snowfall: number | string | null;
  condition: string | null;
  windSpeed: number | string | null;
}

interface Course {
  name: string;
  status: string | null;
  update: string | null;
  note: string | null;
}

interface Lift {
  name: string;
  status: string | null;
  update: string | null;
  note: string | null;
}

function toHalfWidth(str: string): string {
  return str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, s =>
    String.fromCharCode(s.charCodeAt(0) - 0xfee0),
  );
}
async function trimElem(element: Locator): Promise<string> {
  return ((await element.allTextContents())[0] || "").trim();
}
async function trimAndToHalfWidth(element: Locator): Promise<string> {
  const text = await trimElem(element);
  return toHalfWidth(text);
}

async function navigateWithRetry(
  page: Page,
  url: string,
  selector: string,
): Promise<boolean> {
  try {
    await page.goto(url, { timeout: 30000 });
    await page.waitForSelector(selector, { state: "attached", timeout: 15000 });
    return true;
  } catch (e) {
    console.error(
      `❌ [${resortName}] Error navigating to ${url}: ${e instanceof Error ? e.message.split("\n")[0] : e}`,
    );
    return false;
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({
  locale: "ja-JP",
});
const page = await context.newPage();

let comment = null;
const weather: Record<string, WeatherData> = {};
const courses: Course[] = [];
const lifts: Lift[] = [];

const weatherUrl: string[] = ["https://sugadaira-snowresort.com/"];
const commentUrl: string[] = [
  "https://sugadaira-snowresort.com/condition/",
  "https://sugadaira-snowresort.com/news/",
];
const courseUrl: string[] = ["https://sugadaira-snowresort.com/condition/"];
const liftUrl: string[] = ["https://sugadaira-snowresort.com/condition/"];

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

// スキー場名
const resortName = "sugadaira-kogen-snow-resort";
const url1 = "https://sugadaira-snowresort.com/";
const selector1 = '.block-info01 dl:has-text("積雪") dd';
const success1 = await navigateWithRetry(page, url1, selector1);
if (success1) {
  const weatherElem = page.locator(".block-info01");
  const weatherImgSrc = await weatherElem
    .locator("dd")
    .nth(0)
    .locator("img")
    .getAttribute("src");
  let weatherText = null;
  if (weatherImgSrc?.includes("_sun_red.svg")) {
    weatherText = "晴れ";
  } else if (weatherImgSrc?.includes("_cloud_red.svg")) {
    weatherText = "曇り";
  } else if (weatherImgSrc?.includes("_snow_red.svg")) {
    weatherText = "雪";
  } else if (weatherImgSrc?.includes("_rain_red.svg")) {
    weatherText = "雨";
  }

  // 天気・積雪情報
  weather.中腹 = {
    update: null,
    weather: weatherText,
    temperature: (
      await trimAndToHalfWidth(weatherElem.locator('dl:has-text("気温") dd'))
    ).replace("℃", ""),
    snowDepth: (
      await trimAndToHalfWidth(weatherElem.locator('dl:has-text("積雪") dd'))
    ).replace("cm", ""),
    snowfall: (
      await trimAndToHalfWidth(
        weatherElem.locator('dl:has-text("積雪量前日差") dd'),
      )
    ).replace("cm", ""),
    condition: null,
    windSpeed: null,
  };

  for (const point of Object.keys(weather)) {
    const pointWeather = weather[point];
    if (!pointWeather?.weather) {
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

    if (pointWeather?.snowfall !== "-") {
      pointWeather.snowfall = parseFloat(
        pointWeather?.snowfall?.toString() || "",
      );
      if (
        pointWeather?.snowfall == null ||
        Number.isNaN(pointWeather?.snowfall)
      ) {
        console.warn(`⚠️ [${resortName} (${point})] Snowfall is null or NaN`);
      } else if (
        pointWeather?.snowfall > 130.0 ||
        pointWeather?.snowfall < -0.1
      ) {
        console.warn(
          `⚠️ [${resortName} (${point})] Snowfall is ${pointWeather?.snowfall}cm. Impossible!`,
        );
      }
    }
  }
}

// コース名, リフト名対応表の定義
const courseNameMap: Record<string, string> = {
  上級: "奥ダボス上級",
  中級: "奥ダボス中級",
  "初級①": "奥ダボス初級①",
  "初級②": "奥ダボス初級②",
  "初級③": "奥ダボス初級③",
  "太郎・上部": "太郎上部",
  "太郎・下部": "太郎下部",
  "大松山ホワイトピーク（上部）": "大松山ホワイトピーク上部",
  "大松山ホワイトピーク（下部）": "大松山ホワイトピーク下部",
  シュワルツ: "白金シュワルツ",
  白金初級: "白金からまつ",
};

const liftNameMap: Record<string, string> = {
  第1トリプル: "奥ダボス第1トリプル",
  シュナイダー: "シュナイダートリプル",
};

const url2 = "https://sugadaira-snowresort.com/condition/";
const selector2 = ".block-course .b-course table.tbl-status tbody tr";
const success2 = await navigateWithRetry(page, url2, selector2);
if (success2) {
  const courseTabs = page.locator(".block-course .b-course table.tbl-status");
  for (let i = 0; i < (await courseTabs.count()); i++) {
    const courseElems = courseTabs.nth(i).locator("tbody tr");
    for (let j = 0; j < (await courseElems.count()); j++) {
      const row = courseElems.nth(j);
      const rawName = (
        await trimAndToHalfWidth(row.locator("th.title"))
      ).replace("コース", "");
      const name = courseNameMap[rawName] ?? rawName;
      if (!name) {
        console.warn(`⚠️ [${resortName}] Course name is null or empty`);
      }
      const status = await trimAndToHalfWidth(row.locator("td:has(span)"));
      if (!status) {
        console.warn(
          `⚠️ [${resortName} ${name} Course] Status is null or empty`,
        );
      } else if (status !== "○" && status !== "△" && status !== "×") {
        console.warn(
          `⚠️ [${resortName} ${name} Course] Status (${status}) is incorrect format`,
        );
      }
      let note = null;
      if (name === "シュナイダーハンネスA/B/C") {
        const courseNames = [
          "シュナイダーハンネスA",
          "シュナイダーハンネスB",
          "シュナイダーハンネスC",
        ];
        if (status === "△") {
          note =
            "公式ページでは「シュナイダーハンネスA,B,C」が一括で△(一部滑走可)と表示されているため、個別の開放状況は不明です";
        }
        for (const courseName of courseNames) {
          courses.push({
            name: courseName,
            status: status,
            update: null,
            note: note,
          });
        }
      } else {
        courses.push({
          name: name,
          status: status,
          update: null,
          note: null,
        });
      }
    }
  }

  // リフト情報
  const liftTabs = await page.locator(".block-lift .b-detail table.tbl-status");
  for (let i = 0; i < (await liftTabs.count()); i++) {
    const liftElems = liftTabs.nth(i).locator("tbody tr");
    for (let j = 0; j < (await liftElems.count()); j++) {
      const row = liftElems.nth(j);
      const rawName = (
        await trimAndToHalfWidth(await row.locator(".title"))
      ).replace("リフト", "");
      const name = liftNameMap[rawName] ?? rawName;
      if (!name) {
        console.warn(`⚠️ [${resortName}] Lift name is null or empty`);
      }
      const status = await trimAndToHalfWidth(
        await row.locator("td:has(span)"),
      );
      if (!status) {
        console.warn(`⚠️ [${resortName} ${name} Lift] Status is null or empty`);
      } else if (status !== "○" && status !== "△" && status !== "×") {
        console.warn(
          `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
        );
      }
      lifts.push({
        name: name,
        status: status,
        update: null,
        note: null,
      });
    }
  }
  const commentDict: Record<string, string> = {};
  const commentElems = page.locator(
    '.block-regulation:has-text("コース規制情報")',
  );
  for (let i = 0; i < (await commentElems.count()); i++) {
    const section = commentElems.nth(i);
    const table = section.locator("table.tbl-regulation");

    if ((await table.count()) !== 0) {
      const rows = table.locator("tbody tr");
      for (let j = 0; j < (await rows.count()); j++) {
        const row = rows.nth(j);
        const area = await trimAndToHalfWidth(row.locator("th"));
        const rowComment = await trimAndToHalfWidth(row.locator("td"));
        commentDict[area] = rowComment;
      }
    } else {
      const regulationText = await trimAndToHalfWidth(
        section.locator(".txt-regulation-none"),
      );
      if (regulationText.includes("コース規制情報はありません")) {
        if (regulationText.includes("ダボス")) {
          commentDict.ダボスエリア = "コース規制なし";
        }
        if (regulationText.includes("太郎")) {
          commentDict.太郎エリア = "コース規制なし";
        }
        if (regulationText.includes("パインビーク")) {
          commentDict["オオマツ・ツバクロエリア"] = "コース規制なし";
        }
      }
    }
  }
  // コメントのエリアが全て存在するか確認
  const requiredAreas = ["ダボス", "太郎", "オオマツ", "ツバクロ"];
  for (const area of requiredAreas) {
    const exists = Object.keys(commentDict).some(
      key => key === area || key.includes(area),
    );

    if (!exists) {
      console.warn(`⚠️ [${resortName}] Comment for area "${area}" is missing`);
    }
  }
  // コメントを結合（改行で区切る）
  const commentRegulation = Object.entries(commentDict)
    .map(([area, text]) => `○${area}: ${text}`)
    .join("\n");
  comment = `<コース規制情報>\n${commentRegulation}\n\n最新のお知らせは<a href="https://sugadaira-snowresort.com/news/">こちら</a>から`;

  const courseNum = 60;
  const liftNum = 18;
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
}

if (weatherUrl.length === 1 && weatherUrl[0] === "") {
  console.warn(`⚠️ [${resortName}] No weather URL found`);
}
if (commentUrl.length === 1 && commentUrl[0] === "") {
  console.warn(`⚠️ [${resortName}] No comment URL found`);
}
if (courseUrl.length === 1 && courseUrl[0] === "") {
  console.warn(`⚠️ [${resortName}] No course URL found`);
}
if (liftUrl.length === 1 && liftUrl[0] === "") {
  console.warn(`⚠️ [${resortName}] No lift URL found`);
}

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
