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
  "src/private/data/lift-ticket-test-fixtures/ui/sapporo-kokusai/2026-2027.json",
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
  assert.equal(
    packLine(result.lines)?.partySet?.members,
    "大人1名＋小学生1名 × 2",
  );
});

test("同じ区分を別の行に分けて入力しても、セットの中身は1組分で出す", () => {
  // レンタルの有無で大人・小学生を1名ずつ別の行に分けたとき
  const result = calculateLiftTicket(
    data,
    input("2027-01-13", [
      { category: "adult", count: 1 },
      { category: "adult", count: 1 },
      { category: "elementary", count: 1 },
      { category: "elementary", count: 1 },
    ]),
  );

  assert.equal(result.ticketTotal, 16000);
  const pack = packLine(result.lines);
  assert.equal(pack?.partySet?.members, "大人1名＋小学生1名 × 2");
  assert.equal(pack?.groupLabel, "大人＋小学生");
});

test("スプリング期間は7,500円の親子パックを使う", () => {
  // FixtureのWEB親子パックは3/31〜5/5販売、固定合計7,500円。
  const result = calculateLiftTicket(
    data,
    input(
      "2027-04-10",
      [
        { category: "adult", count: 1 },
        { category: "elementary", count: 1 },
      ],
      "2027-03-31",
    ),
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

test("販売開始前の親子パックを使わず、窓口料金を出す", () => {
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

  assert.equal(result.ticketTotal, 9800);
  assert.equal(packLine(result.lines), undefined);
});

test("排他グループは最初の人数別ルールを1回だけ適用し、残りは通常料金にする", () => {
  const childRule = (
    id: string,
    name_ja: string,
    count: number,
    amount: number,
  ) => ({
    id,
    name_ja,
    exclusive_group_id: "child-count-discount",
    components: [
      {
        role_ja: "小学生",
        audience_ids: ["elementary"],
        min_count: count,
        max_count: count,
        price_effect: { type: "fixed_total", amount },
      },
    ],
  });
  const raw = JSON.parse(fs.readFileSync(SAPPORO_KOKUSAI, "utf8"));
  raw.party_rules = [
    childRule("rule-child-five", "小学生5人セット", 5, 10000),
    childRule("rule-child-two", "小学生2人セット", 2, 3000),
  ];
  const exclusiveData = toClientLiftTicketData(raw);

  const five = calculateLiftTicket(
    exclusiveData,
    input("2027-01-13", [{ category: "elementary", count: 5 }], "2026-11-18"),
  );
  assert.equal(five.ticketTotal, 10000);
  assert.equal(packLine(five.lines)?.groupId, "party-rule:rule-child-five");
  assert.equal(packLine(five.lines)?.partySet?.setCount, 1);

  const seven = calculateLiftTicket(
    exclusiveData,
    input("2027-01-13", [{ category: "elementary", count: 7 }], "2026-11-18"),
  );
  assert.equal(seven.ticketTotal, 15600);
  assert.equal(packLine(seven.lines)?.groupId, "party-rule:rule-child-five");
  assert.equal(packLine(seven.lines)?.count, 5);
  assert.equal(packLine(seven.lines)?.partySet?.setCount, 1);
  assert.ok(
    !seven.lines.some(line => line.groupId === "party-rule:rule-child-two"),
  );
  const residual = seven.lines.find(line => line.groupId === "group-0");
  assert.equal(residual?.count, 2);
  assert.equal(residual?.subtotal, 5600);

  const two = calculateLiftTicket(
    exclusiveData,
    input("2027-01-13", [{ category: "elementary", count: 2 }], "2026-11-18"),
  );
  assert.equal(two.ticketTotal, 3000);
  assert.equal(packLine(two.lines)?.groupId, "party-rule:rule-child-two");
  assert.equal(packLine(two.lines)?.partySet?.setCount, 1);
});
