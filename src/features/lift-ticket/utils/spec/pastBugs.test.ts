// 仕様書 PB-A〜PB-G（過去の不具合の再発防止、PB01〜PB62の計算で確かめられる行。PB-H 表示・PB-I データ検証は対象外）
// PB-A 人物区分は audience.test.ts、PB-B〜PB-G はこのファイル。PB-A の行は audience.test.ts に ID 付きで実装している
import assert from "node:assert/strict";
import { test } from "node:test";
import { toClientLiftTicketData } from "../../../../lib/publicLiftTicketData";
import type {
  LiftTicketData,
  TicketDayDuration,
  TicketRentalRequest,
} from "../../types";
import { sharedResortsOf } from "../../types";
import {
  calculateLiftTicketForSeasons,
  calculateLiftTicketPlan,
} from "../calculateLiftTicket";
import { buildLiftTicketPriceTables } from "../priceTable";
import { calculateRentalPlan } from "../rental";
import { dataWarningsOf } from "../structureFeatures";
import {
  adult,
  DAY,
  DAY_NIGHT,
  dayInput,
  daysInput,
  elementary,
  hours,
  NIGHT,
  party,
  type SpecMember,
} from "../testing/specResort";
import { adultOnlyPackResort } from "./fixtures/bundle";
import {
  hoursPoolNoDaysResort,
  hoursPoolResort,
  multiDayClosedResort,
  multiDayResort,
} from "./fixtures/multiDay";
import {
  bulkBuyResort,
  familyPackResort,
  familyPackReversedResort,
  sapporoResort,
} from "./fixtures/party";
import {
  allPlusRangeResort,
  cheapNightResort,
  childSharedOnlyResort,
  closedTuesdayResort,
  deadlineDateResort,
  gogoichiResort,
  headcountSetResort,
  holidayRentalResort,
  hoursTicketsOnlyResort,
  ladiesPackResort,
  night18FreeResort,
  nightKindsResort,
  nightOnlyKnownResort,
  noGogglesResort,
  noRentalInfoResort,
  noSoloDayResort,
  osorakanTwoDayResort,
  overlapHoursResort,
  perDayDurationResort,
  pointsOnlyResort,
  poolWithNightResort,
  preschoolPerAdultResort,
  selectableOnlyResort,
  soloMissingDaysResort,
  specialPackResort,
  threeDaysBeforeResort,
  threeKindsResort,
  ticketSetResort,
  unknownHoursPoolResort,
  weekendNightResort,
  yearEndResort,
} from "./fixtures/pastBugs";
import {
  earlyBirdResort,
  hoursOnlyResort,
  webSalesStartResort,
} from "./fixtures/purchase";
import { rentalKindsNoShopBResort } from "./fixtures/rentalKinds";
import { grandTotal, withRental } from "./grand";
import { check, optionsOf } from "./helpers";

const JAN13 = "2027-01-13"; // 水曜
const SKI3: TicketRentalRequest = {
  sport: "ski",
  items: ["skis", "ski_boots", "poles"],
};
const run = (
  data: LiftTicketData,
  date: string,
  duration: TicketDayDuration,
  members: SpecMember[] = [adult(1)],
  today?: string,
) =>
  calculateLiftTicketPlan(
    data,
    dayInput(date, duration, party(...members), today),
  );
const multi = (
  data: LiftTicketData,
  plans: Array<{ date: string; duration?: TicketDayDuration }>,
  members: SpecMember[] = [adult(1)],
  today?: string,
) => calculateLiftTicketPlan(data, daysInput(plans, party(...members), today));
const notesOf = (plan: ReturnType<typeof run>) => [
  ...plan.days[0].result.notes,
  ...(plan.days[0].options?.notes ?? []),
];

// ---------- PB-A（人物区分）は audience.test.ts に PB01〜PB12 として実装 ----------

