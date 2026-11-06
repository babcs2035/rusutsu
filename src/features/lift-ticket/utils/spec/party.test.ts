// 仕様書 P-1〜P-12（同行者ルール）、P01〜P52
import assert from "node:assert/strict";
import { test } from "node:test";
import type { LiftTicketData, TicketDayDuration } from "../../types";
import {
  calculateLiftTicket,
  calculateLiftTicketPlan,
} from "../calculateLiftTicket";
import {
  adult,
  DAY,
  dayInput,
  daysInput,
  elementary,
  party,
  type SpecMember,
} from "../testing/specResort";
import {
  accompaniedFreeResort,
  bulkBuyResort,
  childcareResort,
  conditionalFamilyResort,
  dynalandResort,
  entryPassResort,
  familyPackResort,
  familyPackReversedResort,
  familyTicketResort,
  infantFreeResort,
  joetsuResort,
  kominoResort,
  okushigaResort,
  osorakanFamilyPackResort,
  sapporoResort,
  whitepiaResort,
} from "./fixtures/party";
import { grandTotal, withRental as withRentalOn } from "./grand";

const JAN13 = "2027-01-13"; // 水曜
const preschool = (count = 1, age: number | null = null): SpecMember => ({
  category: "preschool",
  count,
  age,
});
const junior = (count = 1): SpecMember => ({
  category: "junior_high",
  count,
});
const high = (count = 1): SpecMember => ({
  category: "high_school",
  count,
});

const price = (
  data: LiftTicketData,
  date: string,
  members: SpecMember[],
  today?: string,
  duration: TicketDayDuration = DAY,
) =>
  calculateLiftTicketPlan(
    data,
    dayInput(date, duration, party(...members), today),
  );

const total = (
  data: LiftTicketData,
  date: string,
  members: SpecMember[],
  today?: string,
) => price(data, date, members, today).total;

const lineNames = (
  data: LiftTicketData,
  date: string,
  members: SpecMember[],
  today?: string,
) =>
  price(data, date, members, today)
    .days[0].result.lines.map(line => line.offerName ?? "")
    .join(" / ");

// ---------- P-1 ----------
test("P01 大人1＋小学生1", () => {
  const plan = price(familyPackResort, JAN13, [adult(1), elementary(1)]);
  assert.equal(plan.total, 8500);
  assert.match(
    lineNames(familyPackResort, JAN13, [adult(1), elementary(1)]),
    /大人1＋小学生1/,
  );
});
test("P02 大人2＋小学生2", () => {
  assert.equal(
    total(familyPackResort, JAN13, [adult(2), elementary(2)]),
    17000,
  );
});
test("P03 大人3＋小学生2", () => {
  assert.equal(
    total(familyPackResort, JAN13, [adult(3), elementary(2)]),
    22500,
  );
});
test("P04 大人2＋小学生5", () => {
  assert.equal(
    total(familyPackResort, JAN13, [adult(2), elementary(5)]),
    26000,
  );
});
test("P05 小学生2のみ（パックなし）", () => {
  const plan = price(familyPackResort, JAN13, [elementary(2)]);
  assert.equal(plan.total, 7000);
  assert.ok(
    !plan.days[0].result.lines.some(line => line.partySet != null),
    "パックは使わない",
  );
});
test("P06 大人1＋小学生1＋未就学1（未就学はパックの人数に数えない）", () => {
  const plan = price(familyPackResort, JAN13, [
    adult(1),
    elementary(1),
    preschool(1, 4),
  ]);
  assert.equal(plan.total, 8500);
});
test("P07 大人1＋中学生1（パックは小学生だけ）", () => {
  const plan = price(familyPackResort, JAN13, [adult(1), junior(1)]);
  assert.equal(plan.total, 10500);
  assert.ok(!plan.days[0].result.lines.some(line => line.partySet != null));
});
test("P08 P03でパックの並び順を逆にする", () => {
  assert.equal(
    total(familyPackReversedResort, JAN13, [adult(3), elementary(2)]),
    22500,
  );
});

