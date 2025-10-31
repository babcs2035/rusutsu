import fs from "node:fs";
import { chromium, type Locator } from "playwright";
import { tqdm } from "ts-tqdm";
import type { SkiAreaT } from "@/types";
import type { WeathersT } from "@/types/weathers";
import { fetchAsync } from "./fetch";

async function trimElem(element: Locator): Promise<string> {
  return ((await element.allInnerTexts())[0] || "").trim();
}

const skiAreas: SkiAreaT[] = JSON.parse(
  fs.readFileSync("../data/SkiAreas.json", "utf-8"),
);
const snowForecastDict = JSON.parse(
  fs.readFileSync("../data/SnowForecastDict.json", "utf-8"),
);

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`https://www.snow-forecast.com/countries/Japan/resorts`);
const tabs = await page.locator("#ctry_tabs").locator("a");
const ids = [];
for (const tab_i of tqdm((await tabs.count()) + 1)) {
  const rows = await page
    .locator(".digest-table")
    .locator("tbody")
    .locator(".digest-row");
  for (const row_i of tqdm(await rows.count())) {
    const id = (await rows.nth(row_i).getAttribute("data-url"))?.split("/")[2];
    ids.push(id);
  }
  if (tab_i < (await tabs.count())) {
    await page.goto(
      `https://www.snow-forecast.com/countries/Japan/resorts/${(await trimElem(await tabs.nth(tab_i))).replaceAll("–", "-")}`,
    );
  }
}

console.log(`Fetched ${ids.length} ids`);

const weathers: WeathersT[] = [];
for (const id of tqdm(ids)) {
  if (fs.existsSync(`../data/temp/weathers/${id}.json`)) {
    weathers.push(
      JSON.parse(fs.readFileSync(`../data/temp/weathers/${id}.json`, "utf-8")),
    );
    continue;
  }

  const data = await fetchAsync({
    url: `https://www.snow-forecast.com/hindcast_history/${id}.json`,
    options: {
      method: "GET",
    },
  });

  let skiAreaData = skiAreas.find(skiArea =>
    skiArea.name.en.includes(data.resort.englishname),
  );
  if (snowForecastDict[data.resort.englishname]) {
    skiAreaData = skiAreas.find(
      skiArea => skiArea.name.en === snowForecastDict[data.resort.englishname],
    );
  }

  const weather: WeathersT = {} as WeathersT;
  weather.meta = {
    id: skiAreaData?.id || "",
    name: {
      ja: skiAreaData?.name.ja || "",
      en: skiAreaData?.name.en || data.resort.englishname,
    },
    date: new Date()
      .toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      .replaceAll("/", "-"),
    source: `https://www.snow-forecast.com/resorts/${id}`,
  };

  for (const pos of ["top", "mid", "bot"] as const) {
    await page.goto(`https://www.snow-forecast.com/resorts/${id}/6day/${pos}`);
    const button = await page.locator(
      "span.hindcast-prompt__title.hindcast-prompt__title--left",
    );
    await button.click();
    await page.waitForTimeout(1000);
    const winds: Array<{
      speed: number;
      direction: string;
    }> = [];
    const snows = [];
    const temperatures = [];
    const windTable = await page.locator(
      "#forecast-table > div > table > tbody > tr:nth-child(3)",
    );
    for (const tdElem of await windTable.locator("td").all()) {
      const direction = await tdElem
        .locator(".wind-icon__arrow")
        .getAttribute("transform");
      if (direction) {
        winds.push({
          speed: Number(await trimElem(tdElem)),
          direction,
        });
      }
    }
    const snowTable = await page.locator(
      "#forecast-table > div > table > tbody > tr:nth-child(6)",
    );
    for (const tdElem of await snowTable.locator("td").all()) {
      snows.push(Number(await trimElem(tdElem)) || 0);
    }
    const tempTable = await page.locator(
      "#forecast-table > div > table > tbody > tr:nth-child(8)",
    );
    for (const tdElem of await tempTable.locator("td").all()) {
      temperatures.push(Number(await trimElem(tdElem)));
    }
    weather[pos] = {
      winds,
      snows,
      temperatures,
    };
  }

  fs.writeFileSync(
    `../data/temp/weathers/${id}.json`,
    JSON.stringify(weather, null, 0),
  );
  weathers.push(weather);
}

console.log(`Fetched ${weathers.length} weathers`);
fs.writeFileSync("../data/Weathers.json", JSON.stringify(weathers, null, 0));

await browser.close();