// ---------- PB-B 滑る長さ・ナイター ----------
test("PB13 温泉特典付き9時間券しかない・7時間は温泉特典付き9時間券（温泉入浴付き）(K07)", () => {
  const data = hoursTicketsOnlyResort;
  const spa = {
    ...data,
    products: data.products
      .filter(product => product.id === "h9")
      .map(product => ({
        ...product,
        name_ja: "温泉入浴付き9時間券",
        included_items: [{ type: "bath", name_ja: "温泉入浴" }],
      })),
    offers: data.offers.filter(offer => offer.product_id === "h9"),
  };
  check(spa, JAN13, hours(7), { primary: "温泉入浴付き9時間券 6300" });
});
test("PB14 ランチパック1日券しかない日・1日はランチパック1日券を1日券として使う (K09)", () => {
  const data = specResortLunch();
  check(data, JAN13, DAY, { primary: "ランチ付き1日券 5500" });
});
test("PB15 ゴゴイチ券（13:00〜17:00）が最安。4時間の一番上は時間帯の決まっていない券、ゴゴイチ券は時間帯が決まっていてもよければに出す", () => {
  const { day: d } = optionsOf(gogoichiResort, JAN13, hours(4));
  const options = d.options;
  assert.equal(options?.primary?.productName, "4時間券");
  assert.ok(
    options?.timeRestricted.some(option => option.productName === "ゴゴイチ券"),
    "ゴゴイチ券が候補に無い",
  );
});
test("PB16 営業時間が未掲載の1日券、25時間券がある。4時間は1日券（25時間券を出さない）", () => {
  check(unknownHoursPoolResort, JAN13, hours(4), { primary: "1日券 6000" });
});
test("PB17 要件を満たす券が無い場合は別の券に置き換えず、理由付きで料金なし", () => {
  const plan = run(pointsOnlyResort, JAN13, hours(4));
  assert.equal(plan.total, null);
  assert.ok(
    notesOf(plan).length > 0 || plan.days[0].result.status !== "complete",
    "理由が無い",
  );
});
test("PB18 通常営業とナイターの時間が重なる。重なりを二重に数えない", () => {
  const plan = run(overlapHoursResort, JAN13, hours(9));
  assert.equal(plan.total, 6300);
  assert.ok(
    !notesOf(plan).join("").includes("この日の営業は"),
    notesOf(plan).join("|"),
  );
});
test("PB18 日中が未掲載でナイターだけ時刻がある。ナイターの時刻で日中を制限しない", () => {
  const plan = run(nightOnlyKnownResort, JAN13, hours(9));
  assert.equal(plan.total, 6300);
  assert.ok(
    !notesOf(plan).join("").includes("この日の営業は4時間"),
    notesOf(plan).join("|"),
  );
});
test("PB19 ナイター券にだけ「18歳ナイター無料」がある。ナイター営業日の1日は1日券の料金を出す", () => {
  const plan = run(night18FreeResort, JAN13, DAY, [adult(1, 18)]);
  assert.equal(plan.total, 6000);
});
test("PB20 ナイター券が日中の券より安い。日中4時間はナイター券を一番上に出さない", () => {
  const { day: d } = optionsOf(cheapNightResort, JAN13, hours(4));
  assert.equal(d.options?.primary?.productName, "4時間券");
});
test("PB21 1日（ナイター無）にナイター専用券を出さない。1日＋ナイターにナイターを含まない券を出さない", () => {
  const noNight = run(nightKindsResort, JAN13, DAY);
  assert.equal(noNight.total, 6000);
  assert.equal(noNight.days[0].result.productName, "1日券");
  const withNight = run(nightKindsResort, JAN13, DAY_NIGHT);
  assert.equal(withNight.total, 8000);
  assert.equal(withNight.days[0].result.productName, "1日券（ナイター付）");
});
test("PB22 ナイター営業が無い日に1日＋ナイターは1日の料金＋「この日はナイター営業がありません」(B06)", () => {
  const plan = run(weekendNightResort, JAN13, DAY_NIGHT);
  assert.equal(plan.total, 6000);
  assert.ok(
    notesOf(plan).some(text =>
      text.includes("この日はナイター営業がありません"),
    ),
    notesOf(plan).join("|"),
  );
});
test("PB23 1日券が無い施設で1日はいちばん長い時間券 (D01)", () => {
  const plan = run(hoursTicketsOnlyResort, JAN13, DAY);
  assert.equal(plan.total, 6300);
  assert.equal(plan.days[0].result.productName, "9時間券");
});
test("PB24 「該当する券が公式料金データにありません」と出た入力（1日・1日＋ナイター・N時間）は料金が出る", () => {
  for (const duration of [DAY, DAY_NIGHT, hours(5), hours(9)]) {
    const plan = run(hoursTicketsOnlyResort, JAN13, duration);
    assert.notEqual(plan.total, null, JSON.stringify(duration));
  }
  assert.equal(NIGHT.kind, "night");
});
test("PB25 営業時間不明で1日券が無い。1日は9時間券＋「営業時間不明のため8:00〜17:00と仮定」(D04)", () => {
  const plan = run(hoursOnlyResort, JAN13, DAY);
  assert.equal(plan.total, 6300);
  assert.ok(
    notesOf(plan).some(text =>
      text.includes("営業時間不明のため8:00〜17:00と仮定"),
    ),
    notesOf(plan).join("|"),
  );
});

