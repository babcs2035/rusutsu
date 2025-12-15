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
  return ((await element.allInnerTexts())[0] || "").trim();
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
    await page.goto(url, { timeout: 60000 });
    await page.waitForSelector("div.head-lift");
    await page.click("div.head-lift", { timeout: 5000 });
    await page.waitForSelector(selector, { state: "visible", timeout: 15000 });
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

const weatherUrl: string[] = ["https://tsumagoiskiresort.life/"];
const commentUrl: string[] = ["https://tsumagoiskiresort.life/"];
const courseUrl: string[] = ["https://tsumagoiskiresort.life/"];
const liftUrl: string[] = ["https://tsumagoiskiresort.life/"];

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

// スキー場名
const resortName = "pallcall-tsumagoi-resort";
const url1 = "https://tsumagoiskiresort.life/";
const selector1 = ".kion-item";
const success1 = await navigateWithRetry(page, url1, selector1);
if (success1) {
  // コメント
  comment = await trimAndToHalfWidth(page.locator(".condition-comment"));
  const update = await trimAndToHalfWidth(page.locator(".head-update"));
  let seasonOff = false;

  // 天気・積雪情報
  weather.山頂 = {
    update: update,
    weather: null,
    temperature: (
      await trimAndToHalfWidth(page.locator('.kion-item:has-text("山頂") .en'))
    ).replace("℃", ""),
    snowDepth: (
      await trimAndToHalfWidth(
        page.locator('.sekisetsu .sekisetsu-item:has-text("最高") .en'),
      )
    ).replace("cm", ""),
    snowfall: null,
    condition: null,
    windSpeed: null,
  };

  weather.山麓 = {
    update: update,
    weather: null,
    temperature: (
      await trimAndToHalfWidth(page.locator('.kion-item:has-text("山麓") .en'))
    ).replace("℃", ""),
    snowDepth: (
      await trimAndToHalfWidth(
        page.locator('.sekisetsu-item:has-text("最低") .en'),
      )
    ).replace("cm", ""),
    snowfall: null,
    condition: null,
    windSpeed: null,
  };

  for (const point of Object.keys(weather)) {
    const pointWeather = weather[point];
    if (!pointWeather?.update) {
      console.warn(`⚠️ [${resortName} (${point})] Time is null or empty`);
    }

    // シーズンオフにはsnowDepthが'---'になる
    if (pointWeather?.snowDepth !== "---") {
      pointWeather.temperature = parseFloat(
        pointWeather?.temperature?.toString() || "",
      );
      if (!pointWeather?.temperature) {
        console.warn(`⚠️ [${resortName} (${point})] Temperature is null or NaN`);
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
      if (!pointWeather?.snowDepth) {
        console.warn(`⚠️ [${resortName} (${point})] Snow Depth is null or NaN`);
      }
    } else {
      seasonOff = true;
    }
  }

  const lines = comment
    .split(/\r?\n/) // 改行で分割
    .map(l => l.trim()) // 余白を除去
    .filter(l => l.length); // 空行を除外

  const allCourses = [
    "A-1",
    "A-2",
    "A-3",
    "A-4",
    "B-3",
    "B-4",
    "B-5",
    "B-6",
    "C-1",
    "C-2",
    "C-3",
    "C-4",
    "C-5",
    "D-1",
    "D-2",
    "D-3",
    "D-4",
    "D-5",
    "D-6",
    "D-7",
    "D-8",
    "D-9",
  ];
  const courseLine = lines.find(l => l.startsWith("滑走可能コース"));
  if (courseLine) {
    for (const courseName of allCourses) {
      const courseNameNoDash = courseName.replace("-", "");
      let status = "×";
      if (
        courseLine.includes(courseName) ||
        courseLine.includes(courseNameNoDash)
      ) {
        status = "○";
      }
      courses.push({
        name: courseName,
        status: status,
        update: update,
        note: null,
      });
    }
  } else {
    if (!seasonOff) {
      // シーズンオフではないのにコース情報が見つからない場合
      console.warn(`⚠️ [${resortName}] No course information found in comment.`);
    } else {
      for (const courseName of allCourses) {
        const status = "×";
        courses.push({
          name: courseName,
          status: status,
          update: update,
          note: null,
        });
      }
    }
  }

  // リフト情報
  const liftElems = await page.locator(".condition-lift tbody tr");
  for (let i = 0; i < (await liftElems.count()); i++) {
    const row = liftElems.nth(i);
    const name = (await trimAndToHalfWidth(await row.locator("th"))).replace(
      "リフト",
      "",
    );
    if (!name) {
      console.warn(`⚠️ [${resortName}] Lift name is null or empty`);
    }
    let status = null;
    const statusText = await trimAndToHalfWidth(await row.locator("td"));
    if (statusText.includes("運行中")) {
      status = "○";
    } else if (statusText.includes("運休")) {
      status = "×";
    } else if (statusText.includes("待機調査")) {
      status = "△";
    }
    if (!status) {
      console.warn(`⚠️ [${resortName} ${name} Lift] Status is null or empty`);
    } else if (status !== "○" && status !== "△" && status !== "×") {
      console.warn(
        `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
      );
    }
    let note = null;
    if (name) {
      let liftLineRe = null;
      if (name === "嬬恋ゴンドラ") {
        liftLineRe = /(嬬恋ゴンドラ)\s*(.+)/;
      } else if (name === "第1高速") {
        liftLineRe = /(第1\s*高速リフト)\s*(.+)/;
      } else if (name === "第2高速") {
        liftLineRe = /(第2\s*高速(?:ペア)?リフト)\s*(.+)/;
      } else if (name === "第3ペア") {
        liftLineRe = /(第3\s*ペアリフト)\s*(.+)/;
      }
      let foundLine = false;
      if (liftLineRe) {
        for (const line of lines) {
          const m = line.match(liftLineRe);
          if (!m) {
            continue;
          }
          foundLine = true;
          const [, _liftName, afterText] = m;
          note = afterText.trim();
        }
        if (!foundLine && !seasonOff) {
          // シーズンオフではないのにリフト情報が見つからない場合
          console.warn(
            `⚠️ [${resortName} ${name} Lift] No lift information found in comment.`,
          );
        }
      }
    }
    lifts.push({
      name: name,
      status: status,
      update: update,
      note: note,
    });
  }

  const courseNum = 22;
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
