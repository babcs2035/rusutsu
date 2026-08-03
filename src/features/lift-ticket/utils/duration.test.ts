import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { LiftTicketData, LiftTicketSearchInput } from "../types";
import {
  calculateLiftTicket,
  findClosedCalendar,
  selectCheapestProductForDuration,
  skiableHoursOf,
} from "./calculateLiftTicket";

const REAL = path.join(
  process.cwd(),
  "src/private/data/lift-ticket/megahira-onsen-megahira/tickets/2025-2026.json",
);
const data = JSON.parse(fs.readFileSync(REAL, "utf8")) as LiftTicketData;

/** 水曜（めがひらは毎週火曜が定休日なので水曜は営業している） */
const WEDNESDAY = "2026-01-28";

const input: LiftTicketSearchInput = {
  visitDate: WEDNESDAY,
  usePreference: "full_day",
  party: [{ id: "a", category: "adult", age: null, count: 1 }],
};

const pick = (hours: number) =>
  selectCheapestProductForDuration(data, input, { kind: "hours", hours });

const labelOf = (productId: string | undefined) => {
  const product = data.products.find(p => p.id === productId);
  return product ? (product.official_label_ja ?? product.name_ja) : null;
};

test("「7時間滑りたい」に9時間券を出す（要件を満たす最安）", () => {
  const product = pick(7);
  assert.equal(labelOf(product?.id), "9時間券");
  const result = calculateLiftTicket(data, input, product?.id);
  assert.equal(result.payableTotal, 6300);
});

test("要件ぴったりの券があればそれを出す", () => {
  assert.equal(labelOf(pick(3)?.id), "3時間券");
  assert.equal(labelOf(pick(4)?.id), "4時間券");
  assert.equal(labelOf(pick(5)?.id), "6時間券");
});

test("要件を満たす券が無ければ null（推測で近い券を出さない）", () => {
  assert.equal(pick(10), null);
});

test("時間帯が固定された券は最安候補にしない", () => {
  // 平日ゴゴイチ券は¥3,800で3時間券より安いが13:00〜17:00限定。
  // 朝から滑りたい人の代表にすると誤った案内になる
  for (const hours of [1, 2, 3, 4]) {
    assert.notEqual(labelOf(pick(hours)?.id), "平日ゴゴイチ券");
  }
});

test("付属物が付いた券も候補に含める", () => {
  // めがひらの9時間券には温泉無料特典が付くが、普通のリフト券なので
  // 候補から外してはいけない（外すと7時間の要件で「該当なし」になっていた）
  const nine = data.products.find(
    p => (p.official_label_ja ?? p.name_ja) === "9時間券",
  );
  assert.ok((nine?.included_items?.length ?? 0) > 0, "前提: 付属物がある");
  assert.equal(labelOf(pick(9)?.id), "9時間券");
});

test("1日券が無いスキー場では営業時間を満たす最長の券で代替する", () => {
  // めがひらに1日券は無く、営業08:00〜17:00＝9時間に対して9時間券が最長
  const product = selectCheapestProductForDuration(data, input, {
    kind: "days",
    days: 1,
  });
  assert.equal(labelOf(product?.id), "9時間券");
});

test("定休日の判定が日付を見ている（水曜は営業している）", () => {
  // closed の記録が1件あるだけで常に休業扱いにしていたバグの回帰テスト
  const nine = data.products.find(
    p => (p.official_label_ja ?? p.name_ja) === "9時間券",
  );
  assert.ok(nine);
  assert.equal(skiableHoursOf(nine, data, WEDNESDAY), 9);
});

test("画面の区分IDと料金データの学校区分IDのずれを吸収する", () => {
  // 画面は elementary、料金データは taxonomy の elementary_school。
  // 直接突き合わせていたため小学生の料金が一切引けていなかった
  const withChild: LiftTicketSearchInput = {
    ...input,
    party: [
      { id: "a", category: "adult", age: 30, count: 1 },
      { id: "b", category: "elementary", age: null, count: 1 },
    ],
  };
  const product = selectCheapestProductForDuration(data, withChild, {
    kind: "hours",
    hours: 7,
  });
  const result = calculateLiftTicket(data, withChild, product?.id);
  assert.equal(result.status, "complete");
  assert.equal(result.payableTotal, 6300 + 4300);
  const child = result.lines.find(line => line.groupLabel.includes("小学生"));
  assert.equal(child?.unitAmount, 4300);
});

test("土曜日の小学生にはこどもデー料金を自動適用する", () => {
  const saturdayInput: LiftTicketSearchInput = {
    visitDate: "2026-02-28",
    usePreference: "full_day",
    party: [
      { id: "a", category: "adult", age: null, count: 2 },
      { id: "b", category: "elementary", age: null, count: 1 },
    ],
  };
  const product = selectCheapestProductForDuration(data, saturdayInput, {
    kind: "days",
    days: 1,
  });
  const result = calculateLiftTicket(data, saturdayInput, product?.id);
  const child = result.lines.find(line => line.groupId === "b");

  assert.equal(result.status, "complete");
  assert.equal(result.payableTotal, 6800 * 2 + 1000);
  assert.equal(child?.unitAmount, 1000);
  assert.equal(child?.standardUnitAmount, 4300);
  assert.equal(
    result.conditionalOffers.some(offer =>
      offer.offerName.includes("こどもデー"),
    ),
    false,
  );
});