// ---------- PB-C 日付・定休日・営業期間 ----------
test("PB26 毎週火曜定休（12/30は営業）。火曜は料金なし、12/30（火）は料金あり、水曜は料金あり", () => {
  const today = "2025-11-06";
  const tuesday = run(
    closedTuesdayResort,
    "2026-01-13",
    DAY,
    [adult(1)],
    today,
  );
  assert.equal(tuesday.total, null);
  assert.equal(tuesday.days[0].result.status, "closed");
  assert.equal(
    run(closedTuesdayResort, "2025-12-30", DAY, [adult(1)], today).total,
    6000,
  );
  assert.equal(
    run(closedTuesdayResort, "2025-12-31", DAY, [adult(1)], today).total,
    6000,
  );
});
test("PB27 営業期間の前日・翌日、休業日は料金なし＋理由。日程に定休日があれば合計に含めない", () => {
  const today = "2025-11-06";
  for (const date of ["2025-11-30", "2026-05-07"]) {
    const plan = run(closedTuesdayResort, date, DAY, [adult(1)], today);
    assert.equal(plan.total, null, date);
    assert.equal(plan.days[0].result.status, "outside_season");
  }
  // 1/12（月・営業）と1/13（火・定休）。休業日は合計に含めず、営業日の 6,000円だけ
  const plan = multi(
    closedTuesdayResort,
    [{ date: "2026-01-12" }, { date: "2026-01-13" }],
    [adult(1)],
    today,
  );
  assert.equal(plan.total, 6000);
});
test("PB28 12/29〜1/3（平日の曜日）は休日料金。「利用不可」にしない", () => {
  for (const date of [
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-03",
  ]) {
    const plan = run(yearEndResort, date, DAY);
    assert.equal(plan.total, 7000, date);
    assert.equal(plan.days[0].result.status, "complete", date);
  }
  assert.equal(run(yearEndResort, JAN13, DAY).total, 6000);
});
test("PB29 カレンダーに「全日」と期間を両方書いたデータは、収集時の検証で警告する", () => {
  // 仕様書 PB29: 計算で救わず、保存前のデータ検証で「全日＋期間」の併記をエラーにする
  assert.ok(dataWarningsOf(allPlusRangeResort).length > 0);
});
test("PB30 早割（11/30まで販売）。照会日12/1・利用日1月は早割を使わない (W04)", () => {
  assert.equal(
    run(earlyBirdResort, JAN13, DAY, [adult(1)], "2026-12-01").total,
    6000,
  );
});
test("PB31 「利用日の3日前まで」の券。照会日が利用日の2日前は使わない", () => {
  assert.equal(
    run(threeDaysBeforeResort, JAN13, DAY, [adult(1)], "2027-01-11").total,
    6000,
  );
  assert.equal(
    run(threeDaysBeforeResort, JAN13, DAY, [adult(1)], "2027-01-10").total,
    5500,
  );
});
test("PB32 販売開始前のWeb・前売・親子パックは窓口の料金", () => {
  assert.equal(
    run(webSalesStartResort, JAN13, DAY, [adult(1)], "2026-11-06").total,
    6000,
  );
  // 親子パック（販売開始前）
  const pack = calculateLiftTicketPlan(
    {
      ...familyPackResort,
      party_rules: familyPackResort.party_rules.map(rule => ({
        ...rule,
        sales_period: { start: "2026-12-01" },
        // Web専用の親子パック（窓口では買えない）
        channel_ids: ["web"],
      })),
    },
    dayInput(JAN13, DAY, party(adult(1), elementary(1)), "2026-11-06"),
  );
  assert.equal(pack.total, 9500);
});
test("PB33 「前日までに購入」のスペシャルパック。照会日が利用日の当日は使わない", () => {
  const plan = run(specialPackResort, JAN13, DAY, [adult(1)], JAN13);
  assert.equal(plan.total, 6000);
  assert.equal(plan.days[0].result.productName, "1日券");
});
test("PB34 購入期限が日数・日付で書かれた券は、購入期限で買えるかを判定する", () => {
  assert.equal(
    run(deadlineDateResort, JAN13, DAY, [adult(1)], "2026-12-20").total,
    5500,
  );
  assert.equal(
    run(deadlineDateResort, JAN13, DAY, [adult(1)], "2026-12-21").total,
    6000,
  );
  assert.equal(
    run(threeDaysBeforeResort, JAN13, DAY, [adult(1)], "2027-01-10").total,
    5500,
  );
  assert.equal(
    run(threeDaysBeforeResort, JAN13, DAY, [adult(1)], "2027-01-11").total,
    6000,
  );
});

