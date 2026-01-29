import { tqdm } from "ts-tqdm";
import { disconnectPrisma, prisma } from "@/lib/prisma";
import { fetchAsync } from "./fetch";

interface SkiAreaOutline {
  Id: number;
  UniqueName: string;
}

interface SnowDepthApiResponse {
  WeatherYear: number;
  WeatherMonth: number;
  WeatherDay: number;
  SnowDepth: number;
}

async function main() {
  console.log("📊 Crawling snow depths...");

  const outlines: SkiAreaOutline[] = await fetchAsync({
    url: "https://www.snowjapan.com/rest-api/skiarea/list/All",
    options: { method: "POST" },
  });

  console.log(`📦 Found ${outlines.length} ski areas to crawl`);

  for (const outline of tqdm(outlines)) {
    // スキー場が DB に存在するか確認
    const resort = await prisma.skiResort.findUnique({
      where: { id: outline.UniqueName },
    });
    if (!resort) continue;

    const details: { Id: number } = await fetchAsync({
      url: `https://www.snowjapan.com/rest-api/skiarea/${outline.UniqueName}`,
      options: { method: "POST" },
    });

    const snowDepths: SnowDepthApiResponse[] = await fetchAsync({
      url: `https://www.snowjapan.com/rest-api/skiarea/snowfall/${details.Id}`,
      options: { method: "POST" },
    });

    // 既存のレコードを削除
    await prisma.snowDepthRecord.deleteMany({
      where: { skiResortId: outline.UniqueName },
    });

    // 新規レコードを作成
    for (const sd of snowDepths) {
      if (sd.SnowDepth === 999 || sd.SnowDepth === 0) continue;

      // 月の変換: WeatherMonth 1-5 は 11, 12, 1, 2, 3 月
      const month =
        sd.WeatherMonth <= 2 ? sd.WeatherMonth + 10 : sd.WeatherMonth - 2;
      const year = sd.WeatherMonth <= 2 ? sd.WeatherYear : sd.WeatherYear + 1;

      const date = new Date(year, month - 1, sd.WeatherDay);
      if (Number.isNaN(date.getTime())) continue;

      try {
        await prisma.snowDepthRecord.create({
          data: {
            skiResortId: outline.UniqueName,
            date,
            depth: sd.SnowDepth,
          },
        });
      } catch {
        // 重複はスキップ
      }
    }
  }

  const count = await prisma.snowDepthRecord.count();
  console.log(`\n✅ Saved ${count} snow depth records to database`);
}

export { main as runCrawlSnowDepths };

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
