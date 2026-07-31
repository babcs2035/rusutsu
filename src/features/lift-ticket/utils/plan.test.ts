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
  "src/private/data/lift-ticket/megahira-onsen-megahira/tickets/2025-2026.json",
);

const load = (file: string) =>
  JSON.parse(fs.readFileSync(file, "utf8")) as LiftTicketData;

const PARTY: TicketPartyGroup[] = [
  { id: "a", category: "adult", age: 30, count: 1 },
];

const plan = (file: string, days: Array<[string, TicketDayDuration]>) =>
  calculateLiftTicketPlan(load(file), {
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
  const result = plan(MULTI, [
    ["2026-01-14", DAY],
    ["2026-01-15", DAY],
  ]);
  assert.equal(result.perDayTotal, 12000, "1日券×2の合計");
  assert.equal(result.multiDay?.days, 2);
  assert.equal(result.multiDay?.total, 11000);
  assert.equal(result.total, 11000, "安い連続2日券が採用されていない");
});

test("日付が飛んでいると連続2日券は使えない", () => {
  // 連続2日券は連続した日にしか使えない。1日券×2にする
  const result = plan(MULTI, [
    ["2026-01-14", DAY],
    ["2026-01-17", DAY],
  ]);
  assert.equal(result.multiDay, null);
  assert.equal(result.total, 12000);
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
