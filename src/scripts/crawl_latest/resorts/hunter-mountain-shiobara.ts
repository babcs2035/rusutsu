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

// スキー場のURL
await page.goto("https://www.hunter.co.jp/winter/"); // 実際のURLに差し替えて

const resortName = "hunter-mountain-shiobara"; // スキー場名
const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

// 天気・積雪情報
const weather: Record<string, WeatherData> = {};
weather.山頂 = {
  time: await trimAndToHalfWidth(
    page.locator(
      "#is-home > section.s25-conditions > div > a.s25-conditionsTitle > span:nth-child(2)",
    ),
  ),
  weather: await trimAndToHalfWidth(
    page.locator(
      "#is-home > section.s25-conditions > div > div > div:nth-child(1) > span:nth-child(2) > p",
    ),
  ),
  temperature: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(
          "#is-home > section.s25-conditions > div > div > div:nth-child(2) > span:nth-child(2)",
        ),
      )
    ).replace("℃", ""),
  ),
  snowDepth: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(
          "#is-home > section.s25-conditions > div > div > div:nth-child(4) > span:nth-child(2)",
        ),
      )
    ).replace("cm", ""),
  ),
  snowfall: null,
  condition: null,
  windSpeed: null,
};

weather.山麓 = {
  time: await trimAndToHalfWidth(
    page.locator(
      "#is-home > section.s25-conditions > div > a.s25-conditionsTitle > span:nth-child(2)",
    ),
  ),
  weather: await trimAndToHalfWidth(
    page.locator(
      "#is-home > section.s25-conditions > div > div > div:nth-child(1) > span:nth-child(2) > p",
    ),
  ),
  temperature: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(
          "#is-home > section.s25-conditions > div > div > div:nth-child(3) > span:nth-child(2)",
        ),
      )
    ).replace("℃", ""),
  ),
  snowDepth: null,
  snowfall: null,
  condition: null,
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
  if (point === "山麓") {
  } else if (
    pointWeather?.snowDepth == null ||
    Number.isNaN(pointWeather?.snowDepth)
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Snow Depth is incorrect`);
  }
}

await page.goto("https://www.hunter.co.jp/winter/gelande/");
const comment = await page
  .locator(
    "#is-gelande > section.s25-section.noBackground > div > div:nth-child(2) > div:nth-child(5)",
  )
  .innerHTML(); // コメント（適宜変更）
// コース情報
const courseElems = await page.locator("div.s25-gelandeInfoData.course");
const courses = [];
for (let i = 0; i < (await courseElems.count()); i++) {
  const row = courseElems.nth(i);
  const name = (await row.locator("u:not(:has(small))").allInnerTexts())
    .join("")
    .replace("コース", "");
  if (name == null || name === "") {
    continue;
  }
  const statusText = await trimAndToHalfWidth(
    await row.locator("span:not([class])"),
  );
  let status = null;
  if (statusText === "滑走可") {
    status = "○";
  } else if (statusText === "滑走不可") {
    status = "×";
  } else if (statusText === "一部滑走可") {
    status = "△";
  }
  if (status == null || status === "") {
    console.warn(`⚠️ [${resortName} ${name} Course] Status is incorrect`);
  } else if (status !== "○" && status !== "△" && status !== "×") {
    console.warn(
      `⚠️ [${resortName} ${name} Course] Status (${status}) is incorrect format`,
    );
  }
  const note = await trimElem(await row.locator("u small"));
  courses.push({
    name: name,
    status: status,
    time: null,
    note: note,
  });
}

// リフト情報
const liftElems = await page.locator(".s25-gelandeInfoData.lift");
const lifts = [];
const liftList = [
  "ゴンドラリフト",
  "ハンタークワッドリフト",
  "第1クワッドリフト",
  "第3ペアリフト",
  "第4ペアリフト",
  "第5ペアリフト",
];

for (let i = 0; i < (await liftElems.count()); i++) {
  const row = liftElems.nth(i);
  const nameText = await trimAndToHalfWidth(await row.locator("p"));
  const name =
    liftList.find(lift => nameText.includes(lift))?.replace("リフト", "") ||
    null;
  if (name == null || name === "") {
    console.warn(`⚠️ [${resortName}] Lift name is incorrect`);
  }
  const statusText = await trimAndToHalfWidth(
    await row.locator("span:not([class])"),
  );
  let status = null;
  if (statusText.includes("運行中") || statusText.includes("減速運転")) {
    status = "○";
  } else if (statusText === "運休") {
    status = "×";
  } else if (statusText === "待機") {
    status = "△";
  }
  if (status == null || status === "") {
    console.warn(`⚠️ [${resortName} ${name} Lift] Status is incorrect`);
  } else if (status !== "○" && status !== "△" && status !== "×") {
    console.warn(
      `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
    );
  }
  const note = await trimElem(await row.locator("u small"));
  lifts.push({
    name: name,
    status: status,
    note: note,
  });
}

const courseNum = 15;
const liftNum = 6;
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
