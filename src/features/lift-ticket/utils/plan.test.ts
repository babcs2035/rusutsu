import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type {
  LiftTicketData,
  TicketDayDuration,
  TicketPartyGroup,
} from "../types";
import { calculateLiftTicketPlan, nextDateOf } from "./calculateLiftTicket";

/** 1日券・ナイター付き1日券・連続2日券が揃った検証データ */
const MULTI = path.join(
  process.cwd(),
  ".shared/skills/collect-ski-lift-ticket-pricing/tests/fixtures/valid/daypass-test-2025-2026.json",
);
/** 1日券もナイター券も無いスキー場（最長9時間券） */
const NO_DAY_PASS = path.join(
  process.cwd(),
  "src/private/data/lift-ticket/megahira-onsen-megahira/2025-2026.json",
);

const load = (file: string) =>
  JSON.parse(fs.readFileSync(file, "utf8")) as LiftTicketData;

const PARTY: TicketPartyGroup[] = [
  { id: "a", category: "adult", age: 30, count: 1 },
];

/** 25時間券（日をまたいで使う時間券）を外す。連続N日券の比較だけを見たいとき用 */
const withoutHoursPool = (data: LiftTicketData): LiftTicketData => ({
  ...data,
  products: data.products.filter(
    product => product.validity?.mode !== "hours_pool",
  ),
});

const plan = (
  file: string,
  days: Array<[string, TicketDayDuration]>,
  transform: (data: LiftTicketData) => LiftTicketData = data => data,
) =>
  calculateLiftTicketPlan(transform(load(file)), {
    visitDate: days[0][0],
    usePreference: "full_day",
    party: PARTY,
    days: days.map(([date, duration], index) => ({
      id: `day-${index + 1}`,
      date,
      duration,
    })),
  });

const DAY: TicketDayDuration = { kind: "day", withNight: false };
const DAY_NIGHT: TicketDayDuration = { kind: "day", withNight: true };

test("日を追加すると既定は翌日", () => {
  assert.equal(nextDateOf("2026-01-31"), "2026-02-01");
  assert.equal(nextDateOf("2026-02-28"), "2026-03-01");
  assert.equal(nextDateOf(""), "");
});

test("連続した2日なら連続2日券と1日券×2を比べて安いほうを採用する", () => {
  const result = plan(
    MULTI,
    [
      ["2026-01-14", DAY],
      ["2026-01-15", DAY],
    ],
    withoutHoursPool,
  );
  assert.equal(result.perDayTotal, 12000, "1日券×2の合計");
  assert.equal(result.multiDay?.days, 2);
  assert.equal(result.multiDay?.total, 11000);
  assert.equal(result.total, 11000, "安い連続2日券が採用されていない");
});

test("日付が飛んでいると連続2日券は使えない", () => {
  // 連続2日券は連続した日にしか使えない。1日券×2にする
  const result = plan(
    MULTI,
    [
      ["2026-01-14", DAY],
      ["2026-01-17", DAY],
    ],
    withoutHoursPool,
  );
  assert.equal(result.multiDay, null);
  assert.equal(result.total, 12000);
});

test("1日（ナイター無）×2日は、営業時間の合計が25時間以内なら25時間券でまかなう", () => {
  // 営業 8:30〜16:30（8時間）×2日 = 16時間。25時間券（5,000円）1枚で足りる
  const result = plan(MULTI, [
    ["2026-01-14", DAY],
    ["2026-01-17", DAY],
  ]);
  assert.equal(result.multiDay?.kind, "hours_pool");
  assert.equal(result.multiDay?.requiredHours, 16);
  assert.equal(result.total, 5000);
});

test("複数日券が無いスキー場では1日券×日数になる", () => {
  const result = plan(NO_DAY_PASS, [
    ["2026-02-25", DAY],
    ["2026-02-28", DAY],
  ]);
  assert.equal(result.multiDay, null);
  assert.equal(result.total, 6300 + 6800);
});

test("日ごとに滑る長さを変えられる", () => {
  const result = plan(NO_DAY_PASS, [
    ["2026-02-25", DAY],
    ["2026-02-27", { kind: "hours", hours: 3 }],
  ]);
  assert.equal(result.days[0].result.productName, "リフト9時間券");
  assert.equal(result.days[1].result.productName, "リフト3時間券");
  assert.equal(result.total, 6300 + 4900);
});

