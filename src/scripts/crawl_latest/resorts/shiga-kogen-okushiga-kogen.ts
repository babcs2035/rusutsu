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
await page.goto("https://okushiga.jp/day_information/course/"); // 実際のURLに差し替えて

const resortName = "shiga-kogen-okushiga-kogen"; // スキー場名
const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

// 天気・積雪情報
const weather: Record<string, WeatherData> = {};
const weatherTopElem = await page.locator("#weather2000").getAttribute("class");
let weatherTop = null;
if (weatherTopElem?.includes("we_1")) {
  weatherTop = "晴れ";
} else if (weatherTopElem?.includes("we_2")) {
  weatherTop = "曇り時々晴れ";
} else if (weatherTopElem?.includes("we_3")) {
  weatherTop = "曇り";
} else if (weatherTopElem?.includes("we_4")) {
  weatherTop = "雨";
} else if (weatherTopElem?.includes("we_5")) {
  weatherTop = "雪";
} else if (weatherTopElem?.includes("we_6")) {
  weatherTop = "大雪";
}
const weatherBottomElem = await page
  .locator("#weather1500")
  .getAttribute("class");
let weatherBottom = null;
if (weatherBottomElem?.includes("we_1")) {
  weatherBottom = "晴れ";
} else if (weatherBottomElem?.includes("we_2")) {
  weatherBottom = "曇り時々晴れ";
} else if (weatherBottomElem?.includes("we_3")) {
  weatherBottom = "曇り";
} else if (weatherBottomElem?.includes("we_4")) {
  weatherBottom = "雨";
} else if (weatherBottomElem?.includes("we_5")) {
  weatherBottom = "雪";
} else if (weatherBottomElem?.includes("we_6")) {
  weatherBottom = "大雪";
}

const dataMonth = await trimAndToHalfWidth(page.locator("#month"));
const dataDay = await trimAndToHalfWidth(page.locator("#day"));
const dataTime = await trimAndToHalfWidth(page.locator("#time"));
const dataDate = `${dataMonth}月${dataDay}日 ${dataTime}`;

weather.山頂 = {
  time: dataDate,
  weather: weatherTop,
  temperature: parseFloat(
    (await trimAndToHalfWidth(page.locator("#temp2000"))).replace("℃", ""),
  ),
  snowDepth: parseFloat(
    (await trimAndToHalfWidth(page.locator("#snow2000"))).replace("cm", ""),
  ),
  snowfall: null,
  condition: null,
  windSpeed: null,
};

weather.山麓 = {
  time: dataDate,
  weather: weatherBottom,
  temperature: parseFloat(
    (await trimAndToHalfWidth(page.locator("#temp1500"))).replace("℃", ""),
  ),
  snowDepth: parseFloat(
    (await trimAndToHalfWidth(page.locator("#snow1500"))).replace("cm", ""),
  ),
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
  if (
    pointWeather?.snowDepth == null ||
    Number.isNaN(pointWeather?.snowDepth)
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Snow Depth is incorrect`);
  }
}

await page.goto("https://www.shigakogen-ski.or.jp/lift/okushigakogen/");

const comment = await page.locator(".live-info").innerHTML(); // コメント（適宜変更）

// コース情報
const courseElems = await page.locator(
  ".live-list-data-inner:has(.live-list-data-a):visible",
);
const courses = [];
for (let i = 0; i < (await courseElems.count()); i++) {
  const row = courseElems.nth(i);
  const fullName = (
    await trimAndToHalfWidth(await row.locator(".live-list-data-a"))
  ).replace("コース", "");
  const enName = await trimAndToHalfWidth(
    await row.locator("p.live-list-data-a span"),
  );
  const name = fullName.replace(enName, "").trimEnd();
  if (name == null || name === "") {
    console.warn(`⚠️ [${resortName}] Course name is incorrect`);
  }
  const note = await row
    .locator("p")
    .nth(1)
    .evaluate(el => {
      // spanをすべて消す
      const spans = el.querySelectorAll("span");
      spans.forEach(span => {
        span.remove();
      });

      return el.textContent?.trim() || "";
    });
  let status = null;
  if (note.includes("全面滑走可")) {
    status = "○";
  } else if (note.includes("一部")) {
    status = "△";
  } else if (
    note.includes("閉鎖中") ||
    note.includes("滑走不可") ||
    note.includes("天候回復待")
  ) {
    status = "×";
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
    time: null,
    note: note,
  });
}

// リフト情報
const liftElems = await page.locator(
  ".live-list-data-inner:has(.live-lift-data-a):visible",
);
const lifts = [];
const liftNameList = [
  "奥志賀高原ゴンドラ",
  "第1ペア",
  "第2高速ペア",
  "第3高速ペア",
  "第4ペア",
  "第6ペア",
];
for (let i = 0; i < (await liftElems.count()); i++) {
  const row = liftElems.nth(i);
  const fullName = (await trimAndToHalfWidth(row.locator(".live-lift-data-a")))
    .replace("リフト", "")
    .replace(/（[^）]*）/g, "");

  const name =
    liftNameList.find(lift => fullName.includes(lift))?.replace("リフト", "") ||
    null;

  if (name == null || name === "") {
    console.warn(`⚠️ [${resortName}] Lift name is incorrect`);
  }
  const statusText = await row
    .locator("div.live-lift-r >> div.f-box > p")
    .nth(0)
    .evaluate(el => {
      // spanをすべて消す
      const spans = el.querySelectorAll("span");
      spans.forEach(span => {
        span.remove();
      });

      return el.textContent?.trim() || "";
    });
  const timeNote = await trimAndToHalfWidth(
    await row.locator("div.live-lift-r >> div.f-box span.live-lift-feel-la"),
  );
  const note = `${statusText} ${timeNote}`;
  let status = null;
  if (statusText.includes("運行中")) {
    status = "○";
  } else if (statusText.includes("準備")) {
    status = "△";
  } else if (statusText.includes("運休")) {
    status = "×";
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
    note: note,
  });
}

const courseNum = 13;
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