// ---------- P-2 ----------
test("P09 大人2＋小学生2、照会日は利用日の1か月前（Web 15,400円）", () => {
  assert.equal(
    total(kominoResort, JAN13, [adult(2), elementary(2)], "2026-12-13"),
    15400,
  );
});
test("P10 P09を利用日の当日に照会（窓口 15,800円）", () => {
  assert.equal(
    total(kominoResort, JAN13, [adult(2), elementary(2)], JAN13),
    15800,
  );
});
test("P11 大人2＋中学生2、照会日は1か月前（Web 15,400円）", () => {
  assert.equal(
    total(kominoResort, JAN13, [adult(2), junior(2)], "2026-12-13"),
    15400,
  );
});

// ---------- P-3 ----------
test("P12 未就学5歳のみ（料金なし＋保護者の同伴が必要です）", () => {
  const plan = price(accompaniedFreeResort, JAN13, [preschool(1, 5)]);
  const result = plan.days[0].result;
  assert.equal(plan.total, null);
  const text = [
    ...result.notes,
    ...result.lines.map(
      line => `${line.note ?? ""}${line.warnings?.join("") ?? ""}`,
    ),
    ...(plan.days[0].options?.notes ?? []),
  ].join("|");
  assert.ok(text.includes("保護者の同伴が必要です"), text);
});
test("P13 大人1＋未就学2（未就学2名とも無料）", () => {
  assert.equal(
    total(accompaniedFreeResort, JAN13, [adult(1), preschool(2, 4)]),
    6000,
  );
});
test("P14 1/24・大人1＋小学生2（小学生2名とも無料）", () => {
  assert.equal(
    total(accompaniedFreeResort, "2027-01-24", [adult(1), elementary(2)]),
    6000,
  );
});
test("P15 1/23・大人1＋小学生2", () => {
  assert.equal(
    total(accompaniedFreeResort, "2027-01-23", [adult(1), elementary(2)]),
    13000,
  );
});
test("P16 1/24・小学生のみ（同伴の大人がいない）", () => {
  assert.equal(
    total(accompaniedFreeResort, "2027-01-24", [elementary(1)]),
    3500,
  );
});

// ---------- P-4 ----------
const infant = (count: number): SpecMember => ({
  category: "preschool",
  count,
  age: 3,
});
test("P17 大人1＋3歳1", () => {
  assert.equal(total(infantFreeResort, JAN13, [adult(1), infant(1)]), 6000);
});
test("P18 大人1＋3歳2（1名だけ無料）", () => {
  assert.equal(total(infantFreeResort, JAN13, [adult(1), infant(2)]), 7000);
});
test("P19 大人2＋3歳2", () => {
  assert.equal(total(infantFreeResort, JAN13, [adult(2), infant(2)]), 12000);
});
test("P20 大人2＋3歳3", () => {
  assert.equal(total(infantFreeResort, JAN13, [adult(2), infant(3)]), 13000);
});

// ---------- P-5 ----------
const BEFORE = "2026-12-13";
test("P21 ファミリー券の施設・大人1＋中学生1、照会日は前日以前", () => {
  assert.equal(
    total(familyTicketResort, JAN13, [adult(1), junior(1)], BEFORE),
    8600,
  );
});
test("P22 同じ施設・大人2＋小学生1、照会日は前日以前", () => {
  assert.equal(
    total(familyTicketResort, JAN13, [adult(2), elementary(1)], BEFORE),
    15100,
  );
});
test("P23 同じ施設・大人1＋中学生1、照会日は当日（窓口 11,000円）", () => {
  assert.equal(
    total(familyTicketResort, JAN13, [adult(1), junior(1)], JAN13),
    11000,
  );
});
test("P24 子育て応援の施設・大人2＋高校生1", () => {
  assert.equal(total(childcareResort, JAN13, [adult(2), high(1)]), 10500);
});
test("P25 子育て応援の施設・大人3＋小学生1", () => {
  assert.equal(total(childcareResort, JAN13, [adult(3), elementary(1)]), 17000);
});
test("P26 子育て応援の施設・大人2のみ（パックは子どもが必要）", () => {
  assert.equal(total(childcareResort, JAN13, [adult(2)]), 13000);
});

