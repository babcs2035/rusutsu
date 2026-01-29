import { chromium, type Locator } from "playwright";
import { tqdm } from "ts-tqdm";
import SnowForecastDict from "@/data/SnowForecastDict.json";
import SnowJapanToSnowForecastDict from "@/data/SnowJapanToSnowForecastDict.json";
import { disconnectPrisma, prisma } from "@/lib/prisma";

// 簡易的な fetch ラッパー関数．
async function fetchAsync<T>(args: {
  url: string;
  options?: RequestInit;
}): Promise<T> {
  const res = await fetch(args.url, args.options);
  if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
  return res.json() as Promise<T>;
}

// 要素のテキストを取得し，前後の空白を削除するヘルパー関数．
async function trimElem(element: Locator): Promise<string> {
  return ((await element.allInnerTexts())[0] || "").trim();
}

async function main() {
  console.log("📈 Starting forecast data crawler...");

  // SnowForecast ID から SnowJapan ID (データベース上の ID) への逆引きマップを作成する．
  const sfIdToSjIdMap = Object.entries(SnowJapanToSnowForecastDict).reduce(
    (acc, [sjId, sfId]) => {
      if (sfId) acc[sfId] = sjId;
      return acc;
    },
    {} as Record<string, string>,
  );

  // データベースから全てのスキー場を取得する．
  const skiResorts = await prisma.skiResort.findMany({
    select: { id: true, nameJa: true, nameEn: true },
  });

  console.log(`📦 Found ${skiResorts.length} ski resorts in the database.`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Snow-Forecast の日本スキー場一覧ページを開く．
  await page.goto("https://www.snow-forecast.com/countries/Japan/resorts");
  const tabs = await page.locator("#ctry_tabs").locator("a");

  // 各タブページを巡回し，リゾートごとに予報データを取得する．
  for (const tab_i of tqdm((await tabs.count()) + 1)) {
    const rows = await page
      .locator(".digest-table")
      .locator("tbody")
      .locator(".digest-row");

    for (const row_i of [...Array(await rows.count()).keys()]) {
      try {
        const id = (await rows.nth(row_i).getAttribute("data-url"))?.split(
          "/",
        )[2];
        if (!id) continue;

        // API から予報データを取得する．
        // biome-ignore lint/suspicious/noExplicitAny: External API response has dynamic keys
        const data: any = await fetchAsync({
          url: `https://www.snow-forecast.com/hindcast_history/${id}.json`,
          options: { method: "GET" },
        });

        // データベース上のスキー場とマッチングする．
        let skiResort = null;

        // 1. 逆引き辞書で検索
        if (sfIdToSjIdMap[id]) {
          skiResort = skiResorts.find(r => r.id === sfIdToSjIdMap[id]);
        }

        // 2. 名寄せ辞書で検索
        if (!skiResort) {
          const dictName = (SnowForecastDict as Record<string, string>)[
            data.resort.englishname
          ];
          if (dictName) {
            skiResort =
              skiResorts.find(r => r.nameEn === dictName) ||
              skiResorts.find(
                r => r.nameEn.toLowerCase() === dictName.toLowerCase(),
              );
          }
        }

        // 3. 部分一致検索（フォールバック）
        if (!skiResort) {
          skiResort = skiResorts.find(
            r =>
              r.nameEn
                .toLowerCase()
                .includes(data.resort.englishname.toLowerCase()) ||
              data.resort.englishname
                .toLowerCase()
                .includes(r.nameEn.toLowerCase()),
          );
        }

        // マッチしないリゾートはスキップする．
        if (!skiResort) continue;

        const forecastData = {
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
            },
          },
        };

        // 天気予報データをデータベースに保存する（Upsert）．
        await prisma.forecast.upsert({
          where: { skiResortId: skiResort.id },
          update: {
            dateStart: data.resort.date_start,
            dateEnd: data.resort.date_end,
            topData: forecastData.top as object,
            middleData: forecastData.middle as object,
            bottomData: forecastData.bottom as object,
          },
          create: {
            skiResortId: skiResort.id,
            dateStart: data.resort.date_start,
            dateEnd: data.resort.date_end,
            topData: forecastData.top as object,
            middleData: forecastData.middle as object,
            bottomData: forecastData.bottom as object,
          },
        });
      } catch {
        // エラーが発生した場合はスキップし，処理を継続する．
      }
    }

    if (tab_i < (await tabs.count())) {
      const tabName = (await trimElem(await tabs.nth(tab_i))).replaceAll(
        "–",
        "-",
      );
      await page.goto(
        `https://www.snow-forecast.com/countries/Japan/resorts/${tabName}`,
      );
    }
  }

  await browser.close();

  const count = await prisma.forecast.count();
  console.log(`\n✅ Successfully saved ${count} forecasts to the database.`);
}

export { main as runCrawlForecasts };

if (require.main === module) {
  main()
    .catch(e => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await disconnectPrisma();
    });
}