// ---------- PB-D 複数日・時間を使い切る券 ----------
test("PB35 選択日券（不連続可）・25時間券しか無い。2日連続は連続2日券として扱わず、選択日券として計算する", () => {
  const plan = multi(selectableOnlyResort, [
    { date: "2027-01-18" },
    { date: "2027-01-19" },
  ]);
  assert.notEqual(plan.multiDay?.kind, "consecutive_days");
  assert.equal(plan.total, 11000);
});
test("PB36 25時間券＋トップアップ。4日×5時間は25時間券、6日×5時間は25時間券＋トップアップ (T02・T03)", () => {
  const four = multi(
    hoursPoolResort,
    ["2027-01-18", "2027-01-19", "2027-01-20", "2027-01-21"].map(date => ({
      date,
      duration: hours(5),
    })),
  );
  assert.equal(four.total, 39000);
  assert.equal(four.multiDay?.kind, "hours_pool");
  const six = multi(
    hoursPoolResort,
    [18, 19, 20, 21, 22, 23].map(n => ({
      date: `2027-01-${n}`,
      duration: hours(5),
    })),
  );
  assert.equal(six.total, 46300);
  assert.equal(six.multiDay?.addOns.length, 1);
});
test("PB37 時間不明の日（1日・ナイター込み）が混ざる4日間は、その日は1日券で買い、残りを25時間券でまかなう案も比べる", () => {
  const plan = multi(poolWithNightResort, [
    { date: "2027-01-18", duration: DAY_NIGHT },
    ...[19, 20, 21].map(n => ({ date: `2027-01-${n}`, duration: hours(5) })),
  ]);
  // 1日券 16,700円＋25時間券 39,000円（5時間券×3の 43,500円より安い）
  assert.equal(plan.total, 55700);
  assert.equal(plan.multiDay?.kind, "hours_pool");
});
test("PB38 2日券を使う日に木曜レディースDAYがある。1日ずつ買ってレディースDAYを使う案を条件付きで出す (L13)", () => {
  const plan = multi(
    multiDayResort,
    [20, 21, 22].map(n => ({ date: `2027-01-${n}` })),
  );
  assert.ok(
    plan.multiDay?.conditionalOffers.some(offer => offer.subtotal === 14000),
    "14,000円の条件付き候補が無い",
  );
});
test("PB39 一覧・比較画面で大人1名・1日は詳細と同じ計算結果（25時間券や33,000円を出さない）", () => {
  const input = dayInput("2027-01-18", DAY, party(adult(1)));
  const detail = calculateLiftTicketPlan(hoursPoolResort, input);
  const list = calculateLiftTicketForSeasons([hoursPoolResort], input);
  assert.equal(detail.total, 16700);
  assert.equal(list?.payableTotal, detail.total);
  assert.equal(list?.productName, detail.days[0].result.productName);
});
test("PB40 2〜10日券（シーズン中に不連続で使える）。1/18と1/25は2日券を使える", () => {
  const plan = multi(multiDayResort, [
    { date: "2027-01-18" },
    { date: "2027-01-25" },
  ]);
  assert.equal(plan.total, 11000);
  assert.equal(plan.multiDay?.kind, "ticket_set");
});
test("PB41 恐羅漢。2日連続は通常の2日券を選ぶ", () => {
  const plan = multi(osorakanTwoDayResort, [
    { date: "2027-01-18" },
    { date: "2027-01-19" },
  ]);
  assert.equal(plan.total, 10500);
  assert.equal(plan.multiDay?.productName, "2日券");
});
test("PB42 恐羅漢。2日連続で会員2日券・女性の 7,500円がある場合は条件付き候補として、より安い組み合わせを出す", () => {
  const plan = multi(osorakanTwoDayResort, [
    { date: "2027-01-18" },
    { date: "2027-01-19" },
  ]);
  assert.ok(
    plan.multiDay?.conditionalOffers.some(offer => offer.subtotal === 7500),
    "7,500円の条件付き候補が無い",
  );
});
test("PB43 青森スプリング。5日間は全日券5枚セットが候補に出る", () => {
  const plan = multi(
    ticketSetResort,
    [18, 19, 20, 21, 22].map(n => ({ date: `2027-01-${n}` })),
  );
  assert.equal(plan.multiDay?.kind, "ticket_set");
  assert.equal(plan.total, 40000);
});
test("PB44 複数日で、日ごとに「1日」「1日＋ナイター」「N時間」を変えると指定どおりに計算する (M02)", () => {
  const plan = multi(perDayDurationResort, [
    { date: "2027-01-13", duration: DAY },
    { date: "2027-01-15", duration: DAY_NIGHT },
    { date: "2027-01-17", duration: hours(3) },
  ]);
  assert.equal(plan.total, 6000 + 7500 + 3500);
  assert.deepEqual(
    plan.days.map(day => day.result.payableTotal),
    [6000, 7500, 3500],
  );
});