// ---------- P-6 ----------
test("P27 鹿島槍型・大人1＋小学生1（長野県民 5,700円を条件付きで出す）", () => {
  const plan = price(conditionalFamilyResort, JAN13, [adult(1), elementary(1)]);
  assert.equal(plan.total, 7500);
  // 仕様: 「長野県民なら 5,700円（住所入りの身分証が必要）」を条件付き候補に出す。
  // 同行者ルールの条件付き候補は conditionalOffers に出る想定（最も近い既存フィールド）
  const offers = plan.days[0].result.conditionalOffers;
  const hit = offers.find(offer => offer.subtotal === 5700);
  assert.ok(hit, `5,700円の条件付き候補が無い: ${offers.length}件`);
  const text = [hit.label, hit.offerName, ...hit.conditions].join("");
  assert.ok(text.includes("長野県民") || text.includes("住所入りの身分証"));
});

const withProduct = (
  data: LiftTicketData,
  productId: string,
  members: SpecMember[],
) =>
  calculateLiftTicket(data, dayInput(JAN13, DAY, party(...members)), productId);

test("P28 菅平型・大人1＋小学生1、エリア1日券（確定 8,000円、小学生0円を条件付きで出す）", () => {
  const result = withProduct(entryPassResort, "area-day", [
    adult(1),
    elementary(1),
  ]);
  assert.equal(result.ticketTotal, 8000);
  // 仕様: 「同居のご家族なら小学生 0円」を条件付き候補に出す
  const hit = result.conditionalOffers.find(
    offer => offer.subtotal === 0 || offer.unitAmount === 0,
  );
  assert.ok(hit, "小学生0円の条件付き候補が無い");
  assert.ok(
    [hit.label, hit.offerName, ...hit.conditions]
      .join("")
      .includes("同居のご家族"),
  );
});
test("P29 菅平型・大人1＋小学生1、通常の1日券（エントリーパスの無料は出さない）", () => {
  const result = withProduct(entryPassResort, "day", [adult(1), elementary(1)]);
  assert.equal(result.ticketTotal, 8000);
  assert.equal(
    result.conditionalOffers.some(
      offer => offer.subtotal === 0 || offer.unitAmount === 0,
    ),
    false,
  );
});

// ---------- P-7 ----------
const feeOf = (plan: ReturnType<typeof price>) =>
  plan.days[0].result.fees.reduce((sum, fee) => sum + fee.total, 0);
test("P30 札幌国際型・1月・大人1＋小学生1（8,000円＋保証金500円）", () => {
  const plan = price(sapporoResort, JAN13, [adult(1), elementary(1)]);
  assert.equal(plan.total, 8500);
  assert.equal(feeOf(plan), 500, "保証金は1枚（カード）ぶん");
  // 仕様: 「返却で返金」と注記する
  const text = [
    ...plan.days[0].result.notes,
    ...plan.days[0].result.fees.map(fee => fee.name),
  ].join("|");
  assert.ok(text.includes("返却で返金"), text);
});
test("P31 札幌国際型・3月下旬・大人1＋小学生1（7,500円＋保証金500円）", () => {
  const plan = price(sapporoResort, "2027-03-24", [adult(1), elementary(1)]);
  assert.equal(plan.total, 8000);
  assert.equal(feeOf(plan), 500);
});
test("P32 ホワイトピア型・平日・大人1＋小学生1（6,800円・食事券1,000円分付き）", () => {
  const plan = price(whitepiaResort, JAN13, [adult(1), elementary(1)]);
  assert.equal(plan.total, 6800);
  // 仕様: 「食事券1,000円分付き」と表示（同行者ルールの説明 note に出る）
  const lines = plan.days[0].result.lines;
  assert.ok(
    lines.some(line => (line.note ?? "").includes("食事券1,000円分付き")),
  );
});
test("P33 ホワイトピア型・土曜・大人1＋小学生1（7,800円・食事券1,000円分付き）", () => {
  const plan = price(whitepiaResort, "2027-01-16", [adult(1), elementary(1)]);
  assert.equal(plan.total, 7800);
  const lines = plan.days[0].result.lines;
  assert.ok(
    lines.some(line => (line.note ?? "").includes("食事券1,000円分付き")),
  );
});

