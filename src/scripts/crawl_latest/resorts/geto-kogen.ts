import fs from "node:fs";
import { chromium, type Locator } from "playwright";

function toHalfWidth(str: string): string {
  return str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, s =>
    String.fromCharCode(s.charCodeAt(0) - 0xfee0),
  );
}
async function trimElem(element: Locator): Promise<string> {
  return ((await element.allInnerTexts())[0] || "").trim();
}
async function trimAndToHalfWidth(element: Locator): Promise<string> {
  const text = await trimElem(element);
  return toHalfWidth(text);
}

interface WeatherData {
  time: string | null;
  weather: string | null;
  temperature: number | null;
  snowDepth: number | null;
  snowfall: number | null;
  condition: string | null;
  windSpeed: number | null;
}

const browser = await chromium.launch();
const context = await browser.newContext({
  locale: "ja-JP",
});
const page = await context.newPage();

await page.goto("https://www.getokogen.com/winter/");

const resortName = "geto-kogen"; // スキー場名
const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const [datePart, timePart] = now.split(" ");
const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
const [hour, minute, second] = timePart.split(":").map(s => s.padStart(2, "0"));
const formattedNow = `${year}_${month}${day}_${hour}${minute}${second}`;
console.log(formattedNow);

const comment = null; // コメント（適宜変更）

// 天気・積雪情報
const weather: Record<string, WeatherData> = {};
weather.山頂 = {
  time: await trimAndToHalfWidth(page.locator("#weather_01")),
  weather: null,
  temperature: null,
  snowDepth: parseFloat(
    (await trimAndToHalfWidth(page.locator("#weather_05"))).replace("cm", ""),
  ),
  snowfall: null,
  condition: null,
  windSpeed: null,
};

weather.山麓 = {
  time: await trimAndToHalfWidth(page.locator("#weather_01")),
  weather: await trimAndToHalfWidth(page.locator("#weather_02")),
  temperature: parseFloat(
    (await trimAndToHalfWidth(page.locator("#weather_03"))).replace("℃", ""),
  ),
  snowDepth: parseFloat(
    (await trimAndToHalfWidth(page.locator("#weather_06"))).replace("cm", ""),
  ),
  snowfall: parseFloat(
    (await trimAndToHalfWidth(page.locator("#weather_10"))).replace("cm", ""),
  ),
  condition: await trimAndToHalfWidth(page.locator("#weather_07")),
  windSpeed: parseFloat(
    (await trimAndToHalfWidth(page.locator("#weather_04")))
      .replace("m/s", "")
      .replace("平均", ""),
  ),
};

for (const point of Object.keys(weather)) {
  const pointWeather = weather[point];
  if (pointWeather?.time == null || pointWeather?.time === "") {
    console.warn(`⚠️ [${resortName} (${point})] Time is incorrect`);
  }
  if (pointWeather?.weather == null || pointWeather?.weather === "") {
    console.warn(`⚠️ [${resortName} (${point})] Weather is incorrect`);
  }
  if (
    pointWeather?.temperature == null ||
    Number.isNaN(pointWeather?.temperature)
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Temperature is incorrect`);
  } else if (
    pointWeather?.temperature > 45.0 ||
    pointWeather?.temperature < -45.0
  ) {
    console.warn(
      `⚠️ [${resortName} (${point})] Temperature is ${pointWeather?.temperature}°C. Too high or too low !`,
    );
  }
  if (
    pointWeather?.snowDepth == null ||
    Number.isNaN(pointWeather?.snowDepth)
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Snow Depth is incorrect`);
  }
  if (pointWeather?.snowfall == null || Number.isNaN(pointWeather?.snowfall)) {
    console.warn(`⚠️ [${resortName} (${point})] Snowfall is incorrect`);
  } else if (pointWeather?.snowfall > 130.0 || pointWeather?.snowfall < -0.1) {
    console.warn(
      `⚠️ [${resortName} (${point})] Snowfall is ${pointWeather?.snowfall}cm. Impossible!`,
    );
  }
  if (pointWeather?.condition == null || pointWeather?.condition === "") {
    console.warn(`⚠️ [${resortName} (${point})] Condition is incorrect`);
  }
  if (
    pointWeather?.windSpeed == null ||
    Number.isNaN(pointWeather?.windSpeed)
  ) {
    console.warn(`⚠️ [${resortName} (${point})] Wind Speed is incorrect`);
  }
}

