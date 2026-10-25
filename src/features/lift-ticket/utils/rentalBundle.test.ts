import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type {
  LiftTicketData,
  LiftTicketSearchInput,
  TicketPartyGroup,
  TicketRentalRequest,
} from "../types";
import { calculateLiftTicketPlan } from "./calculateLiftTicket";
import { calculateRentalPlan, rentalOptionsOf } from "./rental";
import {
  calculateRentalBundle,
  planWithoutBundledGroups,
} from "./rentalBundle";

const load = (resort: string) =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        `src/private/data/lift-ticket-test-fixtures/ui/${resort}/2026-2027.json`,
      ),
      "utf8",
    ),
  ) as LiftTicketData;

const SKI_SET: TicketRentalRequest = {
  sport: "ski",
  items: ["skis", "ski_boots", "poles"],
};
const SKI_SET_WEAR: TicketRentalRequest = {
  sport: "ski",
  items: ["skis", "ski_boots", "poles", "wear"],
};

const adult = (
  rental: TicketPartyGroup["rental"],
  overrides: Partial<TicketPartyGroup> = {},
): TicketPartyGroup => ({
  id: "g1",
  category: "adult",
  age: 30,
  count: 1,
  rental,
  ...overrides,
});

const inputOf = (
  party: TicketPartyGroup[],
  date: string,
  dates: string[] = [date],
): LiftTicketSearchInput => ({
  visitDate: date,
  usePreference: "full_day",
  today: "2026-10-22",
  days: dates.map((day, index) => ({
    id: `day-${index + 1}`,
    date: day,
    duration: { kind: "day", withNight: false },
  })),
  party,
});

const bundleOf = (
  data: LiftTicketData,
  input: LiftTicketSearchInput,
  withRental = true,
) => {
  const plan = calculateLiftTicketPlan(data, input);
  const rental = withRental ? calculateRentalPlan(data, input) : null;
  return {
    plan,
    rental,
    bundle: calculateRentalBundle(data, input, plan, rental),
  };
};

// 2027-01-13（水・平日）、2027-01-16（土・休日）
const WEEKDAY = "2027-01-13";
const HOLIDAY = "2027-01-16";

test("おそらかん: 単品レンタル料金が無くても、セット券で借りる物を選べて合計が出る", () => {
  const data = load("osorakan-snow-park");
  assert.equal((data.rentals ?? []).length, 0);
  const options = rentalOptionsOf(data);
  assert.ok(options, "セット券に含まれる用具を選択肢にする");
  assert.deepEqual(options.sports, ["ski", "snowboard"]);
  assert.ok(options.itemsBySport.ski.includes("wear"));
  assert.ok(!options.itemsBySport.ski.includes("helmet"));

  const input = inputOf([adult(SKI_SET)], WEEKDAY);
  const { plan, bundle } = bundleOf(data, input);
  assert.ok(bundle);
  assert.equal(bundle.lines.length, 1);
  assert.equal(bundle.lines[0].productId, "rental-1");
  assert.equal(bundle.lines[0].subtotal, 8000);
  // 1人だけなら、リフト券はセット券に置き換わるので合計はセット券の料金そのもの
  assert.equal(bundle.total, 8000);
  assert.ok((plan.total ?? 0) > 0);
  assert.equal(bundle.unbundledRenterGroupIds.length, 0);
});

test("おそらかん: ウェアも借りるなら、ウェア付きのセット券を選ぶ", () => {
  const data = load("osorakan-snow-park");
  const { bundle } = bundleOf(data, inputOf([adult(SKI_SET_WEAR)], WEEKDAY));
  assert.ok(bundle);
  assert.equal(bundle.lines[0].productId, "rental-2");
  assert.equal(bundle.lines[0].subtotal, 10600);
  // 休日は料金が上がる
  const holiday = bundleOf(data, inputOf([adult(SKI_SET_WEAR)], HOLIDAY));
  assert.equal(holiday.bundle?.lines[0].subtotal, 12200);
});