test("ナイター込みは営業日ならナイター付き1日券を出す", () => {
  const onNight = plan(MULTI, [["2026-01-31", DAY_NIGHT]]);
  assert.equal(onNight.days[0].result.productName, "1日券（ナイター付）");
  assert.equal(onNight.total, 7000);
});

test("ナイター込みでもナイター営業が無い日は1日（ナイター無）と同じ結果を出し、その旨を明示する", () => {
  // ★1/14はナイター営業日ではない。黙って1日券の料金だけ出すと
  // 「営業していないのか単に安いのか」利用者が区別できないので、理由を明示する
  const offNight = plan(MULTI, [["2026-01-14", DAY_NIGHT]]);
  assert.equal(offNight.days[0].result.productName, "1日券");
  assert.equal(offNight.total, 6000);
  assert.match(
    offNight.days[0].result.notes[0] ?? "",
    /ナイター営業がありません/,
  );
});

test("定休日を含む日程は合計を出さない", () => {
  // 営業していない日に料金を出すと誤案内になる
  const result = plan(NO_DAY_PASS, [
    ["2026-01-27", DAY], // 火曜（定休日）
    ["2026-01-28", DAY],
  ]);
  assert.equal(result.days[0].result.status, "closed");
  assert.equal(result.total, null);
});

test("出典は日をまたいで重複を除いて番号順に並べる", () => {
  const result = plan(NO_DAY_PASS, [
    ["2026-02-25", DAY],
    ["2026-02-27", DAY],
  ]);
  const numbers = result.references.map(reference => reference.number);
  assert.deepEqual(
    numbers,
    [...new Set(numbers)].sort((a, b) => a - b),
  );
  assert.ok(numbers.length > 0);
});

/** 25時間券（日をまたいで1時間単位で使う）とWeb料金（12/19販売開始）があるスキー場 */
const RUSUTSU = path.join(
  process.cwd(),
  "src/private/data/lift-ticket/rusutsu-resort/2026-2027.json",
);

const rusutsuPlan = (dates: string[], hours: number, today: string) =>
  calculateLiftTicketPlan(load(RUSUTSU), {
    visitDate: dates[0],
    usePreference: "full_day",
    party: PARTY,
    today,
    days: dates.map((date, index) => ({
      id: `day-${index + 1}`,
      date,
      duration: { kind: "hours", hours },
    })),
  });

test("販売開始前のWeb券も、利用日までに販売が始まるなら料金に使う", () => {
  // Web販売は12/19開始。9月に照会しても12/24の分は12/19以降に買える
  const result = rusutsuPlan(["2026-12-24"], 5, "2026-09-25");
  assert.equal(result.total, 11600, "Web料金の5時間券が選ばれていない");
});

test("利用日より後に販売が始まるWeb券は使わない", () => {
  // 初滑りシーズン（12/5）はWeb販売開始（12/19）より前。5時間券も無いので
  // 窓口の1日券（初滑りシーズン①）になる
  const result = rusutsuPlan(["2026-12-05"], 5, "2026-09-25");
  assert.equal(result.multiDay, null);
  assert.equal(result.total, 7900);
  assert.ok(
    !result.days[0].result.lines.some(line =>
      line.offerName?.includes("オンライン"),
    ),
    "販売開始前のWeb料金を使っている",
  );
});

test("5時間×4日なら25時間券1枚で全日をまかなう", () => {
  const result = rusutsuPlan(
    ["2026-12-24", "2027-01-10", "2027-01-11", "2027-01-12"],
    5,
    "2026-09-25",
  );
  assert.equal(result.perDayTotal, 11600 * 4, "1日ずつ買うとWeb5時間券×4");
  assert.equal(result.multiDay?.kind, "hours_pool");
  assert.equal(result.multiDay?.ticketCount, 1);
  assert.equal(result.multiDay?.requiredHours, 20);
  assert.equal(result.total, 36000, "Web25時間券1枚が採用されていない");
});