// ---------- PB-E 同行者ルール ----------
test("PB45 親子パックのあるデータを公開用データに変換して計算しても親子パックが当たる（components・exclusive_group_id を捨てない）", () => {
  const converted = toClientLiftTicketData(familyPackResort);
  const plan = calculateLiftTicketPlan(
    converted,
    dayInput(JAN13, DAY, party(adult(1), elementary(1))),
  );
  assert.equal(plan.total, 8500);
  const bulk = toClientLiftTicketData(bulkBuyResort);
  const exclusive = calculateLiftTicketPlan(
    bulk,
    dayInput(JAN13, DAY, party(adult(7)), "2026-11-06"),
  );
  assert.equal(exclusive.total, 41000);
});
test("PB46 大人1名につき未就学児1名無料。大人1＋未就学1は1名無料、大人1＋未就学2は1名だけ無料、大人2＋未就学2は2名無料", () => {
  const preschool = (count: number): SpecMember => ({
    category: "preschool",
    count,
    age: 4,
  });
  const total = (members: SpecMember[]) =>
    run(preschoolPerAdultResort, JAN13, DAY, members).total;
  assert.equal(total([adult(1), preschool(1)]), 6000);
  assert.equal(total([adult(1), preschool(2)]), 6000 + 2000);
  assert.equal(total([adult(2), preschool(2)]), 12000);
});
test("PB47 人数別セット（5人・2人）。7人は5人セット＋2人セット、子ども6人は上限を超えた分は通常料金", () => {
  const kids = (count: number): SpecMember => elementary(count);
  const seven = run(headcountSetResort, JAN13, DAY, [kids(7)]);
  assert.equal(seven.total, 10000 + 3500);
  const six = run(headcountSetResort, JAN13, DAY, [kids(6)]);
  assert.equal(six.total, 10000 + 3000);
});
test("PB48 同じ区分を2行に分けて入力（レンタルありの小学生と、なし）は1行にまとめたときと同じ親子パックの内訳", () => {
  const split = run(familyPackResort, JAN13, DAY, [
    { ...adult(1), rental: SKI3 },
    adult(1),
    { ...elementary(1), rental: SKI3 },
    elementary(1),
  ]);
  const merged = run(familyPackResort, JAN13, DAY, [adult(2), elementary(2)]);
  assert.equal(split.total, merged.total);
  const members = (plan: typeof split) =>
    plan.days[0].result.lines.find(line => line.partySet)?.partySet?.members;
  assert.equal(members(split), members(merged));
});
test("PB49 親子パック＋未就学児（無料）は パック×n＋残りの人の料金。無料の子はパックの人数に数えない", () => {
  const plan = run(familyPackResort, JAN13, DAY, [
    adult(2),
    elementary(2),
    { category: "preschool", count: 2, age: 4 },
  ]);
  assert.equal(plan.total, 17000);
  const pack = plan.days[0].result.lines.find(line => line.partySet);
  assert.ok(
    !(pack?.partySet?.members ?? "").includes("未就学"),
    pack?.partySet?.members ?? "",
  );
});
test("PB50 親子パックを適用したら「大人1名＋小学生1名」と表示する", () => {
  const plan = run(sapporoResort, JAN13, DAY, [adult(1), elementary(1)]);
  const pack = plan.days[0].result.lines.find(line => line.partySet);
  assert.equal(pack?.partySet?.members, "大人1名＋小学生1名");
});
test("PB51 ファミリーパックの並び順を変えても同じ結果 (P08)", () => {
  const members = [adult(3), elementary(2)];
  assert.equal(
    run(familyPackReversedResort, JAN13, DAY, members).total,
    run(familyPackResort, JAN13, DAY, members).total,
  );
  assert.equal(run(familyPackReversedResort, JAN13, DAY, members).total, 22500);
});

