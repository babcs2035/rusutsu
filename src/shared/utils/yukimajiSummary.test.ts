import assert from "node:assert/strict";
import test from "node:test";
import { summarizeYukimaji } from "./yukimajiSummary";

const coupon = (patch: object) => ({
  period: { start: "2027-01-04", end: "2027-03-26" },
  day_rule: "all",
  ...patch,
});

test("期間・曜日の条件・割引の値段を1行にし、無料の回数は書かない", () => {
  assert.equal(
    summarizeYukimaji({
      status: "listed",
      free_coupon: coupon({ day_rule: "weekday" }),
      discount_coupon: coupon({
        price_rules: [
          { price_effect: { type: "discount_amount", amount: 1000 } },
        ],
      }),
    }),
    "1/4〜3/26 平日限定｜割引 1,000円引",
  );
});

test("全日利用可は書かず、割引は決まった値段・半額・割合で書き分ける", () => {
  const summary = (effect: object) =>
    summarizeYukimaji({
      status: "listed",
      free_coupon: coupon({}),
      discount_coupon: coupon({ price_rules: [{ price_effect: effect }] }),
    });
  assert.equal(
    summary({ type: "fixed_total", amount: 2500 }),
    "1/4〜3/26｜割引 2,500円",
  );
  assert.equal(
    summary({ type: "discount_percent", percent: 50 }),
    "1/4〜3/26｜割引 半額",
  );
  assert.equal(
    summary({ type: "discount_percent", percent: 30 }),
    "1/4〜3/26｜割引 30%引",
  );
});

test("期間が日付で無いときは掲載文から年と曜日を省く", () => {
  assert.equal(
    summarizeYukimaji({
      status: "listed",
      free_coupon: {
        period: null,
        period_text_ja: "2026/12/12(土)～2027/3/28(日)",
        day_rule: "all",
      },
      discount_coupon: null,
    }),
    "12/12〜3/28",
  );
});

test("掲載中でなければ出さない", () => {
  assert.equal(summarizeYukimaji({ status: "preparing" }), null);
  assert.equal(summarizeYukimaji(null), null);
});

test("平日・休日で値段が分かれるときは最も安い値段に「〜」を付ける", () => {
  assert.equal(
    summarizeYukimaji({
      status: "listed",
      free_coupon: coupon({}),
      discount_coupon: coupon({
        price_rules: [
          { price_effect: { type: "fixed_total", amount: 8000 } },
          { price_effect: { type: "fixed_total", amount: 7500 } },
        ],
      }),
    }),
    "1/4〜3/26｜割引 7,500円〜",
  );
});
