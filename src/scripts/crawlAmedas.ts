import { disconnectPrisma, prisma } from "@/lib/prisma";
import { fetchAsync } from "./fetch";

interface AmedasFeature {
  properties: {
    code: string;
    snowd?: number;
    snowf03h?: number;
    snowf06h?: number;
    snowf12h?: number;
    snowf24h?: number;
    snowf48h?: number;
    snowf72h?: number;
    [key: string]: unknown;
  };
  geometry: {
    coordinates: [number, number];
  };
}
interface JmaTargetTime {
  basetime: string;
  validtime: string;
  elements: string[];
}

async function main() {
  console.log("🌡️ Crawling Amedas data...");

  const targetTimes = await fetchAsync<JmaTargetTime[]>({
    url: "https://www.jma.go.jp/bosai/jmatile/data/snow/targetTimes.json",
    options: { method: "GET" },
  });

  const ids = [
    "amds_snowd",
    "amds_snowf03h",
    "amds_snowf06h",
    "amds_snowf12h",
    "amds_snowf24h",
    "amds_snowf48h",
    "amds_snowf72h",
  ];

  // 既存データを削除
  await prisma.amedasData.deleteMany();

  const now = new Date();

  for (const id of ids) {
    // Find the latest target time that supports this element ID
    const target = targetTimes.find((t: JmaTargetTime) =>
      t.elements?.includes(id),
    );
    if (!target) {
      console.warn(`⚠️ Target time not found for ${id}`);
      continue;
    }

    const forecast = await fetchAsync<{ features: AmedasFeature[] }>({
      url: `https://www.jma.go.jp/bosai/jmatile/data/snow/${target.basetime}/none/${target.validtime}/surf/${id}/data.geojson`,
      options: { method: "GET" },
    });

    for (const elem of forecast.features as AmedasFeature[]) {
      const valueKey = id.substring(5);
      const value = elem.properties[valueKey];
      if (value === undefined || value === null) continue;

      await prisma.amedasData.create({
        data: {
          code: Number(elem.properties.code),
          latitude: elem.geometry.coordinates[1],
          longitude: elem.geometry.coordinates[0],
          type: id,
          value: Number(value),
          fetchedAt: now,
        },
      });
    }
  }

  const count = await prisma.amedasData.count();
  console.log(`✅ Saved ${count} Amedas data points to database`);
}

export { main as runCrawlAmedas };

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
