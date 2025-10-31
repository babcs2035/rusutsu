import fs from "node:fs";
import { tqdm } from "ts-tqdm";
import type { ReportDetails } from "@/interfaces/SnowFall";
import type { SnowFallsT } from "@/types/weathers";
import { fetchAsync } from "./fetch";

const reportList = await fetchAsync({
  url: "https://www.snowjapan.com/rest-api/dailyreport/latest/all",
  options: {
    method: "POST",
  },
});

const snowFalls: { [key: string]: SnowFallsT } = {};
for (const report of tqdm(reportList)) {
  const details = await fetchAsync({
    url: `https://www.snowjapan.com/rest-api/dailyreport/reports/${report.UniqueName}/All`,
    options: {
      method: "POST",
    },
  });

  const res: SnowFallsT = {} as SnowFallsT;
  res.firstYear = 9999;
  let lastYear = 0;
  details.forEach((data: ReportDetails) => {
    if (data.NowReportYear < res.firstYear) {
      res.firstYear = data.NowReportYear;
    }
    if (data.NowReportYear > lastYear) {
      lastYear = data.NowReportYear;
    }
  });

  res.data = [];
  for (let i = res.firstYear; i <= lastYear; ++i) {
    res.data.push([]);
    for (let j = 0; j < 12; ++j) {
      res.data[i - res.firstYear].push([]);
      for (let k = 0; k < 31; ++k) {
        res.data[i - res.firstYear][j].push(0);
      }
    }
  }

  details.forEach((data: ReportDetails) => {
    res.data[data.NowReportYear - res.firstYear][data.NowReportMonth - 1][
      data.NowReportDay - 1
    ] = data.NewSnowfallResortA || 0;
  });

  snowFalls[report.ResortAUniqueName] = res;
}
console.log(`\nFound ${Object.keys(snowFalls).length} snow falls`);
fs.writeFileSync("../data/SnowFalls.json", JSON.stringify(snowFalls, null, 0));
