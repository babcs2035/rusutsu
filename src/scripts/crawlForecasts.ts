import fs from "node:fs";
import { chromium, type Locator, type Page } from "playwright";
import { tqdm } from "ts-tqdm";
import type { ForecastsT } from "@/types/Forecast";
import type { SkiAreaT } from "@/types/SkiArea";
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
const snowForecastDict2 = JSON.parse(
  fs.readFileSync("../data/SnowJapanToSnowForecastDict.json", "utf-8"),
);

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`https://www.snow-forecast.com/countries/Japan/resorts`);
const tabs = await page.locator("#ctry_tabs").locator("a");
const forecasts: ForecastsT[] = [];
for (const tab_i of tqdm((await tabs.count()) + 1)) {
  const rows = await page
    .locator(".digest-table")
    .locator("tbody")
    .locator(".digest-row");
  for (const row_i of tqdm(await rows.count())) {
    const id = (await rows.nth(row_i).getAttribute("data-url"))?.split("/")[2];
    const data = await fetchAsync({
      url: `https://www.snow-forecast.com/hindcast_history/${id}.json`,
      options: {
        method: "GET",
      },
    });

    const mins_top = [];
    const maxs_top = [];
    const mins_middle = [];
    const maxs_middle = [];
    const mins_bottom = [];
    const maxs_bottom = [];
    for (let week_i = 1; week_i <= 48; week_i++) {
      mins_top.push(data[`minimum_temperature_by_week_number.max.${week_i}`]);
      maxs_top.push(data[`maximum_temperature_by_week_number.max.${week_i}`]);
      mins_middle.push(
        data[`minimum_temperature_by_week_number.mid.${week_i}`],
      );
      maxs_middle.push(
        data[`maximum_temperature_by_week_number.mid.${week_i}`],
      );
      mins_bottom.push(
        data[`minimum_temperature_by_week_number.min.${week_i}`],
      );
      maxs_bottom.push(
        data[`maximum_temperature_by_week_number.min.${week_i}`],
      );
    }

    let skiAreaData = skiAreas.find(skiArea =>
      skiArea.name.en.includes(data.resort.englishname),
    );
    if (snowForecastDict[data.resort.englishname]) {
      skiAreaData = skiAreas.find(
        skiArea =>
          skiArea.name.en === snowForecastDict[data.resort.englishname],
      );
    }
    let snowJapanId = "";
    for (const key in snowForecastDict2) {
      if (snowForecastDict2[key].includes(data.resort.englishname)) {
        snowJapanId = key;
        break;
      }
    }
    if (snowJapanId !== "") {
      skiAreaData = skiAreas.find(skiArea => skiArea.id === snowJapanId);
    }

    forecasts.push({
      meta: {
        id: skiAreaData?.id,
        name: {
          ja: skiAreaData?.name.ja,
          en: skiAreaData?.name.en || data.resort.englishname,
        },
        date_start: data.resort.date_start,
        date_end: data.resort.date_end,
      },
      top: {
        conditions: {
          bluebirdPowder: data["bluebird_powder_percent.max"],
          powder: data["powder_percent.max"],
          bluebird: data["bluebird_percent.max"],
        },
        snowfalls: {
          snowfall: data["average_snowfall.max"],
          significantSnowfall: data["snowing_percent.max"],
          significantRainfall: data["raining_percent.max"],
        },
        temperatures: {
          all: {
            min: data["average_tmin.max"],
            max: data["average_tmax.max"],
          },
          weeks: {
            min: mins_top,
            max: maxs_top,
          },
        },
      },
      middle: {
        conditions: {
          bluebirdPowder: data["bluebird_powder_percent.mid"],
          powder: data["powder_percent.mid"],
          bluebird: data["bluebird_percent.mid"],
        },
        snowfalls: {
          snowfall: data["average_snowfall.mid"],
          significantSnowfall: data["snowing_percent.mid"],
          significantRainfall: data["raining_percent.mid"],
        },
        temperatures: {
          all: {
            min: data["average_tmin.mid"],
            max: data["average_tmax.mid"],
          },
          weeks: {
            min: mins_middle,
            max: maxs_middle,
          },
        },
      },
      bottom: {
        conditions: {
          bluebirdPowder: data["bluebird_powder_percent.min"],
          powder: data["powder_percent.min"],
          bluebird: data["bluebird_percent.min"],
        },
        snowfalls: {
          snowfall: data["average_snowfall.min"],
          significantSnowfall: data["snowing_percent.min"],
          significantRainfall: data["raining_percent.min"],
        },
        temperatures: {
          all: {
            min: data["average_tmin.min"],
            max: data["average_tmax.min"],
          },
          weeks: {
            min: mins_bottom,
            max: maxs_bottom,
          },
        },
      },
    } as ForecastsT);
  }
  if (tab_i < (await tabs.count())) {
    await page.goto(
      `https://www.snow-forecast.com/countries/Japan/resorts/${(await trimElem(await tabs.nth(tab_i))).replaceAll("–", "-")}`,
    );
  }
}

console.log(`Fetched ${forecasts.length} forecasts`);
fs.writeFileSync("../data/Forecasts.json", JSON.stringify(forecasts, null, 0));

await browser.close();