// ---------- P-8 ----------
/** 画面の「単独券／共通券」の切り替え: 選ばれなかった側の券・料金を外す */
const onlyShared = (data: LiftTicketData, shared: boolean): LiftTicketData => {
  const keep = new Set(
    data.products
      .filter(
        product => (product.shared_with_resorts?.length ?? 0) > 0 === shared,
      )
      .map(product => product.id),
  );
  return {
    ...data,
    products: data.products.filter(product => keep.has(product.id)),
    offers: data.offers.filter(offer => keep.has(offer.product_id)),
    party_rules: data.party_rules.filter(rule =>
      (rule.components ?? []).some(component =>
        (component.product_ids ?? []).some(id => keep.has(id)),
      ),
    ),
  };
};
test("P34 大人1＋小学生1、単独（ファミリー券 6,800円）", () => {
  const plan = price(onlyShared(dynalandResort, false), JAN13, [
    adult(1),
    elementary(1),
  ]);
  assert.equal(plan.total, 6800);
  assert.match(
    lineNames(onlyShared(dynalandResort, false), JAN13, [
      adult(1),
      elementary(1),
    ]),
    /ファミリー券（単独）/,
  );
});
test("P35 大人1＋小学生1、共通に切り替え（ファミリー券 7,100円）", () => {
  const data = onlyShared(dynalandResort, true);
  assert.equal(total(data, JAN13, [adult(1), elementary(1)]), 7100);
  assert.match(
    lineNames(data, JAN13, [adult(1), elementary(1)]),
    /ファミリー券（共通）/,
  );
});
test("P36 大人2＋小学生1、単独（ファミリー券 6,800円＋大人 5,900円）", () => {
  assert.equal(
    total(onlyShared(dynalandResort, false), JAN13, [adult(2), elementary(1)]),
    12700,
  );
});

// ---------- P-9 ----------
const multi = (data: LiftTicketData, dates: string[], members: SpecMember[]) =>
  calculateLiftTicketPlan(
    data,
    daysInput(
      dates.map(date => ({ date })),
      party(...members),
    ),
  );
test("P37 大人1＋小学生1・2日連続（おとな・こどもパック 2日 18,000円）", () => {
  const plan = multi(
    okushigaResort,
    ["2027-01-18", "2027-01-19"],
    [adult(1), elementary(1)],
  );
  assert.equal(plan.total, 18000);
  assert.equal(plan.perDayTotal, 22000);
  // 仕様: 別々なら 20,500円（大人2日 13,000＋こども2日 7,500）
  const separate = calculateLiftTicketPlan(
    { ...okushigaResort, party_rules: [] },
    daysInput(
      [{ date: "2027-01-18" }, { date: "2027-01-19" }],
      party(adult(1), elementary(1)),
    ),
  );
  assert.equal(separate.total, 20500);
});
test("P38 大人1＋小学生1・3日連続（おとな・こどもパック 3日 26,000円）", () => {
  assert.equal(
    multi(
      okushigaResort,
      ["2027-01-18", "2027-01-19", "2027-01-20"],
      [adult(1), elementary(1)],
    ).total,
    26000,
  );
});
test("P39 大人1＋中学生1・2日連続（おとな・中高生パック 2日 22,000円）", () => {
  assert.equal(
    multi(okushigaResort, ["2027-01-18", "2027-01-19"], [adult(1), junior(1)])
      .total,
    22000,
  );
});
test("P40 大人1＋小学生1＋中学生1・2日連続（29,000円）", () => {
  assert.equal(
    multi(
      okushigaResort,
      ["2027-01-18", "2027-01-19"],
      [adult(1), elementary(1), junior(1)],
    ).total,
    29000,
  );
});
test("P41 大人1＋小学生1・1/18と1/25（パックは使わず 22,000円）", () => {
  const plan = multi(
    okushigaResort,
    ["2027-01-18", "2027-01-25"],
    [adult(1), elementary(1)],
  );
  assert.equal(plan.total, 22000);
  assert.equal(plan.multiDay, null);
});

// ---------- P-10 ----------
const SKI_WEAR = {
  sport: "ski",
  items: ["skis", "ski_boots", "poles", "wear"],
} as const;
const rentalMember = (base: SpecMember): SpecMember => ({
  ...base,
  rental: { sport: "ski", items: [...SKI_WEAR.items] },
});
const withRental = (
  data: LiftTicketData,
  members: SpecMember[],
  today?: string,
) => withRentalOn(data, JAN13, members, { today });
const grand = grandTotal;

