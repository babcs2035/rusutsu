import { tqdm } from "ts-tqdm";
import { disconnectPrisma, prisma } from "@/lib/prisma";
import { fetchAsync } from "./fetch";

interface ReportListItem {
  UniqueName: string;
}

interface ReportDetails {
  ResortAUniqueName: string;
  CreatedAt: string;
  NewSnowfallResortA: number | null;
  TemperatureBottom: string | null;
  TemperatureTop: string | null;
  WeatherCondition: string | null;
  PrecipitationCondition: string | null;
  WindCondition: string | null;
  VisibilityCondition: string | null;
}

async function main() {
  console.log("📋 Crawling latest reports...");

  const reportList: ReportListItem[] = await fetchAsync({
    url: "https://www.snowjapan.com/rest-api/dailyreport/nows/all",
    options: { method: "POST" },
  });

  console.log(`📦 Found ${reportList.length} reports to crawl`);

  for (const report of tqdm(reportList)) {
    try {
      const details: ReportDetails = await fetchAsync({
        url: `https://www.snowjapan.com/rest-api/dailyreport/reports/latest/${report.UniqueName}`,
        options: { method: "POST" },
      });

      // スキー場が存在するか確認
      const resort = await prisma.skiResort.findUnique({
        where: { id: details.ResortAUniqueName },
      });
      if (!resort) continue;

      const datetime = new Date(details.CreatedAt);
      if (Number.isNaN(datetime.getTime())) continue;

      await prisma.latestReport.upsert({
        where: { skiResortId: details.ResortAUniqueName },
        update: {
          datetime,
          snowfall: details.NewSnowfallResortA,
          tempBase: details.TemperatureBottom
            ? Number(details.TemperatureBottom)
            : null,
          tempTop: details.TemperatureTop
            ? Number(details.TemperatureTop)
            : null,
          overview: details.WeatherCondition,
          precipitation: details.PrecipitationCondition,
          wind: details.WindCondition,
          visibility: details.VisibilityCondition,
        },
        create: {
          skiResortId: details.ResortAUniqueName,
          datetime,
          snowfall: details.NewSnowfallResortA,
          tempBase: details.TemperatureBottom
            ? Number(details.TemperatureBottom)
            : null,
          tempTop: details.TemperatureTop
            ? Number(details.TemperatureTop)
            : null,
          overview: details.WeatherCondition,
          precipitation: details.PrecipitationCondition,
          wind: details.WindCondition,
          visibility: details.VisibilityCondition,
        },
      });
    } catch {
      // エラーはスキップ
    }
  }

  const count = await prisma.latestReport.count();
  console.log(`\n✅ Saved ${count} latest reports to database`);
}

export { main as runCrawlLatestReports };

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