// コース・リフト情報

// 1619069114 : A1
// 1619241875 : A2
// 1619241893 : A3
// 1619241919 : A4
// 1619148933 : A5
// 1618995431 : 第1ペア
// 1619225180 : 第2ペア
// 1619228965 : 第1ゴンドラ
// 1619232636 : 第2ゴンドラ
// 1619240207 : クワッド
// 1619242640 : カスケード
// 1619242621 : エクストリーム
// 1619242593 : ラビット
// 1619242547 : ストリーム
// 1618995385 : ビーチ
// 1619242523 : サミット
// 1619068782 : ハート
// 1619242475 : シューター 1
// 1619242456 : シューター 2
// 1618995400 : シューター3
// 1619242387 : シューター4
// 1619063214 : アルタ
// 1619242338 : ルーキー1
// 1724636347 : ルーキー2
// 1724636383 : ガーデン
// 1619242289 : C5
// 1619243939 : C4
// 1619242277 : C4下部
// 1618995355 : C3
// 1639534103 : C2上部
// 1619242231 : C2
// 1639534174 : C2迂回
// 1619242211 : C1
// 1639534249 : B3上部
// 1619242193 : B3下部
// 1618995343 : B2
// 1619242156 : B1
// 1619242043 : A6下部
// 1619242008 : A6中部
// 1619241961 : A6上部

const STATUS_MAP_COURSE: Record<"4_0" | "5_0" | "6_0" | "default", string> = {
  "4_0": "非圧雪",
  "5_0": "クローズ",
  "6_0": "準備中",
  default: "圧雪",
} as const;

const STATUS_MAP_LIFT: Record<"4_0" | "5_0" | "6_0" | "default", string> = {
  "4_0": "運行中",
  "5_0": "一次見合わせ中",
  "6_0": "準備中",
  default: "運休・終了",
} as const;

const STATUS_MAP_TREERUN: Record<"4_0" | "5_0" | "6_0", string> = {
  "4_0": "非圧雪",
  "5_0": "クローズ",
  "6_0": "準備中",
  // default なし → 存在しない場合スキップ
} as const;

const COURSE_ID_NAME_MAP = {
  "1619069114": "A1",
  "1619241875": "A2",
  "1619241893": "A3",
  "1619241919": "A4",
  "1619148933": "A5",
  "1619242289": "C5",
  "1619243939": "C4上部",
  "1619242277": "C4下部",
  "1618995355": "C3",
  "1639534103": "C2上部",
  "1619242231": "C2下部",
  "1639534174": "C1上部",
  "1619242211": "C1下部",
  "1639534249": "B3上部",
  "1619242193": "B3下部",
  "1618995343": "B2",
  "1619242156": "B1",
  "1619242043": "A6下部",
  "1619242008": "A6中部",
  "1619241961": "A6上部",
} as const;

const LIFT_ID_NAME_MAP = {
  "1618995431": "第1ペア",
  "1619225180": "第2ペア",
  "1619228965": "第1ゴンドラ",
  "1619232636": "第2ゴンドラ",
  "1619240207": "クワッド",
} as const;

const TREERUN_ID_NAME_MAP = {
  "1619242640": "カスケード",
  "1619242621": "エクストリーム",
  "1619242593": "ラビット",
  "1619242547": "ストリーム",
  "1618995385": "ビーチ",
  "1619242523": "サミット",
  "1619068782": "ハート",
  "1619242475": "シューター1",
  "1619242456": "シューター2",
  "1618995400": "シューター3",
  "1619242387": "シューター4",
  "1619063214": "アルタ",
  "1619242338": "ルーキー1",
  "1724636347": "ルーキー2",
  "1724636383": "ガーデン",
} as const;

function getMap<T extends Record<string, string>>(
  code: string,
  map: T,
): T[keyof T] | null {
  return code in map ? map[code as keyof T] : null;
}

