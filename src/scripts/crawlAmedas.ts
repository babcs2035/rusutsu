import fs from "node:fs";
import { fetchAsync } from "./fetch";

const targetTimes = await fetchAsync({
  url: "https://www.jma.go.jp/bosai/jmatile/data/snow/targetTimes.json",
  options: {
    method: "GET",
  },
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
const forecasts: {
  [key: string]: { code: number; location: number[]; value: number }[];
} = {};
for (const id of ids) {
  const forecast = await fetchAsync({
    url: `https://www.jma.go.jp/bosai/jmatile/data/snow/${targetTimes[0].basetime}/none/${targetTimes[0]["b.etime"]}urf/${id}/data.geojson?id=${id}`,
    options: {
      method: "GET",
    },
  });
  const elems = [];
  for (const elem of forecast.features) {
    elems.push({
      code: Number(elem.properties.code),
      location: elem.geometry.coordinates,
      value: Number(elem.properties[id.substring(5)]),
    });
  }
  forecasts[id] = elems;
}

fs.writeFileSync("../data/Amedas.json", JSON.stringify(forecasts, null, 0));
