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

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0")); // datePart.split('/').map(s => s.padStart(2, '0'));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

// スキー場名
const resortName = "gunma-minakami-houdaigi";

const url0 = "https://hodaigi.jp/news-event/";

let comment = null;
const liftHours: { name: string; hours: string }[] = [];

let success0 = true;
try {
  await page.goto(url0, { timeout: 30000 });
  await page.waitForSelector(".m__newslist_item .date", {
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
  console.error(`❌ [${resortName}] Error navigating to ${url0}: ${message}`);
  success0 = false;
}
if (success0) {
  const baseDate = new Date(
    Number(year), // 年
    Number(month) - 1, // 月 (0始まり)
    Number(day), // 日
    Number(hour), // 時
    Number(minute), // 分
    Number(second), // 秒
  );
  baseDate.setDate(baseDate.getDate() + 1);

  const todayYear = Number(year);
  const todayMonth = Number(month);
  const todayDay = Number(day);
  const tomorrowMonth = baseDate.getMonth() + 1;
  const tomorrowDay = baseDate.getDate();

  const newsElems = page.locator("a.m__newslist_item");
  let foundNews = false;
  for (let i = 0; i < (await newsElems.count()); i++) {
    const row = newsElems.nth(i);
    const dateText = await trimAndToHalfWidth(row.locator(".date"));
    const [newsYearStr, newsMonthStr, newsDayStr] = dateText
      .split(".")
      .map(s => s.trim());
    const newsYear = Number(newsYearStr);

    // 1月1日または2日の場合、最新ニュースの年が現在の年と異なっていても許容する
    // それ以外では、警告を出す
    if (
      newsYear !== todayYear &&
      !(todayMonth === 1 && (todayDay === 1 || 2))
    ) {
      console.warn(
        `⚠️ [${resortName}] Latest news year (${newsYear}) does not match today's year (${todayYear})`,
      );
    }
    const titleText = await trimAndToHalfWidth(row.locator(".ttl .txt"));
    if (!titleText) continue;

    if (titleText.includes("営業案内")) {
      const match = titleText.match(/(\d{1,2})月(\d{1,2})日/);
      if (!match) continue;
      const [, newsMonthStr, newsDayStr] = match;
      const newsMonth = Number(newsMonthStr);
      const newsDay = Number(newsDayStr);
      const isToday = newsMonth === todayMonth && newsDay === todayDay;
      const isTomorrow = newsMonth === tomorrowMonth && newsDay === tomorrowDay;
      if (isToday || isTomorrow) {
        foundNews = true;
        await row.click();
        try {
          await page.waitForSelector(".b09__detail_edit", {
            state: "visible",
            timeout: 15000,
          });
        } catch (error) {
          console.error(
            `❌ [${resortName}] Target element not found or not visible in cilicked news`,
          );
        }

        const newsP = await page.locator(".b09__detail_edit p").all();
        comment = await Promise.all(
          newsP.map(el => el.evaluate(node => node.outerHTML)),
        );

        const infoElem = await page.locator(".b09__detail_edit p");
        for (let j = 0; j < (await infoElem.count()); j++) {
          const liftText = await trimAndToHalfWidth(infoElem.nth(j));
          if (
            liftText.includes("●運転リフト") ||
            liftText.includes("●運行リフト") ||
            liftText.includes("●運転予定リフト") ||
            liftText.includes("●運行予定リフト")
          ) {
            const lines = liftText
              .split("\n")
              .map(l => l.trim())
              .filter(l => l.length > 0);

            for (const line of lines) {
              if (
                line.includes("リフト") &&
                /\d{1,2}:\d{2}[〜～]\d{1,2}:\d{2}/.test(line)
              ) {
                const match = line.match(
                  /(.+?)\s+(\d{1,2}:\d{2}[〜～]\d{1,2}:\d{2})/,
                );
                if (match) {
                  const name = match[1].replace("リフト", "").trim();
                  const hours = match[2].trim();
                  liftHours.push({ name, hours });
                }
              }
            }
            break;
          }
        }
      }
    }
  }
  if (!foundNews) {
    const latestRow = newsElems.first();
    await latestRow.click();
    try {
      await page.waitForSelector(".b09__detail_edit", {
        state: "visible",
        timeout: 15000,
      });
    } catch (error) {
      console.error(
        `❌ [${resortName}] Target element not found or not visible in cilicked news`,
      );
    }

    const newsP = await page.locator(".b09__detail_edit p").all();
    comment = await Promise.all(
      newsP.map(el => el.evaluate(node => node.outerHTML)),
    );
  }
}

// スキー場のURL
const url1 = "https://hodaigi.jp/gelande-guide/";
let success1 = true;
try {
  await page.goto(url1, { timeout: 30000 });
  await page.waitForSelector("div.m__flexcol3_item div.m__card", {
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
  console.error(`❌ [${resortName}] Error navigating to ${url1}: ${message}`);
  success1 = false;
}

const weather: Record<string, WeatherData> = {};
const courses = [];
const lifts = [];

if (success1) {
  // コメント
  const weatherIcon = await page
    .locator('div.weather2 dl:has-text("天気") dd img')
    .getAttribute("src");
  let weatherText = "";
  if (weatherIcon?.includes("sunny.svg")) {
    weatherText = "晴れ";
  } else if (weatherIcon?.includes("cloudy.svg")) {
    weatherText = "曇り";
  } else if (weatherIcon?.includes("rain.svg")) {
    weatherText = "雨";
  } else if (weatherIcon?.includes("snow.svg")) {
    weatherText = "雪";
  }

  // 天気・積雪情報
  weather["山頂"] = {
    time: await trimAndToHalfWidth(page.locator("div.txt span.date")),
    weather: weatherText,
    temperature: (
      await trimAndToHalfWidth(
        page.locator('div.weather2 dl:has-text("気温") dd'),
      )
    ).replace("℃", ""),
    snowDepth: (
      await trimAndToHalfWidth(
        page.locator('div.weather2 dl:has-text("積雪") dd'),
      )
    ).replace("cm", ""),
    snowfall: (
      await trimAndToHalfWidth(
        page.locator('div.weather2 dl:has-text("過去24h積雪量") dd'),
      )
    ).replace("cm", ""),
    condition: null,
    windSpeed: null,
  };

  for (const point of Object.keys(weather)) {
    const pointWeather = weather[point];
    if (pointWeather?.time == null || pointWeather?.time === "") {
      console.warn(`⚠️ [${resortName} (${point})] Time is null or empty`);
    }
    if (pointWeather?.weather == null || pointWeather?.weather === "") {
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

  const courseElems = page.locator("div.m__flexcol3_item div.m__card");
  for (let i = 0; i < (await courseElems.count()); i++) {
    const row = courseElems.nth(i);
    const name = (await trimAndToHalfWidth(await row.locator(".ttl")))
      .replace("コース", "")
      .replace(/[～〜][^～〜]*[～〜]$/, "")
      .trim();
    if (name == null || name === "") {
      console.warn(`⚠️ [${resortName}] Course name is null or empty`);
    }
    const note = await trimAndToHalfWidth(row.locator(".label"));
    let status = null;
    if (note.includes("全面滑走可")) {
      status = "○";
    } else if (note.includes("一部")) {
      status = "△";
    } else if (note.includes("閉鎖中")) {
      status = "×";
    }
    if (status == null || status === "") {
      console.warn(`⚠️ [${resortName} ${name} Course] Status is null or empty`);
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
  const liftElems = await page.locator("dl.m__table2_item");
  for (let i = 0; i < (await liftElems.count()); i++) {
    const row = liftElems.nth(i);
    const name = (await trimAndToHalfWidth(await row.locator("dt.th"))).replace(
      "リフト",
      "",
    );
    if (name == null || name === "") {
      console.warn(`⚠️ [${resortName}] Lift name is null or empty`);
    }
    const status = await trimAndToHalfWidth(await row.locator("dd.td"));
    if (status == null || status === "") {
      console.warn(`⚠️ [${resortName} ${name} Lift] Status is null or empty`);
    } else if (status !== "○" && status !== "△" && status !== "×") {
      console.warn(
        `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
      );
    }

    // リフトの営業時間を追加
    let note = "";
    for (const liftHour of liftHours) {
      if (liftHour.name === name) {
        note = liftHour.hours;
        break;
      }
    }
    if ((note == null || note === "") && status === "○") {
      console.warn(`⚠️ [${resortName} ${name} Lift] Note is null or empty`);
    }
    lifts.push({
      name: name,
      status: status,
      note: note,
    });
  }

  const courseNum = 19;
  const liftNum = 7;
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

if (success0 === true && success1 === true) {
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
    `✅ Saved: ../../data/resorts-temporary/latest_data/${resortName}/${formattedNow}.json`,
  );
} else {
  console.error(`❌ Failed to retrieve data from one or more URLs.`);
}
await browser.close();