// スキー場のURL
await page.goto("https://www.getokogen.com/winter/01trail/operation.cgi");
// HTMLに存在する画像一覧を取得
const seen: { [id: string]: string } = {};
const images = await page.locator("div.course_wrapper img").all();

for (const img of images) {
  const src = await img.getAttribute("src");
  if (!src) continue;

  const match = src.match(/(\d+)(?:_(\d+_\d+))?\.png|\.gif/);
  if (!match) continue;

  const id = match[1];
  const code = match[2] || "default";
  seen[id] = code;
}

// コース情報
const courses = [];

for (const id in COURSE_ID_NAME_MAP) {
  const name = getMap(id, COURSE_ID_NAME_MAP);
  const code = seen[id] || "default";
  const status = getMap(code, STATUS_MAP_COURSE);

  if (status == null || status === "") {
    console.warn(`⚠️ [${resortName} ${name} Course] Status is incorrect`);
  } else if (
    status !== "圧雪" &&
    status !== "非圧雪" &&
    status !== "クローズ" &&
    status !== "準備中"
  ) {
    console.warn(
      `⚠️ [${resortName} ${name} Course] Status (${status}) is incorrect format`,
    );
  }

  courses.push({
    name: name,
    status: status,
    time: null,
    note: null,
  });
}

// リフト情報
const lifts = [];

for (const id in LIFT_ID_NAME_MAP) {
  const name = getMap(id, LIFT_ID_NAME_MAP);
  const code = seen[id] || "default";
  const status = getMap(code, STATUS_MAP_LIFT);

  if (status == null || status === "") {
    console.warn(`⚠️ [${resortName} ${name} Lift] Status is incorrect`);
  } else if (
    status !== "運行中" &&
    status !== "一次見合わせ中" &&
    status !== "準備中" &&
    status !== "運休・終了"
  ) {
    console.warn(
      `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
    );
  }

  lifts.push({
    name: name,
    status: status,
    note: null,
  });
}

// ツリーラン情報
const treeruns = [];
for (const id in TREERUN_ID_NAME_MAP) {
  const name = getMap(id, TREERUN_ID_NAME_MAP);
  const code = seen[id] || "default";
  if (code === "default") {
    console.log(`⚠️ [${resortName} ${name} Treerun] ID ${id} not found in seen`);
    continue;
  }
  const status = getMap(code, STATUS_MAP_TREERUN);

  if (status == null || status === "") {
    console.warn(`⚠️ [${resortName} ${name} Treerun] Status is incorrect`);
  } else if (
    status !== "非圧雪" &&
    status !== "クローズ" &&
    status !== "準備中"
  ) {
    console.warn(
      `⚠️ [${resortName} ${name} Treerun] Status (${status}) is incorrect format`,
    );
  }

  treeruns.push({
    name: name,
    status: status,
    time: null,
    note: null,
  });
}

const courseNum = 5;
const liftNum = 5;
const treerunNum = 15;
if (courses.length === 0) {
  console.warn(`⚠️ [${resortName}] No course data found`);
} else if (courses.length !== courseNum) {
  console.warn(
    `⚠️ [${resortName}] Course count is ${courses.length}. Expected ${courseNum}.`,
  );
}
if (lifts.length === 0) {
  console.warn(`⚠️ [${resortName}] No lift data found`);
} else if (lifts.length !== liftNum) {
  console.warn(
    `⚠️ [${resortName}] Lift count is ${lifts.length}. Expected ${liftNum}.`,
  );
}
if (treeruns.length === 0) {
  console.warn(`⚠️ [${resortName}] No treerun data found`);
} else if (treeruns.length !== treerunNum) {
  console.warn(
    `⚠️ [${resortName}] Treerun count is ${treeruns.length}. Expected ${treerunNum}.`,
  );
}

const result = {
  resortName,
  time: now,
  comment,
  weather,
  courses,
  lifts,
};

fs.writeFileSync(
  `../../data/resorts-temporary/latest_data/${resortName}/${formattedNow}.json`,
  JSON.stringify(result, null, 2),
);
console.log(
  `✅ Saved: ../../data/resorts_cousce_lift/latest_data/${resortName}/${formattedNow}.json`,
);

await browser.close();