test("P42 大人1＋小学生1、2人ともスキーセット＋ウェア（ファミリーパック 10,000円・別々なら 18,500円）", () => {
  const members = [rentalMember(adult(1)), rentalMember(elementary(1))];
  const result = withRental(osorakanFamilyPackResort, members);
  assert.equal(grand(result), 10000);
  assert.equal(result.bundle?.separateTotal ?? 18500, 18500);
  // 仕様: 「1日20枚限定」を出す
  const text = JSON.stringify(result.bundle?.lines ?? []);
  assert.ok(text.includes("1日20枚限定"), "1日20枚限定の表示が無い");
});
test("P43 小学生2、2人ともスキーセット＋ウェア（ファミリーパック 10,000円・別々なら 14,000円）", () => {
  const result = withRental(osorakanFamilyPackResort, [
    rentalMember(elementary(2)),
  ]);
  assert.equal(grand(result), 10000);
  assert.equal(result.bundle?.separateTotal ?? 14000, 14000);
});
test("P44 大人1＋小学生1、レンタルなし（1日券 8,500円・パックは一番上にしない）", () => {
  const result = withRental(osorakanFamilyPackResort, [
    adult(1),
    elementary(1),
  ]);
  assert.equal(result.plan.total, 8500);
  assert.ok(
    !result.plan.days[0].result.lines.some(line => line.partySet != null),
    "パックを使わない",
  );
});
test("P45 大人1＋小学生1、大人だけレンタル（別々 14,500円を一番上、パック 10,000円は安い候補）", () => {
  const result = withRental(osorakanFamilyPackResort, [
    rentalMember(adult(1)),
    elementary(1),
  ]);
  assert.equal(grand(result), 14500);
  // 仕様: 「ファミリーパック 10,000円（子どものスキーセット＋ウェアも付きます）」を安い候補として出す
  const offers = result.bundle?.conditionalOffers ?? [];
  assert.ok(
    offers.some(offer => offer.subtotal === 10000),
    "10,000円の候補が無い",
  );
});

// ---------- P-11 ----------
const EARLY = "2026-11-06";
const LATE = "2026-12-05";
test("P46 大人3、早割期間中（3枚 17,100円）", () => {
  assert.equal(total(bulkBuyResort, JAN13, [adult(3)], EARLY), 17100);
});
test("P47 大人7、早割期間中（5枚 28,000円＋大人2名 13,000円で 41,000円）", () => {
  assert.equal(total(bulkBuyResort, JAN13, [adult(7)], EARLY), 41000);
});
test("P48 大人3、早割期間外（19,500円）", () => {
  assert.equal(total(bulkBuyResort, JAN13, [adult(3)], LATE), 19500);
});
test("P49 大人1・3日連続（まとめ買いは使わない）", () => {
  const plan = multi(
    bulkBuyResort,
    ["2027-01-18", "2027-01-19", "2027-01-20"],
    [adult(1)],
  );
  // 1人の複数日にまとめ買い（人数の券）は使えない。3日券 19,500円
  assert.equal(plan.total, 19500);
  const lines = [
    ...plan.days.flatMap(day => day.result.lines),
    ...(plan.multiDay?.lines ?? []),
  ];
  assert.ok(!lines.some(line => line.partySet != null));
});

// ---------- P-12 ----------
test("P50 大人1＋小学生1、早割期間中（ハッピーセット 6,600円）", () => {
  const plan = price(joetsuResort, JAN13, [adult(1), elementary(1)], EARLY);
  assert.equal(plan.total, 6600);
  assert.match(
    lineNames(joetsuResort, JAN13, [adult(1), elementary(1)], EARLY),
    /ハッピーセット/,
  );
});
test("P51 大人1＋小学生1、2人ともスキーセット、早割期間中（ハッピーレンタルセット 9,600円）", () => {
  const members = [
    {
      ...adult(1),
      rental: {
        sport: "ski" as const,
        items: ["skis" as const, "ski_boots" as const, "poles" as const],
      },
    },
    {
      ...elementary(1),
      rental: {
        sport: "ski" as const,
        items: ["skis" as const, "ski_boots" as const, "poles" as const],
      },
    },
  ];
  const result = withRental(joetsuResort, members, EARLY);
  assert.equal(grand(result), 9600);
});
test("P52 大人1＋2歳（セットは使わない。ジュニアは3歳から）", () => {
  const plan = price(
    joetsuResort,
    JAN13,
    [adult(1), { category: "preschool", count: 1, age: 2 }],
    EARLY,
  );
  assert.ok(
    !plan.days[0].result.lines.some(line => line.partySet != null),
    "セットを使わない",
  );
});