test("収集担当への申し送りを計算結果の注記に出さない", () => {
  const result = calculateLiftTicket(data, input, undefined);
  for (const note of result.notes) {
    assert.ok(
      !/要確認|未確認|確認すること|human_review/.test(note),
      `申し送りが画面の注記に出ている: ${note}`,
    );
  }
});

test("計算結果の各行に出典番号が付く", () => {
  const result = calculateLiftTicket(
    data,
    {
      ...input,
      party: [{ id: "a", category: "adult", age: 30, count: 1 }],
    },
    selectCheapestProductForDuration(data, input, { kind: "hours", hours: 7 })
      ?.id,
  );
  const line = result.lines[0];
  assert.ok(line.sourceNumbers.length > 0, "出典番号が空");
  // 引用していないページを一覧に並べない
  for (const reference of result.references) {
    assert.ok(
      result.lines.some(l => l.sourceNumbers.includes(reference.number)),
      `引用していない出典が一覧に出ている: [${reference.number}]`,
    );
  }
});

test("出典にURLとページタイトルが揃う（クリックとホバーに使う）", () => {
  const result = calculateLiftTicket(
    data,
    input,
    selectCheapestProductForDuration(data, input, { kind: "hours", hours: 7 })
      ?.id,
  );
  for (const reference of result.references) {
    assert.ok(reference.url.startsWith("http"), reference.url);
    assert.ok(reference.title, `タイトルが無い出典: [${reference.number}]`);
  }
});

test("定休日には料金を出さない", () => {
  // めがひらは毎週火曜が定休日。営業していない日に料金を出すと誤案内になる
  const tuesday = "2026-01-27";
  const result = calculateLiftTicket(
    data,
    { ...input, visitDate: tuesday },
    undefined,
  );
  assert.equal(result.status, "closed");
  assert.equal(result.payableTotal, null);
  assert.equal(result.lines.length, 0);
  // どこが定休日なのかを公式表記で伝える
  assert.match(result.notes[0] ?? "", /火曜/);
});

test("定休日の例外日（excluded_dates）は営業扱いにする", () => {
  // 「毎週火曜定休（12/30は営業）」の 12/30 は火曜だが営業している
  const closed = findClosedCalendar(data, "2025-12-30");
  assert.equal(closed, null);
  assert.notEqual(findClosedCalendar(data, "2026-01-27"), null);
});

test("平日から除外して休日へ包含した年末年始は土日祝料金になる", () => {
  const yearEndInput: LiftTicketSearchInput = {
    ...input,
    visitDate: "2025-12-29",
  };
  const product = selectCheapestProductForDuration(data, yearEndInput, {
    kind: "hours",
    hours: 9,
  });
  const result = calculateLiftTicket(data, yearEndInput, product?.id);
  assert.equal(labelOf(product?.id), "9時間券");
  assert.equal(result.payableTotal, 6800);
  assert.ok(
    result.lines.every(line => !/利用不可/.test(line.note ?? "")),
    JSON.stringify(result.lines),
  );
});

test("excluded_date_ranges は対象商品だけを期間除外する", () => {
  const yearEndInput: LiftTicketSearchInput = {
    ...input,
    visitDate: "2025-12-29",
  };
  const gogoichi = data.products.find(p => p.id === "hours-gogoichi");
  const result = calculateLiftTicket(data, yearEndInput, gogoichi?.id);
  assert.equal(result.payableTotal, null);
});

test("個別曜日の included_day_types が一致する（定休日の判定に必要）", () => {
  // dayTypeMatches が weekday/土日/祝日しか見ておらず tuesday を落としていたため、
  // 定休日のカレンダーに一度も一致せず料金が出ていた
  const tuesdays = ["2026-01-06", "2026-01-13", "2026-01-20", "2026-01-27"];
  for (const date of tuesdays) {
    assert.notEqual(
      findClosedCalendar(data, date),
      null,
      `火曜なのに定休日と判定されない: ${date}`,
    );
  }
  for (const date of ["2026-01-28", "2026-01-31"]) {
    assert.equal(
      findClosedCalendar(data, date),
      null,
      `火曜でないのに定休日と判定される: ${date}`,
    );
  }
});

test("1日（ナイター無/込）は別の券として選ばれる", () => {
  // covers_hours_types が「その券がナイターに使えるか」を表す。
  // めがひらはナイター単独券の料金が公式に無いので「ナイター込」は該当なし
  const withNight = selectCheapestProductForDuration(data, input, {
    kind: "day",
    withNight: true,
  });
  assert.equal(withNight, null, "ナイター込みの1日券が無いのに選ばれている");
  const withoutNight = selectCheapestProductForDuration(data, input, {
    kind: "day",
    withNight: false,
  });
  assert.equal(labelOf(withoutNight?.id), "9時間券");
});

test("要件に合う券が無いとき別の券にフォールバックしない", () => {
  // null を渡すと「希望の条件を満たす券がありません」を返す。
  // フォールバックすると希望と違う券の料金を答えのように出してしまう
  const result = calculateLiftTicket(data, input, null);
  assert.equal(result.status, "unavailable");
  assert.equal(result.payableTotal, null);
  assert.match(result.notes[0] ?? "", /条件を満たす券/);
});
