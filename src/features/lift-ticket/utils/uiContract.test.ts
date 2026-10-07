import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { toClientLiftTicketData } from "../../../lib/publicLiftTicketData";
import {
  type LiftTicketSearchInput,
  SELECTABLE_TICKET_PARTY_CATEGORIES,
  TICKET_DISABILITY_BASE_CATEGORIES,
  TICKET_HOUR_OPTIONS,
  type TicketCalculationResult,
  type TicketDayDuration,
  type TicketPartyCategory,
} from "../types";
import {
  calculateLiftTicket,
  calculateLiftTicketPlan,
  skiableHoursOf,
} from "./calculateLiftTicket";
import {
  OFFICIAL_AUDIENCE_TICKETS,
  OFFICIAL_CASES,
} from "./testing/officialCases";

// CIは固定資料で再現可能にする。収集時は同じ検証を実データに適用する。
const root =
  process.env.LIFT_TICKET_DATA_ROOT ??
  "src/private/data/lift-ticket-test-fixtures/ui";
const DAY: TicketDayDuration = { kind: "day", withNight: false };
const files = fs
  .readdirSync(root, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .flatMap(entry =>
    fs
      .readdirSync(path.join(root, entry.name))
      .filter(name => name.endsWith(".json"))
      .map(name => `${entry.name}/${name}`),
  );

test("全スキー場・シーズンに公式と照合した共通テストの期待値がある", () => {
  const expected = OFFICIAL_CASES.map(c => `${c.resort}/${c.season}.json`);
  assert.ok(files.length > 0, "料金データがありません");
  for (const file of files)
    assert.ok(expected.includes(file), `${file} の公式照合ケースが未登録`);
  if (!process.env.LIFT_TICKET_DATA_ROOT)
    assert.deepEqual([...files].sort(), expected.sort());
});

for (const spec of OFFICIAL_CASES.filter(c =>
  files.includes(`${c.resort}/${c.season}.json`),
)) {
  const data = toClientLiftTicketData(
    JSON.parse(
      fs.readFileSync(
        path.join(root, spec.resort, `${spec.season}.json`),
        "utf8",
      ),
    ),
  );
  const input = (
    category: TicketPartyCategory,
    age: number | null,
    date = spec.date,
  ): LiftTicketSearchInput => ({
    visitDate: date,
    today: date,
    usePreference: "full_day",
    party: [{ id: "person", category, age, count: 1 }],
  });
  const plan = (
    category: TicketPartyCategory,
    age: number | null,
    date = spec.date,
    duration: TicketDayDuration = DAY,
  ) =>
    calculateLiftTicketPlan(data, {
      ...input(category, age, date),
      days: [{ id: "day", date, duration }],
    });
  const assertPrice = (
    result: TicketCalculationResult,
    amount: number | null,
  ) => {
    assert.equal(result.ticketTotal, amount, JSON.stringify(result.lines));
    if (amount != null) {
      assert.equal(result.status, "complete");
      // 出典があるだけでなく、実際に選ばれた料金行が公式URLへ結び付くこと。
      const referenced = new Set(
        result.lines.flatMap(line => line.sourceNumbers),
      );
      assert.ok(
        result.references.some(
          ref => referenced.has(ref.number) && spec.urls.includes(ref.url),
        ),
      );
    }
  };

  test(`${spec.resort}: UIに追加された区分も照合対象から漏れない`, () => {
    assert.deepEqual(
      Object.keys(spec.categories).sort(),
      [...SELECTABLE_TICKET_PARTY_CATEGORIES].sort(),
    );
  });
  for (const category of SELECTABLE_TICKET_PARTY_CATEGORIES) {
    test(`${spec.resort}: ${category}を選択（年齢未入力）`, () => {
      const result = plan(category, null);
      assert.equal(result.total, spec.categories[category]);
      assertPrice(result.days[0].result, spec.categories[category]);
      if (spec.categories[category] == null) {
        assert.match(
          result.days[0].result.lines.map(line => line.note).join(" "),
          /年齢.*入力/,
        );
      }
    });
  }
  for (const [category, [min, max]] of [
    ["elementary", [7, 12]],
    ["junior_high", [13, 15]],
    ["high_school", [16, 18]],
  ] as const) {
    test(`${spec.resort}: ${category}は在学年齢${min}〜${max}歳で料金が1つなら年齢未入力でも出す`, () => {
      const totals = new Set(
        Array.from(
          { length: max - min + 1 },
          (_, i) => plan(category, min + i).total,
        ),
      );
      if (totals.size !== 1) return;
      assert.equal(plan(category, null).total, [...totals][0]);
    });
  }
  const representativeAges = {
    preschool: 4,
    elementary: 10,
    junior_high: 13,
    high_school: 17,
    university: 21,
    adult: 30,
  };
  for (const baseCategory of TICKET_DISABILITY_BASE_CATEGORIES) {
    test(`${spec.resort}: 障がい者＋${baseCategory}の料金と通常料金への戻し`, () => {
      const base = input("disabled", representativeAges[baseCategory]);
      const result = calculateLiftTicketPlan(data, {
        ...base,
        party: [{ ...base.party[0], baseCategory }],
        days: [{ id: "day", date: spec.date, duration: DAY }],
      });
      assert.equal(result.total, spec.disabilityAmounts[baseCategory]);
      assertPrice(result.days[0].result, spec.disabilityAmounts[baseCategory]);
    });
  }
  test(`${spec.resort}: 掲載された券の利用単位を共通検証から漏らさない`, () => {
    const testedProducts = new Set(spec.products.map(([id]) => id));
    const testedModes = new Set(
      data.products
        .filter(p => testedProducts.has(p.id))
        .map(p => p.validity?.mode),
    );
    for (const product of data.products) {
      assert.ok(
        testedModes.has(product.validity?.mode),
        `${product.validity?.mode} の確認ケースが未登録`,
      );
    }
  });
  test(`${spec.resort}: UIの1日＋ナイターの料金`, () => {
    // ルスツの1日券の夜間利用可否は既存の管理者確認。他は代表日がナイター営業日ではない。
    const result = plan("adult", 30, spec.date, {
      kind: "day",
      withNight: true,
    });
    assert.equal(result.total, spec.categories.adult);
    assertPrice(result.days[0].result, spec.categories.adult);
  });
  for (const [dates, hours, amount] of spec.multiDays ?? []) {
    test(`${spec.resort}: 日をまたぐ時間券と追加券の合計`, () => {
      const result = calculateLiftTicketPlan(data, {
        ...input("adult", 30, dates[0]),
        days: dates.map((date, i) => ({
          id: String(i),
          date,
          duration: { kind: "hours", hours },
        })),
      });
      assert.equal(result.total, amount);
      assert.equal(result.multiDay?.kind, "hours_pool");
      assert.ok((result.multiDay?.addOns.length ?? 0) > 0);
    });
  }
  for (const [category, age, date, amount] of spec.audienceDates ?? []) {
    test(`${spec.resort}: ${date} ${category}の特定日料金`, () => {
      const result = plan(category, age, date);
      assert.equal(result.total, amount);
      assertPrice(result.days[0].result, amount);
    });
  }
  for (const [category, age] of spec.ambiguousAges ?? []) {
    test(`${spec.resort}: ${category} ${age}歳の矛盾する公式条件を大人料金で埋めない`, () => {
      const result = plan(category, age);
      assert.equal(result.total, null);
      assert.match(
        result.days[0].result.lines.map(line => line.note).join(" "),
        /公式の対象条件を確認/,
      );
    });
  }
  for (const [category, age, amount] of spec.ages) {
    test(`${spec.resort}: ${category} ${age}歳の公式料金`, () => {
      const result = plan(category, age);
      assert.equal(result.total, amount);
      assertPrice(result.days[0].result, amount);
    });
  }
  for (const [date, amount] of spec.dates) {
    test(`${spec.resort}: ${date}の料金（平休日・期間境界）`, () => {
      const result = plan("adult", 30, date);
      assert.equal(result.total, amount);
      assertPrice(result.days[0].result, amount);
    });
  }
  for (const [product, amount] of spec.products) {
    test(`${spec.resort}: 券種 ${product}の公式料金`, () => {
      assertPrice(
        calculateLiftTicket(data, input("adult", 30), product),
        amount,
      );
    });
  }
  for (const [product, category, age, amount] of OFFICIAL_AUDIENCE_TICKETS[
    spec.resort
  ] ?? []) {
    test(`${spec.resort}: ${product} / ${category} / ${age ?? "年齢なし"}`, () => {
      assertPrice(
        calculateLiftTicket(data, input(category, age), product),
        amount,
      );
    });
  }
  for (const [category, age, hours, amount, product] of spec.hourAudiences ??
    []) {
    test(`${spec.resort}: ${hours}時間検索 ${category}の代替券と料金`, () => {
      const result = plan(category, age, spec.date, { kind: "hours", hours });
      assert.equal(result.total, amount);
      assertPrice(result.days[0].result, amount);
      assert.equal(result.days[0].result.productId, product);
    });
  }
  for (const [hours, amount] of spec.hours) {
    test(`${spec.resort}: ${hours}時間の要件と料金`, () => {
      const result = plan("adult", 30, spec.date, { kind: "hours", hours });
      assert.equal(result.total, amount);
      assertPrice(result.days[0].result, amount);
    });
  }
  for (const hours of TICKET_HOUR_OPTIONS) {
    test(`${spec.resort}: UIの${hours}時間で不足する券・時間帯固定券を選ばない`, () => {
      const result = plan("adult", 30, spec.date, { kind: "hours", hours });
      const selected = data.products.find(
        p => p.id === result.days[0].result.productId,
      );
      if (result.total == null || !selected) return;
      assert.notEqual(selected.validity?.mode, "fixed_time_window");
      const available = skiableHoursOf(selected, data, spec.date);
      if (available != null) assert.ok(available >= hours);
    });
  }
  for (const date of spec.openExceptions ?? []) {
    test(`${spec.resort}: 定休日の例外 ${date}は営業扱い`, () => {
      assert.equal(plan("adult", 30, date).days[0].result.status, "complete");
    });
  }
  for (const date of spec.closed ?? []) {
    test(`${spec.resort}: ${date}の定休日は全区分で料金を出さない`, () => {
      for (const category of SELECTABLE_TICKET_PARTY_CATEGORIES) {
        const result = plan(category, null, date);
        assert.equal(result.total, null);
        assert.equal(result.days[0].result.status, "closed");
      }
    });
  }
  for (const [boundary, shift] of [
    [data.season.start_date, -1],
    [data.season.end_date, 1],
  ] as const) {
    if (!boundary) continue; // 公式未掲載の開始・終了日を作らない。
    test(`${spec.resort}: 営業期間の境界日 ${boundary}を期間外にしない`, () => {
      for (const category of SELECTABLE_TICKET_PARTY_CATEGORIES) {
        assert.notEqual(
          plan(category, null, boundary).days[0].result.status,
          "outside_season",
        );
      }
    });
    const date = new Date(`${boundary}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + shift);
    const outside = date.toISOString().slice(0, 10);
    test(`${spec.resort}: 営業期間外 ${outside}は全区分で料金を出さない`, () => {
      for (const category of SELECTABLE_TICKET_PARTY_CATEGORIES) {
        const result = plan(category, null, outside);
        assert.equal(result.total, null);
        assert.equal(result.days[0].result.status, "outside_season");
      }
    });
  }
}
