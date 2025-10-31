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
await page.goto("http://www.okutadami.co.jp/ski/index.html"); // 実際のURLに差し替えて

const resortName = "okutadami-maruyama"; // スキー場名
const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

const comment = await page.locator("#bk88724377 > div > p").innerHTML(); // コメント（適宜変更）

// 天気・積雪情報
const weather: Record<string, WeatherData> = {};
weather["中腹"] = {
  time: await trimAndToHalfWidth(
    page.locator("#bk88724802 > div > div.column.-column1 > ul > li"),
  ),
  weather: await page.locator("#imgsrc89144540_1").getAttribute("alt"),
  temperature: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(
          "#bk88724802 > div > div.column.-column4.-column-lasts > div:nth-child(4) > span > span > span",
        ),
      )
    ).replace("℃", ""),
  ),
  snowDepth: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(
          "#bk88724802 > div > div.column.-column3 > div:nth-child(4) > span > span",
        ),
      )
    ).replace("cm", ""),
  ),
  snowfall: parseFloat(
    (
      await trimAndToHalfWidth(
        page.locator(
          "#bk88724802 > div > div.column.-column2 > div:nth-child(4) > span > span",
        ),
      )
    ).replace("cm", ""),
  ),
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
  if (pointWeather?.snowfall == null || Number.isNaN(pointWeather?.snowfall)) {
    console.warn(`⚠️ [${resortName} (${point})] Snowfall is incorrect`);
  } else if (pointWeather?.snowfall > 130.0 || pointWeather?.snowfall < -0.1) {
    console.warn(
      `⚠️ [${resortName} (${point})] Snowfall is ${pointWeather?.snowfall}cm. Impossible!`,
    );
  }
}

// コース情報
const getCourseStatus = (rowText: string): string | null => {
  if (rowText.includes("○")) return "○";
  if (rowText.includes("△")) return "△";
  if (rowText.includes("×")) return "×";
  return null;
};

const checkCourse = (name: string | null, status: string | null): void => {
  if (name == null || name === "") {
    console.warn(`⚠️ [${resortName}] Course name is incorrect`);
  }
  if (status == null || status === "") {
    console.warn(`⚠️ [${resortName} ${name} Course] Status is incorrect`);
  } else if (status !== "○" && status !== "△" && status !== "×") {
    console.warn(
      `⚠️ [${resortName} ${name} Course] Status (${status}) is incorrect format`,
    );
  }
};

