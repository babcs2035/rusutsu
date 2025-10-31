import fs from "node:fs";
import { chromium, type Locator } from "playwright";

async function trimElem(element: Locator): Promise<string> {
  return ((await element.allInnerTexts())[0] || "").trim();
}

function getWeatherFromImgSrc(imgSrc: string | null | undefined): string {
  if (imgSrc?.endsWith("sun.svg")) {
    return "晴れ";
  } else if (imgSrc?.endsWith("cloud.svg")) {
    return "くもり";
  } else if (imgSrc?.endsWith("rain.svg")) {
    return "雨";
  } else if (imgSrc?.endsWith("snow.svg")) {
    return "雪";
  } else if (imgSrc) {
    const match = imgSrc.match(/icon_(.+?)\.svg/);
    if (match) {
      return match[1]; // ()の中が取り出される
    }
  }
  return "";
}

const browser = await chromium.launch();
const context = await browser.newContext({
  locale: "ja-JP",
});
const page = await context.newPage();

// スキー場のURL
// 実際のURLに差し替えて

const resortName = "sapporo-kokusai"; // スキー場名
const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

const comment = null; // コメント（適宜変更）

// 天気・積雪情報
await page.goto("https://www.sapporo-kokusai.jp/");
const weather: Record<string, any> = {};
const weatherImgSrc = await page
  .locator(
    "#toprealtime > div.w.realtime__box > div:nth-child(3) > div.realtime__text_large > div > div > img",
  )
  .getAttribute("src");
weather["山頂"] = {
  time: await trimElem(
    page.locator("#toprealtime > div.w.p00.datetime-wrap > p"),
  ),
  weather: getWeatherFromImgSrc(weatherImgSrc),
  temperature: parseFloat(
    (
      await trimElem(
        page.locator(
          "#toprealtime > div.w.realtime__box > div:nth-child(6) > div.realtime__text_large > p",
        ),
      )
    ).replace("℃", ""),
  ),
  snowDepth: parseFloat(
    (
      await trimElem(
        page.locator(
          "#toprealtime > div.w.realtime__box > div:nth-child(8) > div.realtime__text_large > p",
        ),
      )
    ).replace("cm", ""),
  ),
  snowfall: parseFloat(
    (
      await trimElem(
        page.locator(
          "#toprealtime > div.w.realtime__box > div:nth-child(4) > div.realtime__text_large > p",
        ),
      )
    ).replace("cm", ""),
  ),
  quality: await trimElem(
    page.locator(
      "#toprealtime > div.w.realtime__box > div:nth-child(7) > div.realtime__text_large > p",
    ),
  ),
  windSpeed: parseFloat(
    (
      await trimElem(
        page.locator(
          "#toprealtime > div.w.realtime__box > div:nth-child(5) > div.realtime__text_large > p",
        ),
      )
    ).replace("m/s", ""),
  ),
};

await page.goto("https://www.sapporo-kokusai.jp/slopes/");

// コース情報
const courseElems = await page.locator("table.course__detail > tbody > tr");
const courses = [];
for (let i = 1; i < (await courseElems.count()); i++) {
  const row = courseElems.nth(i);
  const name = (await trimElem(await row.locator("th").nth(0))).replace(
    "コース",
    "",
  );
  if (!name.includes("初心者・そり") && name !== "") {
    const status = await trimElem(await row.locator("td").nth(5));
    courses.push({
      name: name,
      open: status,
      time: null,
      note: null,
    });
  }
}

// リフト情報
const liftElems = await page.locator("table.lift-table > tbody > tr");
const lifts = [];
for (let i = 1; i < 5; i++) {
  const row = liftElems.nth(i);
  const name = (await trimElem(await row.locator("td").nth(0))).replace(
    "リフト",
    "",
  );
  if (name !== "スノーエスカレーター") {
    const note = await trimElem(await row.locator("td").nth(3));
    let status = "";
    if (note.includes("運休")) {
      status = "×";
    } else if (note.includes("運行時間")) {
      status = "○";
    }
    lifts.push({
      name: name,
      open: status,
      note: note,
    });
  }
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