test("時間の合計が25時間を超えるなら、足りない時間はトップアップ5時間で足す", () => {
  // 7時間×5日 = 35時間 → Web25時間券2枚 72,000円 や Web1日券×5 66,000円より、
  // Web25時間券1枚 36,000円 ＋ トップアップ5時間×2（レギュラー 7,300円）のほうが安い
  const result = rusutsuPlan(
    ["2027-01-10", "2027-01-11", "2027-01-12", "2027-01-13", "2027-01-14"],
    7,
    "2026-09-25",
  );
  assert.equal(result.perDayTotal, 13200 * 5);
  assert.equal(result.multiDay?.kind, "hours_pool");
  assert.equal(result.multiDay?.ticketCount, 1);
  assert.deepEqual(
    result.multiDay?.addOns.map(addOn => [addOn.date, addOn.ticketCount]),
    [["2027-01-10", 2]],
    "同じ料金ならトップアップは初日にまとめて買う",
  );
  assert.equal(result.total, 36000 + 7300 * 2);
});

test("トップアップ5時間は、それが要る日までの利用日のうち安い日の料金で買う", () => {
  // 8+8+8+6 = 30時間。25時間は3/17の1時間目で尽きるので、トップアップは
  // 3/17（春スキー 5,800円）に買える。1日券ずつ（50,100円）より安い
  const result = calculateLiftTicketPlan(load(RUSUTSU), {
    visitDate: "2027-03-08",
    usePreference: "full_day",
    party: PARTY,
    today: "2026-09-25",
    days: [
      ["2027-03-08", 8],
      ["2027-03-09", 8],
      ["2027-03-10", 8],
      ["2027-03-17", 6],
    ].map(([date, hours], index) => ({
      id: `day-${index + 1}`,
      date: String(date),
      duration: { kind: "hours", hours: Number(hours) },
    })),
  });
  assert.equal(result.perDayTotal, 13200 * 3 + 10500);
  assert.equal(result.multiDay?.productId, "prod-25hour");
  assert.equal(result.multiDay?.ticketCount, 1);
  assert.equal(result.multiDay?.requiredHours, 30);
  assert.deepEqual(
    result.multiDay?.addOns.map(addOn => [
      addOn.productId,
      addOn.date,
      addOn.ticketCount,
      addOn.total,
    ]),
    [["prod-topup5", "2027-03-17", 1, 5800]],
  );
  assert.equal(result.total, 36000 + 5800);
});

test("トップアップ5時間は単独では選ばない（25時間券を買った人だけの券）", () => {
  const result = rusutsuPlan(["2027-01-10"], 5, "2026-09-25");
  assert.ok(
    !result.days[0].result.lines.some(line =>
      line.offerName?.includes("トップアップ"),
    ),
  );
});

test("時間の合計が25時間を超え、25時間券のほうが安ければ枚数分買う", () => {
  // 6時間×9日 = 54時間 → Web25時間券2枚＋トップアップ5時間1枚 79,300円。
  // 5時間券では足りないので1日ずつならWeb1日券×9 = 118,800円
  const result = rusutsuPlan(
    [
      "2027-01-10",
      "2027-01-11",
      "2027-01-12",
      "2027-01-13",
      "2027-01-14",
      "2027-01-15",
      "2027-01-16",
      "2027-01-17",
      "2027-01-18",
    ],
    6,
    "2026-09-25",
  );
  assert.equal(result.multiDay?.kind, "hours_pool");
  assert.equal(result.multiDay?.ticketCount, 2);
  assert.equal(result.multiDay?.addOns[0]?.ticketCount, 1);
  assert.equal(result.total, 36000 * 2 + 7300);
});

test("営業時間が未掲載でも、時間指定なら1日券を選び、営業時間の注意は出さない", () => {
  // 初滑りシーズン②（12/16）は5時間券が無く、1日券10,500円と25時間券だけ。
  // 営業時間が未掲載でも4時間なら1日券で足りる（25時間券39,000円にしない）。
  // 営業時間の話は料金の内訳に要らない（公式ページで見てもらう）
  const result = rusutsuPlan(["2026-12-16"], 4, "2026-09-25");
  assert.equal(result.multiDay, null);
  assert.equal(result.total, 10500);
  assert.ok(
    !result.days[0].result.lines[0].warnings?.some(warning =>
      warning.includes("営業時間"),
    ),
  );
});

/** 基準区分の名前が「大人」ではなく「一般」のスキー場 */
const SAPPORO = path.join(
  process.cwd(),
  "src/private/data/lift-ticket/sapporo-kokusai/2026-2027.json",
);

