import fs from "node:fs";
import { tqdm } from "ts-tqdm";
import type { SkiAreaI } from "@/interfaces/SkiArea";
import type { SnowDepthsI } from "@/interfaces/SnowDepth";
import type { SnowDepthsT } from "@/types/weathers";
import { fetchAsync } from "./fetch";

const outlines = await fetchAsync({
  url: "https://www.snowjapan.com/rest-api/skiarea/list/All",
  options: {
    method: "POST",
  },
});

const skiAreaSnowDepths: { [key: string]: SnowDepthsT } = {};
for (const outline of tqdm(outlines)) {
  const details: SkiAreaI = await fetchAsync({
    url: `https://www.snowjapan.com/rest-api/skiarea/${outline.UniqueName}`,
    options: {
      method: "POST",
    },
  });
  const snowDepths: SnowDepthsI[] = await fetchAsync({
    url: `https://www.snowjapan.com/rest-api/skiarea/snowfall/${details.Id}`,
    options: {
      method: "POST",
    },
  });

  const res: SnowDepthsT = {} as SnowDepthsT;
  res.firstYear = 9999;
  let lastYear = 0;
  snowDepths.forEach(snowDepth => {
    if (snowDepth.WeatherYear < res.firstYear) {
      res.firstYear = snowDepth.WeatherYear;
    }
    if (snowDepth.WeatherYear > lastYear) {
      lastYear = snowDepth.WeatherYear;
    }
  });

  res.data = [];
  for (let i = res.firstYear; i <= lastYear; i++) {
    res.data.push([]);
    for (let j = 0; j < 5; ++j) {
      res.data[i - res.firstYear].push([]);
      for (let k = 0; k < 31; ++k) {
        res.data[i - res.firstYear][j].push(0);
      }
    }
  }
  snowDepths.forEach(snowDepth => {
    res.data[snowDepth.WeatherYear - res.firstYear][
      Math.min(snowDepth.WeatherMonth - 1, 4)
    ][snowDepth.WeatherDay - 1] =
      snowDepth.SnowDepth === 999 ? 0 : snowDepth.SnowDepth;
  });

  skiAreaSnowDepths[outline.UniqueName] = res;
}
console.log(`\nFound ${Object.keys(skiAreaSnowDepths).length} snow depths`);
fs.writeFileSync(
  "../data/SnowDepths.json",
  JSON.stringify(skiAreaSnowDepths, null, 0),
);