test("セット券に含まれない用具（ヘルメット）を借りる人にはセット券を使わない", () => {
  const data = load("osorakan-snow-park");
  const { bundle } = bundleOf(
    data,
    inputOf(
      [
        adult({
          sport: "ski",
          items: ["skis", "ski_boots", "poles", "helmet"],
        }),
      ],
      WEEKDAY,
    ),
  );
  assert.equal(bundle, null);
});

test("おそらかん: 複数日はセット券を日数ぶん足す", () => {
  const data = load("osorakan-snow-park");
  const { bundle } = bundleOf(
    data,
    inputOf([adult(SKI_SET)], WEEKDAY, [WEEKDAY, HOLIDAY]),
  );
  assert.ok(bundle);
  assert.equal(bundle.lines[0].subtotal, 8000 + 9600);
});

test("レンタルを借りない人がいれば、その人のリフト券は別に残る", () => {
  const data = load("osorakan-snow-park");
  const input = inputOf([adult(SKI_SET), adult(null, { id: "g2" })], WEEKDAY);
  const { plan, bundle } = bundleOf(data, input);
  assert.ok(bundle);
  assert.deepEqual(
    bundle.lines.map(line => line.groupId),
    ["g1"],
  );
  const remaining = planWithoutBundledGroups(plan, bundle);
  assert.deepEqual(
    remaining.days[0].result.lines.map(line => line.groupId),
    ["g2"],
  );
  const g2Ticket = plan.days[0].result.lines.find(
    line => line.groupId === "g2",
  )?.subtotal;
  assert.equal(bundle.total, 8000 + (g2Ticket ?? 0));
  assert.equal(remaining.days[0].result.payableTotal, g2Ticket);
});

test("上越国際: 早割のセット券は通常のリフト券＋レンタルより安いときだけ使う", () => {
  const data = load("joetsu-kokusai");
  const input = inputOf([adult(SKI_SET)], WEEKDAY);
  const { plan, rental, bundle } = bundleOf(data, input);
  const separate = (plan.total ?? 0) + (rental?.total ?? 0);
  if (bundle && bundle.lines.length > 0) {
    assert.ok((bundle.total ?? Number.POSITIVE_INFINITY) < separate);
    assert.equal(bundle.savings, separate - (bundle.total ?? 0));
  } else {
    assert.ok(
      separate <= 8400,
      `セット券¥8,400より別々のほうが高いのに使っていない: ${separate}`,
    );
  }
});

test("かぐら: クーポンのセット券は条件付きの案として別に返し、合計は変えない", () => {
  const data = load("kagura");
  const options = rentalOptionsOf(data);
  assert.ok(options, "単品レンタルが無くても、セット券の用具を選べる");
  const input = inputOf([adult(SKI_SET)], WEEKDAY);
  const { bundle } = bundleOf(data, input);
  assert.ok(bundle);
  assert.equal(bundle.lines.length, 0);
  assert.equal(bundle.total, null);
  assert.equal(bundle.conditionalOffers.length, 1);
  assert.equal(bundle.conditionalOffers[0].subtotal, 13100);
  // ウェアも借りるなら「オールセット」の案になる
  const all = bundleOf(data, inputOf([adult(SKI_SET_WEAR)], WEEKDAY));
  assert.deepEqual(
    all.bundle?.conditionalOffers.map(offer => offer.subtotal),
    [16800],
  );
});

test("戸隠: 学生限定の学得パックは条件付きの案にだけ出す", () => {
  const data = load("togakushi");
  const { bundle } = bundleOf(data, inputOf([adult(SKI_SET)], WEEKDAY));
  assert.ok(bundle);
  assert.equal(bundle.lines.length, 0);
  assert.deepEqual(
    bundle.conditionalOffers.map(offer => offer.subtotal),
    [9500],
  );
});

test("レンタルを借りない検索では何も返さない", () => {
  const data = load("osorakan-snow-park");
  const { bundle } = bundleOf(data, inputOf([adult(null)], WEEKDAY));
  assert.equal(bundle, null);
});
