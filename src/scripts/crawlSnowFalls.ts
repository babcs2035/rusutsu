import { tqdm } from "ts-tqdm";
import { disconnectPrisma, prisma } from "@/lib/prisma";
import { fetchAsync } from "./fetch";

interface ReportListItem {
  UniqueName: string;
  ResortAUniqueName: string;
}

interface ReportDetails {
  NowReportYear: number;
  NowReportMonth: number;
  NowReportDay: number;
  NewSnowfallResortA: number | null;
}

async function main() {
  console.log("❄️ Crawling snow falls...");

  const reportList: ReportListItem[] = await fetchAsync({
    url: "https://www.snowjapan.com/rest-api/dailyreport/latest/all",
    options: { method: "POST" },
  });

  console.log(`📦 Found ${reportList.length} reports to crawl`);

  for (const report of tqdm(reportList)) {
    // スキー場が DB に存在するか確認
    const resort = await prisma.skiResort.findUnique({
      where: { id: report.ResortAUniqueName },
    });
    if (!resort) continue;

    const details: ReportDetails[] = await fetchAsync({
      url: `https://www.snowjapan.com/rest-api/dailyreport/reports/${report.UniqueName}/All`,
      options: { method: "POST" },
    });

    // 既存のレコードを削除
    await prisma.snowFallRecord.deleteMany({
      where: { skiResortId: report.ResortAUniqueName },
    });

    // 新規レコードを作成
    for (const data of details) {
      if (!data.NewSnowfallResortA || data.NewSnowfallResortA === 0) continue;

      const date = new Date(
        data.NowReportYear,
        data.NowReportMonth - 1,
        data.NowReportDay,
      );
      if (Number.isNaN(date.getTime())) continue;

      try {
        await prisma.snowFallRecord.create({
          data: {
            skiResortId: report.ResortAUniqueName,
            date,
            snowfall: data.NewSnowfallResortA,
          },
        });
      } catch {
        // 重複はスキップ
      }
    }
  }

  const count = await prisma.snowFallRecord.count();
  console.log(`\n✅ Saved ${count} snow fall records to database`);
}

export { main as runCrawlSnowFalls };

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
