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
    await page.goto(url, { timeout: 30000 });
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

const weatherUrl: string[] = [
  "https://www.hakubavalley.com/weather/detail_goryu/",
  "https://www.hakubavalley.com/weather/detail_hakuba47/",
];
const commentUrl: string[] = [
  "https://www.hakubaescal.com/winter/information/",
];
const courseUrl: string[] = [
  "https://www.hakubaescal.com/winter/gelande/animationmap/",
];
const liftUrl: string[] = [
  "https://www.hakubaescal.com/winter/gelande/animationmap/",
];

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

// スキー場名
const resortName = "able-hakuba-goryu-47";

const url1 = "https://www.hakubavalley.com/weather/detail_goryu/";
const selector1 = 'table.table-responsive:has-text("気温") tbody tr';
const success1 = await navigateWithRetry(page, url1, selector1);
if (success1) {
  // 天気・積雪情報
  const weatherElem = page.locator(
    'table.table-responsive:has-text("気温") tbody tr',
  );
  for (let i = 1; i < (await weatherElem.count()); i++) {
    const row = weatherElem.nth(i);
    const point = await trimAndToHalfWidth(row.locator(".table_th2"));
    if (point) {
      weather[`五竜 ${point}`] = {
        update: await trimAndToHalfWidth(page.locator("#y-updateDate-230")),
        weather: await trimAndToHalfWidth(row.locator("td").nth(0)),
        temperature: (
          await trimAndToHalfWidth(row.locator("td").nth(1))
        ).replace("℃", ""),
        snowDepth: (await trimAndToHalfWidth(row.locator("td").nth(2))).replace(
          "cm",
          "",
        ),
        snowfall: (await trimAndToHalfWidth(row.locator("td").nth(3))).replace(
          "cm",
          "",
        ),
        condition: await trimAndToHalfWidth(row.locator("td").nth(5)),
        windSpeed: null,
      };
    }
  }
}

const url2 = "https://www.hakubavalley.com/weather/detail_hakuba47/";
const selector2 = 'table.table-responsive:has-text("気温") tbody tr';
const success2 = await navigateWithRetry(page, url2, selector2);
if (success2) {
  const weatherElem = page.locator(
    'table.table-responsive:has-text("気温") tbody tr',
  );
  for (let i = 1; i < (await weatherElem.count()); i++) {
    const row = weatherElem.nth(i);
    const point = await trimAndToHalfWidth(row.locator(".table_th2"));
    if (point) {
      weather[`47  ${point}`] = {
        update: await trimAndToHalfWidth(page.locator("#y-updateDate-230")),
        weather: await trimAndToHalfWidth(row.locator("td").nth(0)),
        temperature: (
          await trimAndToHalfWidth(row.locator("td").nth(1))
        ).replace("℃", ""),
        snowDepth: (await trimAndToHalfWidth(row.locator("td").nth(2))).replace(
          "cm",
          "",
        ),
        snowfall: (await trimAndToHalfWidth(row.locator("td").nth(3))).replace(
          "cm",
          "",
        ),
        condition: await trimAndToHalfWidth(row.locator("td").nth(5)),
        windSpeed: null,
      };
    }
  }
}

const reportUrl = "https://www.hakubaescal.com/winter/information/";
comment = `最新のお知らせは<a href="${reportUrl}">こちら</a>から。`;

