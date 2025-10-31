import fs from "node:fs";
import { tqdm } from "ts-tqdm";
import type { SkiAreaT, SkiResortT } from "@/types";
import type { YukiMagiT } from "@/types/yukimagi";
import { fetchAsync } from "./fetch";

async function translateText(text: string) {
  const response = await fetchAsync({
    url: "https://script.google.com/macros/s/AKfycbzwAzhHVCCrXwEwE3m92cg7gsBU4gusr2TvAcPEl2pNzAZOSsexQEgAnCPmttG6i8SN1Q/exec",
    options: {
      method: "POST",
      body: JSON.stringify({ text: text }),
      headers: {
        "Content-Type": "application/json",
      },
    },
  });
  return response.text || "";
}

const skiAreas: SkiAreaT[] = JSON.parse(
  fs.readFileSync("../data/SkiAreas.json", "utf-8"),
);
const yukiMagi: YukiMagiT[] = JSON.parse(
  fs.readFileSync("../data/YukiMagi.json", "utf-8"),
);
const skiAreaNameDict = JSON.parse(
  fs.readFileSync("../data/SkiAreaNameDict.json", "utf-8"),
);
const surfSnowDict = JSON.parse(
  fs.readFileSync("../data/SurfSnowDict.json", "utf-8"),
);
const gelendes = JSON.parse(fs.readFileSync("../data/Gelendes.json", "utf-8"));

const skiResorts: SkiResortT[] = [];
for (const skiArea of tqdm(skiAreas)) {
  if (fs.existsSync(`../data/temp/skiResorts/${skiArea.id}.json`)) {
    skiResorts.push(
      JSON.parse(
        fs.readFileSync(`../data/temp/skiResorts/${skiArea.id}.json`, "utf-8"),
      ),
    );
    continue;
  }

  let res: SkiResortT = {} as SkiResortT;
  res = { ...skiArea };
  res.courses.images = [skiArea.courses.image];
  res.others.sources = [skiArea.source];
  // delete res.courses.images;
  // delete res.source;

  res.times.weekday.open = (await translateText(res.times.weekday.open))
    .replaceAll("～", "")
    .replaceAll(" ", "");
  res.times.weekday.close = await translateText(res.times.weekday.close);
  res.times.weekend.open = (await translateText(res.times.weekend.open))
    .replaceAll("～", "")
    .replaceAll(" ", "");
  res.times.weekend.close = await translateText(res.times.weekend.close);
  res.times.comment = await translateText(res.times.comment);
  for (let i = 0; i < res.tickets.length; ++i) {
    res.tickets[i].name = await translateText(res.tickets[i].name);
  }

  let yukiMagiData = yukiMagi.find(data => data.name === skiArea.name.ja);
  if (skiAreaNameDict[skiArea.name.ja]) {
    yukiMagiData = yukiMagi.find(
      data => data.name === skiAreaNameDict[skiArea.name.ja],
    );
  }
  if (yukiMagiData) {
    res.yukiMagi = {
      available: !!yukiMagiData,
      info: yukiMagiData?.info || null,
      notes: yukiMagiData?.notes || null,
    };
  }

  let gelende = gelendes.find(data => data.name === skiArea.name.ja);
  if (surfSnowDict[skiArea.name.ja]) {
    gelende = gelendes.find(
      data => data.name === surfSnowDict[skiArea.name.ja],
    );
  }
  if (gelende) {
    res.courses.type = gelende.details?.type;
    res.courses.angle = gelende.details?.angle;
    res.courses.details = gelende.courses?.data;
    res.lifts.capacity = gelende.details?.lift;
    res.lifts.details = gelende.lifts;
    if (gelende.courses?.img && !gelende.courses?.img.includes("no_image")) {
      res.courses.images.push(gelende.courses?.img);
      res.courses.images = res.courses.images.reverse();
    }
    res.outline = gelende.outline;
    res.others.sources.push(gelende.source);
  }

  fs.writeFileSync(
    `../data/temp/skiResorts/${skiArea.id}.json`,
    JSON.stringify(res, null, 0),
  );
  skiResorts.push(res);
}

fs.writeFileSync(
  "../data/SkiResorts.json",
  JSON.stringify(skiResorts, null, 0),
  "utf-8",
);