const sapporoDay = (group: Omit<TicketPartyGroup, "id" | "count">) =>
  calculateLiftTicketPlan(load(SAPPORO), {
    visitDate: "2027-01-15",
    usePreference: "full_day",
    party: [{ id: "a", count: 1, ...group }],
    today: "2026-09-25",
    days: [{ id: "day-1", date: "2027-01-15", duration: DAY }],
  });

test("どの区分にも当てはまらない人は、名前が「一般」の基準区分の料金になる", () => {
  // 一般1日券 7,000円 / WEB 6,700円
  for (const group of [
    { category: "adult", age: null },
    { category: "adult", age: 30 },
    { category: "university", age: 20 },
    { category: "other", age: 30 },
  ] as const) {
    assert.equal(
      sapporoDay(group).total,
      6700,
      `${group.category} ${group.age} に一般料金が出ていない`,
    );
  }
});

test("年齢で当てはまる区分があれば、基準区分には回さない", () => {
  // 62歳はシニア（60歳以上）、中高生は中高生の料金
  assert.equal(sapporoDay({ category: "adult", age: 62 }).total, 5700);
  assert.equal(sapporoDay({ category: "high_school", age: null }).total, 3700);
});

test("基準区分の年齢範囲外の人には基準区分の料金を当てはめない", () => {
  // ルスツの大人は19〜64歳。70歳はシニア料金（窓口12,500円 / Web 9,800円）
  const data = load(RUSUTSU);
  const result = calculateLiftTicketPlan(data, {
    visitDate: "2027-01-15",
    usePreference: "full_day",
    party: [{ id: "a", category: "other", age: 70, count: 1 }],
    today: "2026-09-25",
    days: [{ id: "day-1", date: "2027-01-15", duration: DAY }],
  });
  assert.equal(result.total, 9800);
});

test("ルスツの1日券はナイターも滑れるので、ナイター込みでもナイター券を足さない", () => {
  const result = calculateLiftTicketPlan(load(RUSUTSU), {
    visitDate: "2027-03-08",
    usePreference: "full_day",
    party: PARTY,
    today: "2026-09-25",
    days: [
      {
        id: "day-1",
        date: "2027-03-08",
        duration: { kind: "day", withNight: true },
      },
    ],
  });
  assert.equal(result.total, 13200, "Web1日券だけで足りる");
  assert.ok(
    !result.days[0].result.lines.some(line =>
      line.offerName?.includes("ナイター券"),
    ),
    "ナイター券を足している",
  );
});

test("年齢未入力の小学生に、年齢だけで決まる小人料金を当てる", () => {
  // ルスツの小人は「4〜12歳」で学校区分を持たない。当てないと大人料金になる
  const result = calculateLiftTicketPlan(load(RUSUTSU), {
    visitDate: "2027-01-27",
    usePreference: "full_day",
    party: [{ id: "c", category: "elementary", age: null, count: 1 }],
    today: "2026-09-26",
    days: [
      {
        id: "day-1",
        date: "2027-01-27",
        duration: { kind: "hours", hours: 5 },
      },
    ],
  });
  assert.equal(result.total, 4700);
});

test("営業時間が不明な「1日」の日は1日券にし、残りの日を25時間券でまかなう", () => {
  // 1日＋ナイター（時間不明）→1日券13,200円、5+10+6=21時間→25時間券36,000円。
  // 全日を1日ずつ買うより安い
  const result = calculateLiftTicketPlan(load(RUSUTSU), {
    visitDate: "2027-01-26",
    usePreference: "full_day",
    party: PARTY,
    today: "2026-09-26",
    days: [
      {
        id: "1",
        date: "2027-01-26",
        duration: { kind: "day", withNight: true },
      },
      { id: "2", date: "2027-01-27", duration: { kind: "hours", hours: 5 } },
      { id: "3", date: "2027-01-28", duration: { kind: "hours", hours: 10 } },
      { id: "4", date: "2027-01-29", duration: { kind: "hours", hours: 6 } },
    ],
  });
  assert.equal(result.multiDay?.productName, "25時間券");
  assert.deepEqual(result.multiDay?.dates, [
    "2027-01-27",
    "2027-01-28",
    "2027-01-29",
  ]);
  assert.equal(result.multiDay?.ticketTotal, 36000);
  assert.equal(result.total, 13200 + 36000);
});
