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
await page.goto("https://www.fujino-yagai-sports.jp/winter"); // 実際のURLに差し替えて

const resortName = "fus-snow-area"; // スキー場名
const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

const comment = null;

// 天気・積雪情報
const weather: Record<string, WeatherData> = {};
// await page.locator(`.heightLine-in:has-text("天"):has-text("気")`).waitFor({ state: "visible" });
const iconLocator = await page
  .locator(`.heightLine-in:has-text("天"):has-text("気")`)
  .locator("img");
let weatherIcon = null;
if ((await iconLocator.count()) > 0) {
  weatherIcon = await iconLocator.getAttribute("src");
  console.log(weatherIcon);
} else {
  console.log("⚠️[${resortName}] Weather icon not found");
}
let weatherIconName = null;
if (weatherIcon?.includes("wtr01")) {
  weatherIconName = "晴れ";
} else if (weatherIcon?.includes("wtr03")) {
  weatherIconName = "雨";
} else if (weatherIcon?.includes("wtr04")) {
  weatherIconName = "曇り";
} else if (weatherIcon?.includes("wtr05")) {
  weatherIconName = "雪";
} else if (weatherIcon?.includes("wtr06")) {
  weatherIconName = "大雪";
} else if (weatherIcon?.includes("wtr07")) {
  weatherIconName = "晴れ";
}

weather["山頂"] = {
  time: await trimAndToHalfWidth(page.locator(".crnt")),
  weather: weatherIconName,
  temperature: parseFloat(
    (
      await trimAndToHalfWidth(page.locator('span.wnum.mgb:has-text("℃")'))
    ).replace("℃", ""),
  ),
  snowDepth: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(".fst.cf").locator('span.wnum:has-text("積雪") b'),
      )
    ).replace("cm", ""),
  ),
  snowfall: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(".fst.cf").locator('span.wnum:has-text("降雪") b'),
      )
    ).replace("cm", ""),
  ),
  condition: (
    await trimAndToHalfWidth(page.locator('div.und-r.cf:has-text("雪質")'))
  )
    .replace("雪質", "")
    .trim(),
  windSpeed: parseFloat(
    (
      await trimAndToHalfWidth(page.locator('span.wnum.mgb:has-text("m/s")'))
    ).replace("m/s", ""),
  ),
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
  if (
    pointWeather?.windSpeed == null ||
    Number.isNaN(pointWeather?.windSpeed)
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Wind Speed is incorrect`);
  }
}

// コース情報
const courseElems = await page
  .locator("ul.udt:has-text('コース')")
  .locator("li");
const courses = [];
for (let i = 0; i < (await courseElems.count()); i++) {
  const row = courseElems.nth(i);
  const nameL = await row.evaluate(el => {
    const node = el.childNodes[0]; // テキストノード
    return node?.textContent?.replace("コース", "").trim() || "";
  });
  const name = toHalfWidth(nameL);
  if (name == null || name === "") {
    console.warn(`⚠️ [${resortName}] Course name is incorrect`);
  }
  let status = await trimAndToHalfWidth(await row.locator("span"));
  if (status.includes("◯")) {
    status = "○";
  }
  if (status == null || status === "") {
    console.warn(`⚠️ [${resortName} ${name} Course] Status is incorrect`);
  } else if (status !== "○" && status !== "△" && status !== "×") {
    console.warn(
      `⚠️ [${resortName} ${name} Course] Status (${status}) is incorrect format`,
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

// リフト情報
const liftElems = await page.locator("ul.udt:has-text('リフト')").locator("li");
const lifts = [];
for (let i = 0; i < (await liftElems.count()); i++) {
  const row = liftElems.nth(i);
  const nameL = await row.evaluate(el => {
    const node = el.childNodes[0]; // テキストノード
    return node?.textContent?.replace("リフト", "").trim() || "";
  });
  const name = toHalfWidth(nameL);
  if (name == null || name === "") {
    console.warn(`⚠️ [${resortName}] Lift name is incorrect`);
  }
  let status = await trimAndToHalfWidth(await row.locator("span"));
  if (status.includes("◯")) {
    status = "○";
  }
  if (status == null || status === "") {
    console.warn(`⚠️ [${resortName} ${name} Lift] Status is incorrect`);
  } else if (status !== "○" && status !== "△" && status !== "×") {
    console.warn(
      `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
    );
  }
  const note = null;
  lifts.push({
    name: name,
    status: status,
    note: note,
  });
}

const courseNum = 6;
const liftNum = 3;
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
