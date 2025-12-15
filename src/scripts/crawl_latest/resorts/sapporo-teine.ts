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
await page.goto("https://sapporo-teine.com/snow/gelande-report"); // 実際のURLに差し替えて

const resortName = "sapporo-teine"; // スキー場名
const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

const comment = await page
  .locator(
    "body > div.l-content > section.section-forecast.section-general > div > section:nth-child(6) > section > div.box-set__content.box-set__content--p40.wp-editorcontent",
  )
  .innerHTML(); // コメント（適宜変更）

// 天気・積雪情報
const weather: Record<string, WeatherData> = {};
weather.山頂 = {
  time: await trimAndToHalfWidth(
    page.locator(
      "body > div.l-content > section.section-forecast.section-general > div > section:nth-child(4) > div > div:nth-child(2) > p:nth-child(2) > span.taken_at > div",
    ),
  ),
  weather: await trimAndToHalfWidth(
    page.locator(
      "body > div.l-content > section.section-forecast.section-general > div > div > div > div.greport__weather > p.greport__weather__ja",
    ),
  ),
  temperature: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(
          "body > div.l-content > section.section-forecast.section-general > div > section:nth-child(4) > div > div:nth-child(2) > p:nth-child(2) > span.temp > div",
        ),
      )
    )
      .replace("℃", "")
      .replace("気温: ", ""),
  ),
  snowDepth: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(
          "body > div.l-content > section.section-forecast.section-general > div > div > div > div.greport__detail > dl.greport__data > dd:nth-child(4)",
        ),
      )
    ).replace("cm", ""),
  ),
  snowfall: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(
          "body > div.l-content > section.section-forecast.section-general > div > div > div > div.greport__detail > dl.greport__data > dd:nth-child(2)",
        ),
      )
    ).replace("cm", ""),
  ),
  condition: await trimAndToHalfWidth(
    page.locator(
      "body > div.l-content > section.section-forecast.section-general > div > div > div > div.greport__detail > dl.greport__data > dd:nth-child(8) > span",
    ),
  ),
  windSpeed: null,
};

weather.山麓 = {
  time: await trimAndToHalfWidth(
    page.locator(
      "body > div.l-content > section.section-forecast.section-general > div > section:nth-child(4) > div > div:nth-child(7) > p:nth-child(2) > span.taken_at > div",
    ),
  ),
  weather: await trimAndToHalfWidth(
    page.locator(
      "body > div.l-content > section.section-forecast.section-general > div > div > div > div.greport__weather > p.greport__weather__ja",
    ),
  ),
  temperature: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(
          "body > div.l-content > section.section-forecast.section-general > div > section:nth-child(4) > div > div:nth-child(7) > p:nth-child(2) > span.temp > div",
        ),
      )
    )
      .replace("℃", "")
      .replace("気温: ", ""),
  ),
  snowDepth: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(
          "body > div.l-content > section.section-forecast.section-general > div > div > div > div.greport__detail > dl.greport__data > dd:nth-child(6)",
        ),
      )
    ).replace("cm", ""),
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
  if (point === "山麓") {
  } else if (
    pointWeather?.snowfall == null ||
    Number.isNaN(pointWeather?.snowfall)
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Snowfall is incorrect`);
  } else if (pointWeather?.snowfall > 130.0 || pointWeather?.snowfall < -0.1) {
    console.warn(
      `⚠️ [${resortName} (${point})] Snowfall is ${pointWeather?.snowfall}cm. Impossible!`,
    );
  }
  if (point === "山麓") {
  } else if (
    pointWeather?.condition == null ||
    pointWeather?.condition === ""
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Condition is incorrect`);
  }
}

// コース情報
const courseElems = await page.locator(
  ".list-label__item.list-label__item--zone",
);
const courses = [];
for (let i = 0; i < (await courseElems.count()); i++) {
  const row = courseElems.nth(i);
  const name = (
    await trimAndToHalfWidth(await row.locator(".list-label__title"))
  ).replace("コース", "");
  if (name == null || name === "") {
    console.warn(`⚠️ [${resortName}] Course name is incorrect`);
  }
  const element = await row.locator(".list-label__status");
  const statusName = await element.getAttribute("class");
  let status = null;
  if (statusName?.includes("open")) {
    status = "○";
  } else if (statusName?.includes("close")) {
    status = "×";
  } else if (statusName?.includes("pending")) {
    status = "△";
  }
  const note = await trimAndToHalfWidth(
    await row.locator(".list-label__status"),
  );

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
  ".list-label__item:not(.list-label__item--zone)",
);
const lifts = [];
for (let i = 0; i < (await liftElems.count()); i++) {
  const row = liftElems.nth(i);
  const name = (
    await trimAndToHalfWidth(await row.locator(".list-label__title"))
  ).replace("リフト", "");
  if (name == null || name === "") {
    console.warn(`⚠️ [${resortName}] Lift name is incorrect`);
  }
  const element = await row.locator(".list-label__status");
  const statusName = await element.getAttribute("class");
  let status = null;
  if (statusName?.includes("open")) {
    status = "○";
  } else if (statusName?.includes("close")) {
    status = "×";
  } else if (statusName?.includes("pending")) {
    status = "△";
  }
  if (status == null || status === "") {
    console.warn(`⚠️ [${resortName} ${name} Lift] Status is incorrect`);
  } else if (status !== "○" && status !== "△" && status !== "×") {
    console.warn(
      `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
    );
  }
  const note = await trimElem(await row.locator(".list-label__text"));
  lifts.push({
    name: name,
    status: status,
    note: note,
  });
}

if (courses.length === 0) {
  console.warn(`⚠️ [${resortName}] No course data found`);
} else if (courses.length !== 15) {
  console.warn(
    `⚠️ [${resortName}] Course count is ${courses.length}. Expected 15.`,
  );
}
if (lifts.length === 0) {
  console.warn(`⚠️ [${resortName}] No lift data found`);
} else if (lifts.length !== 10) {
  console.warn(`⚠️ [${resortName}] Lift count is ${lifts.length}. Expected 10.`);
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