// ---------- PB-F 共通券・単独券 ----------
test("PB52 単独の通常1日券が無く、リフト＋レンタルのパックがある。1日・レンタルなしは共通1日券（パックを出さない）", () => {
  const plan = run(noSoloDayResort, JAN13, DAY);
  assert.equal(plan.total, 6500);
  assert.equal(plan.days[0].result.productName, "共通1日券");
});
test("PB53 単独券が無い、または一部の区分が共通券にしか無い場合は共通券で料金を出す", () => {
  const onlyShared = {
    ...noSoloDayResort,
    products: noSoloDayResort.products.filter(
      product => product.id === "shared-day",
    ),
    offers: noSoloDayResort.offers.filter(
      offer => offer.product_id === "shared-day",
    ),
  };
  assert.equal(run(onlyShared, JAN13, DAY).total, 6500);
  // 大人は単独券もあるが、小学生は共通券にしか無い
  const mixed = run(childSharedOnlyResort, JAN13, DAY, [
    adult(1),
    elementary(1),
  ]);
  assert.equal(mixed.total, 6400 + 4200);
});
test("PB54 単独券が売られていない5/4は共通券で料金を出す", () => {
  const plan = run(soloMissingDaysResort, "2027-05-04", DAY);
  assert.equal(plan.total, 7500);
  assert.equal(plan.days[0].result.productName, "1日券（共通）");
  assert.equal(run(soloMissingDaysResort, "2027-05-03", DAY).total, 7000);
});
test("PB55 単独券・2か所共通・多数共通がある施設は、3つを区別して表示し、切り替えられる", () => {
  const partners = sharedResortsOf(threeKindsResort.products);
  assert.deepEqual(partners.map(partner => partner.resortId).sort(), [
    "other-resort",
    "r-a",
    "r-b",
    "r-c",
  ]);
  const single = buildLiftTicketPriceTables(threeKindsResort, {
    scope: "single",
    today: "2026-11-06",
  });
  const shared = buildLiftTicketPriceTables(threeKindsResort, {
    scope: "shared",
    today: "2026-11-06",
  });
  assert.deepEqual(
    single.base.rows.map(row => row.label),
    ["1日券"],
  );
  assert.equal(shared.base.rows.length, 2);
  assert.notEqual(
    shared.base.rows[0].label,
    shared.base.rows[1].label,
    "2か所共通と多数共通が区別されていない",
  );
});
test.skip("PB56 共通券の相手のスキー場ID（対象外: 実データ全体の検証で、架空スキー場の計算では確かめられない）", () => {});

