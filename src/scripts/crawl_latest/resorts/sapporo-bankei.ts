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

let comment = null;
const weather: Record<string, WeatherData> = {};
const courses = [];
const lifts = [];
const weatherUrl: string[] = [];
const commentUrl: string[] = ["https://www.bankei.co.jp/news/"];
const courseUrl: string[] = ["https://www.bankei.co.jp/ski/"];
const liftUrl: string[] = ["https://www.bankei.co.jp/ski/"];

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

// スキー場名
const resortName = "sapporo-bankei";
// スキー場のURL
let success1 = true;
try {
  await page.goto("https://www.bankei.co.jp/news/", { timeout: 30000 });
  await page.waitForSelector(".panel-group", {
    state: "visible",
    timeout: 15000,
  });
} catch (error) {
  let message = "Unknown error";
  if (error instanceof Error) {
    message = error.message.split("\n")[0]; // 最初の1行だけ
  } else {
    message = String(error);
  }
  console.error(
    `❌ [${resortName}] Error navigating to ${commentUrl}: ${message}`,
  );
  success1 = false;
}

if (success1) {
  const skiNews = page.locator('.tab:has-text("スキー場")');
  await skiNews.click();
  await page.waitForTimeout(100); // 少し待つ
  const latestNews = page.locator("#ski").locator("li.w-32.w-48_sp a").nth(0);
  await latestNews.click();
  try {
    await page.waitForSelector("article", { state: "visible", timeout: 15000 });
  } catch (error) {
    console.error(
      `❌ [${resortName}] Target element not found or not visible in cilicked news`,
    );
  }
  // コメント
  comment = await page.locator("article").innerHTML();
  if (comment === null || comment === "") {
    console.warn(`⚠️ [${resortName}] Comment is null or empty`);
  }
}

// スキー場のURL
let success2 = true;
try {
  await page.goto("https://www.bankei.co.jp/ski/", { timeout: 30000 });
  await page.waitForSelector('div.lc_tblwrap:has-text("コース")', {
    state: "visible",
    timeout: 15000,
  });
} catch (error) {
  let message = "Unknown error";
  if (error instanceof Error) {
    message = error.message.split("\n")[0]; // 最初の1行だけ
  } else {
    message = String(error);
  }
  console.error(
    `❌ [${resortName}] Error navigating to ${courseUrl}: ${message}`,
  );
  success2 = false;
}
if (success2) {
  const areaElems = page.locator('div.lc_tblwrap:has-text("コース")');
  for (let i = 0; i < (await areaElems.count()); i++) {
    const rows = areaElems.nth(i).locator("table tbody tr");
    for (let j = 1; j < (await rows.count()); j++) {
      const row = rows.nth(j);
      const name = (await trimAndToHalfWidth(row.locator("td").nth(0))).replace(
        "コース",
        "",
      );
      if (name == null || name === "") {
        console.warn(`⚠️ [${resortName}] Course name is null or empty`);
      }
      const note = await trimAndToHalfWidth(row.locator("td").nth(1));
      let status = null;
      const pattern = /([0-9]{1,2}):([0-9]{2})-([0-9]{1,2}):([0-9]{2})/;
      if (pattern.test(note)) {
        status = "○";
      } else if (note === "" || note === "-") {
        status = "×";
      } else if (note === "クローズ") {
        status = "×";
      } else if (note === "クローズ中") {
        status = "×";
      }
      if (status == null || status === "") {
        console.warn(
          `⚠️ [${resortName} ${name} Course] Status is null or empty`,
        );
      } else if (status !== "○" && status !== "△" && status !== "×") {
        console.warn(
          `⚠️ [${resortName} ${name} Course] Status (${status}) is incorrect format`,
        );
      }

      courses.push({
        name: name,
        status: status,
        time: null,
        note: note,
      });
    }
  }

  // リフト情報
  const liftElems = await page
    .locator('div.lc_tblwrap:has-text("リフト")')
    .locator("table tbody tr");
  for (let i = 1; i < (await liftElems.count()); i++) {
    const row = liftElems.nth(i);
    const name = (
      await trimAndToHalfWidth(await row.locator("td").nth(0))
    ).replace("リフト", "");
    if (name == null || name === "") {
      console.warn(`⚠️ [${resortName}] Lift name is null or empty`);
    }
    const note = await trimAndToHalfWidth(row.locator("td").nth(1));
    const pattern = /([0-9]{1,2}):([0-9]{2})-([0-9]{1,2}):([0-9]{2})/;
    let status = null;
    if (pattern.test(note)) {
      status = "○";
    } else if (note === "" || note === "-") {
      status = "×";
    }
    if (status == null || status === "") {
      console.warn(`⚠️ [${resortName} ${name} Lift] Status is null or empty`);
    } else if (status !== "○" && status !== "△" && status !== "×") {
      console.warn(
        `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
      );
    }

    lifts.push({
      name: name,
      status: status,
      note: note,
    });
  }

  const courseNum = 19;
  const liftNum = 4;
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

if (!commentUrl) {
  console.warn(`⚠️ [${resortName}] No comment URL found`);
}
if (!courseUrl) {
  console.warn(`⚠️ [${resortName}] No course URL found`);
}
if (!liftUrl) {
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
