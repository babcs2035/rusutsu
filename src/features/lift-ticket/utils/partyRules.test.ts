import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { toClientLiftTicketData } from "../../../lib/publicLiftTicketData";
import type {
  LiftTicketSearchInput,
  TicketCalculationLine,
  TicketPartyGroup,
} from "../types";
import { calculateLiftTicket } from "./calculateLiftTicket";

const SAPPORO_KOKUSAI = path.join(
  process.cwd(),
  "src/private/data/lift-ticket/sapporo-kokusai/2026-2027.json",
);

// 公開画面と同じく、公開用スキーマを通したデータで計算する
// （components を捨てていたため親子パックが一度も当たらなかった）
const data = toClientLiftTicketData(
  JSON.parse(fs.readFileSync(SAPPORO_KOKUSAI, "utf8")),
);

const input = (
  date: string,
  party: Array<Pick<TicketPartyGroup, "category" | "count">>,
  today = "2026-11-25",
): LiftTicketSearchInput => ({
  visitDate: date,
  today,
  usePreference: "full_day",
  party: party.map((group, index) => ({
    id: `group-${index}`,
    age: null,
    ...group,
  })),
});

const packLine = (lines: TicketCalculationLine[]) =>
  lines.find(line => line.groupId.startsWith("party-rule:"));

test("大人1名＋小学生1名は親子パック（WEB・通常期間）8,000円になる", () => {
  const result = calculateLiftTicket(
    data,
    input("2027-01-13", [
      { category: "adult", count: 1 },
      { category: "elementary", count: 1 },
    ]),
  );

  assert.equal(result.ticketTotal, 8000);
  assert.equal(result.lines.length, 1);
  assert.match(result.lines[0].offerName ?? "", /親子パック/);
  assert.equal(result.lines[0].count, 2);
});

test("親子パックに入らない大人は個別のWEB1日券で足す", () => {
  const result = calculateLiftTicket(
    data,
    input("2027-01-13", [
      { category: "adult", count: 2 },
      { category: "elementary", count: 1 },
    ]),
  );

  assert.equal(result.ticketTotal, 8000 + 6700);
  const adultLine = result.lines.find(line => line.groupId === "group-0");
  assert.equal(adultLine?.count, 1);
  assert.equal(adultLine?.subtotal, 6700);
});

test("親子2組なら親子パック2セット", () => {
  const result = calculateLiftTicket(
    data,
    input("2027-01-13", [
      { category: "adult", count: 2 },
      { category: "elementary", count: 2 },
    ]),
  );

  assert.equal(result.ticketTotal, 16000);
  assert.match(packLine(result.lines)?.offerName ?? "", /× 2セット/);
});

test("スプリング期間は7,500円の親子パックを使う", () => {
  const result = calculateLiftTicket(
    data,
    input("2027-04-10", [
      { category: "adult", count: 1 },
      { category: "elementary", count: 1 },
    ]),
  );

  assert.equal(result.ticketTotal, 7500);
});

test("大人だけ・小学生だけでは親子パックを当てない", () => {
  const adultOnly = calculateLiftTicket(
    data,
    input("2027-01-13", [{ category: "adult", count: 1 }]),
  );
  const childOnly = calculateLiftTicket(
    data,
    input("2027-01-13", [{ category: "elementary", count: 2 }]),
  );

  assert.equal(adultOnly.ticketTotal, 6700);
  assert.equal(packLine(adultOnly.lines), undefined);
  assert.equal(childOnly.ticketTotal, 5000);
  assert.equal(packLine(childOnly.lines), undefined);
});

test("1日券以外の券種では親子パックを当てない", () => {
  const result = calculateLiftTicket(
    data,
    input("2027-01-13", [
      { category: "adult", count: 1 },
      { category: "elementary", count: 1 },
    ]),
    "prod-4hour",
  );

  assert.equal(packLine(result.lines), undefined);
});

test("販売開始前に照会したら、販売開始日を添えて親子パックを出す", () => {
  const result = calculateLiftTicket(
    data,
    input(
      "2027-01-13",
      [
        { category: "adult", count: 1 },
        { category: "elementary", count: 1 },
      ],
      "2026-09-25",
    ),
  );

  assert.equal(result.ticketTotal, 8000);
  assert.deepEqual(result.lines[0].warnings, ["11/19から販売開始です"]);
});
