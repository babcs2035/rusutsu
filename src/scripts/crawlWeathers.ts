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
  console.log("🌤️ Starting weather data crawler...");

  // SnowForecast English Name から SnowJapan ID (データベース上の ID) への逆引きマップを作成する．
  // これにより，ID が既知の場合に高速かつ確実なマッチングが可能となる．
  const sfNameToSjIdMap = Object.entries(SnowJapanToSnowForecastDict).reduce(
    (acc, [sjId, sfName]) => {
      if (sfName) acc[sfName] = sjId;
      return acc;
    },
    {} as Record<string, string>,
  );

  // データベースから全てのスキー場を取得する．
  const skiResorts = await prisma.skiResort.findMany({
    select: { id: true, nameJa: true, nameEn: true, sources: true },
  });

  console.log(`📦 Found ${skiResorts.length} ski resorts in the database.`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Snow-Forecast の日本スキー場一覧ページから，各リゾートの ID (URLスラッグ) を収集する．
  await page.goto("https://www.snow-forecast.com/countries/Japan/resorts");
  const tabs = await page.locator("#ctry_tabs").locator("a");
  const snowForecastIds: string[] = [];

  // 各タブ (A-Z, etc.) を巡回してリゾートリンクを取得する．
  for (const tab_i of tqdm((await tabs.count()) + 1)) {
    const rows = await page
      .locator(".digest-table")
      .locator("tbody")
      .locator(".digest-row");
    for (const row_i of [...Array(await rows.count()).keys()]) {
      const id = (await rows.nth(row_i).getAttribute("data-url"))?.split(
        "/",
      )[2];
      if (id) snowForecastIds.push(id);
    }
    // 次のタブへ移動
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

  console.log(
    `📡 Found ${snowForecastIds.length} resorts on Snow-Forecast.com.`,
  );

  // 収集した各リゾートについて，過去の気象データを取得する．
  for (const sfId of tqdm(snowForecastIds)) {
    try {
      // API からリゾートのメタデータを取得する．
      // biome-ignore lint/suspicious/noExplicitAny: External API response has dynamic keys
      const data: any = await fetchAsync({
        url: `https://www.snow-forecast.com/hindcast_history/${sfId}.json`,
        options: { method: "GET" },
      });

      // 取得したリゾートをデータベース上のスキー場と紐付ける．
      let skiResort = null;

      // 1. 逆引き辞書を使用して ID でマッチングする．
      if (sfNameToSjIdMap[data.resort.englishname]) {
        skiResort = skiResorts.find(
          r => r.id === sfNameToSjIdMap[data.resort.englishname],
        );
      }

      // 2. SnowForecast 用の名寄せ辞書を使用して名前でマッチングする．
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

      // 3. 英語名の部分一致によるフォールバック検索を行う．
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

      // マッチするスキー場がない場合はスキップする．
      if (!skiResort) continue;

      // URL を sources に追加する（未登録の場合のみ）
      const sourceUrl = `https://www.snow-forecast.com/resorts/${sfId}`;
      if (!skiResort.sources.includes(sourceUrl)) {
        await prisma.skiResort.update({
          where: { id: skiResort.id },
          data: {
            sources: { push: sourceUrl },
          },
        });
        skiResort.sources.push(sourceUrl);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const weatherData: {
        top: unknown;
        mid: unknown;
        bot: unknown;
      } = { top: null, mid: null, bot: null };

      // 山頂 (top)，中腹 (mid)，山麓 (bot) の各地点のデータをスクレイピングする．
      for (const pos of ["top", "mid", "bot"] as const) {
        await page.goto(
          `https://www.snow-forecast.com/resorts/${sfId}/6day/${pos}`,
        );
        // 単位設定などを変更するためのボタンをクリックする（必要な場合）．
        const button = await page.locator(
          "span.hindcast-prompt__title.hindcast-prompt__title--left",
        );
        if (await button.isVisible()) {
          await button.click();
          await page.waitForTimeout(1000);
        }

        const winds: Array<{ speed: number; direction: string }> = [];
        const snows: number[] = [];
        const temperatures: number[] = [];

        // 風速データを取得
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

        // 降雪予報を取得
        const snowTable = await page.locator(
          "#forecast-table > div > table > tbody > tr:nth-child(6)",
        );
        for (const tdElem of await snowTable.locator("td").all()) {
          snows.push(Number(await trimElem(tdElem)) || 0);
        }

        // 気温データを取得
        const tempTable = await page.locator(
          "#forecast-table > div > table > tbody > tr:nth-child(8)",
        );
        for (const tdElem of await tempTable.locator("td").all()) {
          temperatures.push(Number(await trimElem(tdElem)));
        }

        weatherData[pos] = { winds, snows, temperatures };
      }

      // 天気データをデータベースに保存する（日次データとして Upsert）．
      await prisma.weather.upsert({
        where: {
          skiResortId_date: { skiResortId: skiResort.id, date: today },
        },
        update: {
          source: `https://www.snow-forecast.com/resorts/${sfId}`,
          topData: weatherData.top as object,
          midData: weatherData.mid as object,
          botData: weatherData.bot as object,
        },
        create: {
          skiResortId: skiResort.id,
          date: today,
          source: `https://www.snow-forecast.com/resorts/${sfId}`,
          topData: weatherData.top as object,
          midData: weatherData.mid as object,
          botData: weatherData.bot as object,
        },
      });
    } catch {
      // 個別のリゾート取得エラーはログに出さずスキップし，処理を継続する．
    }
  }

  await browser.close();

  const count = await prisma.weather.count();
  console.log(
    `\n✅ Successfully saved ${count} weather records to the database.`,
  );
}

export { main as runCrawlWeathers };

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