// ---------- PB-G レンタル・セット券 ----------
test("PB57 木曜・レンタル付きセット券は、レディースDAYの1日券（2,000円）をセット券の料金に混ぜない", () => {
  const result = withRental(ladiesPackResort, "2027-01-21", [
    { ...adult(1), rental: SKI3 },
  ]);
  assert.equal(grandTotal(result), 8000);
  assert.equal(result.bundle?.lines[0]?.subtotal, 8000);
});
test("PB58 料金表に無いゴーグルを選ぶと合計は出し、「＋ゴーグル（料金なし）」と注記する", () => {
  const rental = calculateRentalPlan(
    noGogglesResort,
    dayInput(
      JAN13,
      DAY,
      party({
        ...adult(1),
        rental: {
          sport: "ski",
          items: ["skis", "ski_boots", "poles", "goggles"],
        },
      }),
    ),
  );
  assert.equal(rental.total, 4500);
  assert.ok(
    rental.missingLabels.some(label => label.includes("ゴーグル")),
    JSON.stringify(rental.missingLabels),
  );
});
test("PB59 12/29・スキーセットはレンタルが表示され、合計に含まれる", () => {
  const rental = calculateRentalPlan(
    holidayRentalResort,
    dayInput("2026-12-29", DAY, party({ ...adult(1), rental: SKI3 })),
  );
  assert.equal(rental.total, 5500);
  assert.equal(rental.lines.length, 1);
  const result = withRental(holidayRentalResort, "2026-12-29", [
    { ...adult(1), rental: SKI3 },
  ]);
  assert.equal(grandTotal(result), 6000 + 5500);
});
test("PB60 リフト＋レンタルのセット割引がある場合は計算に反映する (BN01〜BN06)", () => {
  const result = withRental(adultOnlyPackResort, JAN13, [
    { ...adult(1), rental: SKI3 },
    { ...elementary(1), rental: SKI3 },
  ]);
  assert.equal(grandTotal(result), 14500);
  assert.ok((result.bundle?.savings ?? 0) > 0);
});
test("PB61 レンタル情報が無い施設は「レンタル料金の情報がありません」（検索画面の条件の引き継ぎは画面で確認するため対象外）", () => {
  const rental = calculateRentalPlan(
    noRentalInfoResort,
    dayInput(JAN13, DAY, party({ ...adult(1), rental: SKI3 })),
  );
  assert.equal(rental.status, "not_collected");
  assert.equal(rental.total, null);
});
test.skip("PB62 年度表記の無いレンタル料金ページでも収集を止めない（対象外: 収集スキルのテストで確認する項目で、計算では確かめられない）", () => {});

void rentalKindsNoShopBResort;
void hoursPoolNoDaysResort;
void multiDayClosedResort;

function specResortLunch(): LiftTicketData {
  return {
    ...hoursTicketsOnlyResort,
    products: [
      {
        id: "lunch",
        name_ja: "ランチ付き1日券",
        validity: { mode: "calendar_day", days: 1 },
        covers_hours_types: ["regular"],
        included_items: [{ type: "meal", name_ja: "食事券1,000円分" }],
      },
    ],
    offers: [
      {
        id: "lunch-adult",
        name_ja: "ランチ付き1日券",
        product_id: "lunch",
        audience_ids: ["adult"],
        calendar_ids: [hoursTicketsOnlyResort.calendars[0].id],
        channel_ids: ["window"],
        price: { currency: "JPY", amount: 5500 },
        source_refs: ["src"],
      },
    ],
  };
}
