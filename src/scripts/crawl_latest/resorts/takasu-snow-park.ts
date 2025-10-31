import fs from "node:fs";
import { chromium, type Locator } from "playwright";

async function trimElem(element: Locator): Promise<string> {
  return ((await element.allInnerTexts())[0] || "").trim();
}

function getWeatherFromImgSrc(imgSrc: string | null | undefined): string {
  if (imgSrc?.endsWith("01.png")) {
    return "晴れ";
  } else if (imgSrc?.endsWith("02.png")) {
    return "くもり";
  } else if (imgSrc?.endsWith("03.png")) {
    return "雨";
  } else if (imgSrc?.endsWith("04.png")) {
    return "小雨";
  } else if (imgSrc?.endsWith("05.png")) {
    return "小雪";
  } else if (imgSrc?.endsWith("06.png")) {
    return "雪";
  } else if (imgSrc?.endsWith("07.png")) {
    return "大雪";
  } else if (imgSrc?.endsWith("08.png")) {
    return "みぞれ";
  } else {
    return "";
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({
  locale: "ja-JP",
});
const page = await context.newPage();

// スキー場のURL
await page.goto("https://www.takasu.gr.jp/condition/"); // 実際のURLに差し替えて

const resortName = "takasu-snow-park"; // スキー場名
const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

const comment = await trimElem(
  page.locator("#comment > div > div.content_inner"),
); // コメント（適宜変更）

// 天気・積雪情報
const weather: Record<string, any> = {};
const imgSrcTop = await page
  .locator(
    "body > main > section:nth-child(9) > div > div.content_inner > table.table_wes.mgb30 > tbody > tr:nth-child(1) > td.table_wesinfo > img",
  )
  .getAttribute("src");
weather["山頂"] = {
  time: await trimElem(
    page.locator("body > main > section.date > div > div > time"),
  ),
  weather: getWeatherFromImgSrc(imgSrcTop),
  temperature: parseFloat(
    (
      await trimElem(
        page.locator(
          "body > main > section:nth-child(9) > div > div.content_inner > table.table_wes.mgb30 > tbody > tr:nth-child(3) > td:nth-child(2)",
        ),
      )
    ).replace("℃", ""),
  ),
  snowDepth: parseFloat(
    (
      await trimElem(
        page.locator(
          "body > main > section:nth-child(9) > div > div.content_inner > table.table_wes.mgb30 > tbody > tr:nth-child(2) > td:nth-child(2)",
        ),
      )
    ).replace("cm", ""),
  ),
  snowfall: "",
  quality: await trimElem(
    page.locator(
      "body > main > section:nth-child(9) > div > div.content_inner > table.table_wes.mgb30 > tbody > tr:nth-child(4) > td.info",
    ),
  ),
  windSpeed: "",
};

const imgSrcMid = await page
  .locator(
    "body > main > section:nth-child(9) > div > div.content_inner > table:nth-child(2) > tbody > tr:nth-child(1) > td.table_wesinfo > img",
  )
  .getAttribute("src");
weather["中腹"] = {
  time: await trimElem(
    page.locator("body > main > section.date > div > div > time"),
  ),
  weather: getWeatherFromImgSrc(imgSrcMid),
  temperature: parseFloat(
    (
      await trimElem(
        page.locator(
          "body > main > section:nth-child(9) > div > div.content_inner > table:nth-child(2) > tbody > tr:nth-child(3) > td:nth-child(2)",
        ),
      )
    ).replace("℃", ""),
  ),
  snowDepth: parseFloat(
    (
      await trimElem(
        page.locator(
          "body > main > section:nth-child(9) > div > div.content_inner > table:nth-child(2) > tbody > tr:nth-child(2) > td:nth-child(2)",
        ),
      )
    ).replace("cm", ""),
  ),
  snowfall: "",
  quality: await trimElem(
    page.locator(
      "body > main > section:nth-child(9) > div > div.content_inner > table:nth-child(2) > tbody > tr:nth-child(4) > td:nth-child(2)",
    ),
  ),
  windSpeed: "",
};

// コース情報
const tables = await page.locator("table.table_basic");
const courses = [];
const targetTables: Locator[] = [];
for (const table of await tables.all()) {
  const className = await table.getAttribute("class");
  if (
    className?.includes("shokyu") ||
    className?.includes("chukyu") ||
    className?.includes("jokyu")
  ) {
    targetTables.push(table);
  }
}

for (let i = 0; i < (await targetTables.length); i++) {
  const table = targetTables[i];
  const rowsCourse = await table.locator("tbody tr");
  for (let j = 1; j < (await rowsCourse.count()); j++) {
    // j=1にしてるのはヘッダー(リフト名/営業/備考など)をスキップするため
    const row = rowsCourse.nth(j);
    const name = (await trimElem(await row.locator("td").nth(0))).replace(
      "コース",
      "",
    );
    const status = await trimElem(await row.locator("td").nth(1));
    const note = await trimElem(await row.locator("td").nth(2));
    if (!name.includes("ダイナランドとの山頂往来")) {
      courses.push({
        name: name,
        open: status,
        note: note,
      });
    }
  }
}

// リフト情報
const liftElems = await page.locator(
  "#lift_anch > div > div.content_inner > table",
);
const rows = await liftElems.locator("tbody tr");
const lifts = [];
for (let j = 1; j < (await rows.count()); j++) {
  // j=1にしてるのはヘッダー(リフト名/営業/備考など)をスキップするため
  const row = rows.nth(j);
  const name = await trimElem(await row.locator("td").nth(0));
  const status = await trimElem(await row.locator("td").nth(2));
  const note1 = await trimElem(await row.locator("td").nth(1));
  const note3 = await trimElem(await row.locator("td").nth(3));
  const note = note1 ? `${note1} ${note3}` : note3;
  lifts.push({
    name: name,
    open: status, // "open" / "close"
    note: note,
  });
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