for (const point of Object.keys(weather)) {
  const pointWeather = weather[point];
  if (!pointWeather?.update) {
    console.warn(`⚠️ [${resortName} (${point})] Time is null or empty`);
  }
  if (!pointWeather?.weather) {
    console.warn(`⚠️ [${resortName} (${point})] Weather is null or empty`);
  }
  if (pointWeather?.temperature !== "-") {
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
  }

  if (pointWeather?.snowDepth !== "-") {
    pointWeather.snowDepth = parseFloat(
      pointWeather?.snowDepth?.toString() || "",
    );
    if (!pointWeather?.snowDepth) {
      console.warn(`⚠️ [${resortName} (${point})] Snow Depth is null or NaN`);
    }
  }

  if (pointWeather?.snowfall !== "-") {
    pointWeather.snowfall = parseFloat(
      pointWeather?.snowfall?.toString() || "",
    );
    if (!pointWeather?.snowfall) {
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

  if (!pointWeather?.condition) {
    console.warn(`⚠️ [${resortName} (${point})] Condition is null or empty`);
  }
  if (pointWeather?.windSpeed !== "-") {
    pointWeather.windSpeed = parseFloat(
      pointWeather?.windSpeed?.toString() || "",
    );
    if (!pointWeather?.windSpeed) {
      console.warn(`⚠️ [${resortName} (${point})] WindSpeed is null or NaN`);
    }
  }
}

// コース名対応表の定義
const courseNameMap: Record<string, string> = {
  "R-1上部（ルート1上部）": "Hakuba47 ルート1上部",
  "R-1中部（ルート1中部）": "Hakuba47 ルート1中部",
  "R-1下部（ルート1下部）": "Hakuba47 ルート1下部",
  "R-2（ルート2）": "Hakuba47 ルート2",
  "R-3（ルート3）": "Hakuba47 ルート3",
  "R-4（ルート4）": "Hakuba47 ルート4",
  "R-5（ルート5）": "Hakuba47 ルート5",
  "R-6（ルート6）": "Hakuba47 ルート6",
  "R-7上部（ルート7上部）": "Hakuba47 ルート7上部",
  "R-7下部（ルート7下部）": "Hakuba47 ルート7下部",
  "R-8上部（ルート8上部）": "Hakuba47 ルート8上部",
  "R-8下部（ルート8下部）": "Hakuba47 ルート8下部",
  "とおみゲレンデ（上部）": "とおみゲレンデ上部",
  とおみゲレンデ: "とおみゲレンデ下部",
};

const liftNameMap: Record<string, string> = {
  "ゴンドラLine-8": "Hakuba47 Line-8",
  "クワットLine-C": "Hakuba47 Line-C",
  "クワッドLine-C": "Hakuba47 Line-C",
  "高速ペアLine-E": "Hakuba47 Line-E",
  "ペアLine-D": "Hakuba47 Line-D",
  第1高速ペア: "いいもり第1高速ペア",
};

const liftTwoLine: Record<string, string[]> = {
  アルプス第2・第4ペア: ["アルプス第2ペア", "アルプス第4ペア"],
  第6ペア: ["いいもり第6ペアA", "いいもり第6ペアB"],
  "ペアLine-A.B": ["Hakuba47 Line-A", "Hakuba47 Line-B"],
};

// スキー場のURL
const url3 = "https://www.hakubaescal.com/winter/gelande/animationmap/";
const selector3 =
  '.acms-admin-table:has-text("コース名") tbody tr td:nth-child(1)';
const success3 = await navigateWithRetry(page, url3, selector3);
if (success3) {
  const areaCourseElems = page.locator(
    '.acms-admin-table:has-text("コース名")',
  );
  for (let i = 0; i < (await areaCourseElems.count()); i++) {
    const area = areaCourseElems.nth(i);
    const areaUpdate = (
      await trimAndToHalfWidth(area.locator(".update-time-wrap"))
    )
      .replace("更新", "")
      .trim()
      .replace(/^\d{4}-(\d{2})-(\d{2})/, "$1/$2");
    for (let j = 0; j < (await area.locator("tbody tr").count()); j++) {
      const row = area.locator("tbody tr").nth(j);
      const rawName = (
        await trimAndToHalfWidth(row.locator("td").nth(0))
      ).replace("コース", "");
      const name = courseNameMap[rawName] ?? rawName;
      if (!name) {
        console.warn(`⚠️ [${resortName}] Course name is null or empty`);
      }
      const statusText = await trimAndToHalfWidth(row.locator("td").nth(1));
      let status = null;
      let piste = "";
      let statusNote = "";
      if (statusText === "滑走可能") {
        status = "○";
        const pisteText = await trimAndToHalfWidth(row.locator("td").nth(2));
        if (pisteText === "○") {
          piste = "圧雪 ";
        } else {
          piste = "非圧雪";
        }
      } else if (statusText === "滑走不可") {
        status = "×";
      } else if (statusText === "規制あり") {
        status = "△";
        statusNote = statusText;
      } else if (statusText === "点検中") {
        status = "×";
        statusNote = statusText;
      }
      if (!status) {
        console.warn(
          `⚠️ [${resortName} ${name} Course] Status is null or empty`,
        );
      } else if (status !== "○" && status !== "△" && status !== "×") {
        console.warn(
          `⚠️ [${resortName} ${name} Course] Status (${status}) is incorrect format`,
        );
      }
      const noteText = await trimAndToHalfWidth(row.locator("td").nth(3));
      const note = (piste + statusNote + " " + noteText).trim();

      if (name === "とおみゲレンデ（早朝営業）") {
        const target = courses.find(c => c.name === "とおみゲレンデ下部");
        if (status === "○" && target) {
          target.note += "早朝営業あり ";
        }
      } else if (name === "とおみゲレンデ（ナイター営業）") {
        const target = courses.find(c => c.name === "とおみゲレンデ下部");
        if (status === "○" && target) {
          target.note = "ナイター営業あり ";
        }
      } else {
        courses.push({
          name: name,
          status: status,
          update: areaUpdate,
          note: note,
        });
      }
    }
  }

  // リフト情報
  const areaLiftElems = await page.locator(
    '.acms-admin-table:has-text("リフト名")',
  );
  for (let i = 0; i < (await areaLiftElems.count()); i++) {
    const area = areaLiftElems.nth(i);
    const areaUpdate = (
      await trimAndToHalfWidth(area.locator(".update-time-wrap"))
    )
      .replace("更新", "")
      .trim()
      .replace(/^\d{4}-(\d{2})-(\d{2})/, "$1/$2");
    for (let j = 0; j < (await area.locator("tbody tr").count()); j++) {
      const row = area.locator("tbody tr").nth(j);
      const rawName = (
        await trimAndToHalfWidth(row.locator("td").nth(0))
      ).replace("リフト", "");
      const name = liftNameMap[rawName] ?? rawName;
      if (!name) {
        console.warn(`⚠️ [${resortName}] Lift name is null or empty`);
      }
      const statusText = await trimAndToHalfWidth(row.locator("td").nth(1));
      let status = null;
      if (statusText === "運行中") {
        status = "○";
      } else if (statusText === "運休中") {
        status = "×";
      } else if (statusText === "準備中") {
        status = "△";
      }
      if (!status) {
        console.warn(`⚠️ [${resortName} ${name} Lift] Status is null or empty`);
      } else if (status !== "○" && status !== "△" && status !== "×") {
        console.warn(
          `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
        );
      }
      let hours = "";
      if (statusText === "運行中" || statusText === "準備中") {
        hours = (await trimAndToHalfWidth(row.locator("td").nth(2))) + " ";
      }
      const noteText = await trimAndToHalfWidth(row.locator("td").nth(3));
      const note = (hours + noteText).trim();
      if (name in liftTwoLine) {
        const liftNames = liftTwoLine[name];
        for (const liftName of liftNames) {
          lifts.push({
            name: liftName,
            status: status,
            update: areaUpdate,
            note: note,
          });
        }
      } else {
        lifts.push({
          name: name,
          status: status,
          update: areaUpdate,
          note: note,
        });
      }
    }
  }

  const courseNum = 39;
  const liftNum = 22;
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
