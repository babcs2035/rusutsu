import fs from "node:fs";
import { tqdm } from "ts-tqdm";
import type { LatestReportT } from "@/types/latestReport";
import { fetchAsync } from "./fetch";

const reportList = await fetchAsync({
  url: "https://www.snowjapan.com/rest-api/dailyreport/nows/all",
  options: {
    method: "POST",
  },
});

const reports: LatestReportT[] = [];
for (const report of tqdm(reportList)) {
  const details = await fetchAsync({
    url: `https://www.snowjapan.com/rest-api/dailyreport/reports/latest/${report.UniqueName}`,
    options: {
      method: "POST",
    },
  });
  reports.push({
    id: details.ResortAUniqueName,
    datetime: details.CreatedAt,
    snowfall: details.NewSnowfallResortA,
    temperature: {
      base: Number(details.TemperatureBottom),
      top: Number(details.TemperatureTop),
    },
    overview: details.WeatherCondition,
    precipitation: details.PrecipitationCondition,
    wind: details.WindCondition,
    visibility: details.VisibilityCondition,
  });
}
console.log(`\nFound ${reports.length} reports`);
fs.writeFileSync(
  "../data/LatestReports.json",
  JSON.stringify(reports, null, 0),
);