const columns = await page.locator("div.column:visible");
const courses = [];
const lifts = [];
for (let i = 0; i < (await columns.count()); i++) {
  const column = columns.nth(i);
  const text = await trimAndToHalfWidth(column.locator("div.c-body.c-center"));

  if (text.includes("丸山ゲレンデ")) {
    const name = "丸山ゲレンデ";
    const rows = column.locator("div.c-body.c-center");
    let status = null;
    for (let j = 1; j < (await rows.count()); j++) {
      const row = rows.nth(j);
      const rowText = await trimAndToHalfWidth(row.locator("span.d-bold"));
      status = getCourseStatus(rowText);
      if (status === "×" || status === "△" || status === "○") {
        break;
      }
    }
    checkCourse(name, status);
    courses.push({
      name: name,
      status: status,
      time: null,
      note: null,
    });
  } else if (text.includes("ブナ平ゲレンデ")) {
    const rows = column.locator("div.c-body.c-center");
    for (let j = 1; j < (await rows.count()); j++) {
      const row = rows.nth(j);
      const rowText = await trimAndToHalfWidth(row.locator("span.d-bold"));
      if (rowText.includes("Aコース")) {
        const name = "ブナ平A";
        const status = getCourseStatus(rowText);
        checkCourse(name, status);
        courses.push({
          name: name,
          status: status,
          time: null,
          note: null,
        });
      } else if (rowText.includes("Bコース")) {
        const name = "ブナ平B";
        const status = getCourseStatus(rowText);
        checkCourse(name, status);
        courses.push({
          name: name,
          status: status,
          time: null,
          note: null,
        });
      } else if (rowText.includes("Cコース")) {
        const name = "ブナ平C";
        const status = getCourseStatus(rowText);
        checkCourse(name, status);
        courses.push({
          name: name,
          status: status,
          time: null,
          note: null,
        });
      }
    }
  } else if (text.includes("カモシカゲレンデ")) {
    const rows = column.locator("div.c-body.c-center");
    for (let j = 1; j < (await rows.count()); j++) {
      const row = rows.nth(j);
      const rowText = await trimAndToHalfWidth(row.locator("span.d-bold"));
      let name = null;
      let status = null;
      if (rowText.includes("Aコース")) {
        name = "カモシカA";
        status = getCourseStatus(rowText);
        checkCourse(name, status);
        courses.push({
          name: name,
          status: status,
          time: null,
          note: null,
        });
      } else if (rowText.includes("Bコース")) {
        name = "カモシカB";
        status = getCourseStatus(rowText);
        checkCourse(name, status);
        courses.push({
          name: name,
          status: status,
          time: null,
          note: null,
        });
      } else if (rowText.includes("Cコース")) {
        name = "カモシカC";
        status = getCourseStatus(rowText);
        checkCourse(name, status);
        courses.push({
          name: name,
          status: status,
          time: null,
          note: null,
        });
      } else if (rowText.includes("Dコース")) {
        name = "カモシカD";
        status = getCourseStatus(rowText);
        checkCourse(name, status);
        courses.push({
          name: name,
          status: status,
          time: null,
          note: null,
        });
      } else if (rowText.includes("Eコース")) {
        name = "カモシカE";
        status = getCourseStatus(rowText);
        checkCourse(name, status);
        courses.push({
          name: name,
          status: status,
          time: null,
          note: null,
        });
      }
    }
  } else if (text.includes("八崎ゲレンデ")) {
    const name = "八崎ゲレンデ";
    const rows = column.locator("div.c-body.c-center");
    let status = null;
    for (let j = 1; j < (await rows.count()); j++) {
      const row = rows.nth(j);
      const rowText = await trimAndToHalfWidth(row.locator("span.d-bold"));
      status = getCourseStatus(rowText);
      if (status === "×" || status === "△" || status === "○") {
        break;
      }
    }
    checkCourse(name, status);
    courses.push({
      name: name,
      status: status,
      time: null,
      note: null,
    });
  } else if (text.includes("リフト営業時間")) {
    const rows = column.locator("div.c-body.c-center");
    let liftTop = -1;
    let lift_12 = -1;
    for (let j = 1; j < (await rows.count()); j++) {
      const row = rows.nth(j);
      const rowText = await trimAndToHalfWidth(row.locator("span.d-bold"));
      if (liftTop >= 0) {
        const name = "山頂ペア";
        const note = rowText;
        liftTop = -1;
        lifts.push({
          name: name,
          status: null,
          note: note,
        });
      } else if (lift_12 >= 0) {
        lift_12 = -1;
        const note = rowText;
        const nameList = [
          "第1ペアA線",
          "第1ペアB線",
          "第2ペアA線",
          "第2ペアB線",
        ];
        for (const name of nameList) {
          lifts.push({
            name: name,
            status: null,
            note: note,
          });
        }
      } else if (rowText.includes("山頂リフト")) {
        liftTop = j;
      } else if (rowText.includes("第1・第2リフト")) {
        lift_12 = j;
      }
    }
  }
}

if (courses.length === 0) {
  console.warn(`⚠️ [${resortName}] No course data found`);
} else if (courses.length !== 10) {
  console.warn(
    `⚠️ [${resortName}] Course count is ${courses.length}. Expected 10.`,
  );
}
if (lifts.length === 0) {
  console.warn(`⚠️ [${resortName}] No lift data found`);
} else if (lifts.length !== 5) {
  console.warn(`⚠️ [${resortName}] Lift count is ${lifts.length}. Expected 5.`);
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
