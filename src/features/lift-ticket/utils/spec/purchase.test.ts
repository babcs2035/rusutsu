// 仕様書 W（Web・前売・早割、W01〜W12）、PF（証明が必要な料金、PF01・PF02・PF04）、SP01（特別日）、Z01〜Z03（データの形）
import assert from "node:assert/strict";
import { test } from "node:test";
import type { LiftTicketData, TicketRentalRequest } from "../../types";
import { calculateLiftTicketPlan } from "../calculateLiftTicket";
import { buildLiftTicketPriceTables } from "../priceTable";
import { calculateRentalPlan } from "../rental";
import {
  adult,
  DAY,
  dayInput,
  elementary,
  party,
  type SpecMember,
} from "../testing/specResort";
import {
  childWebFeeResort,
  earlyBirdResort,
  FESTIVAL_DATE,
  festivalResort,
  hoursOnlyResort,
  icDepositResort,
  qrEarlyBirdResort,
  seniorProofResort,
  webAdultOnlyResort,
  webDeadlineResort,
  webExpensiveResort,
  webFeeResortA,
  webFeeResortB,
  webRentalResort,
  webResort,
  webSalesStartResort,
  youngProofResort,
} from "./fixtures/purchase";

const JAN13 = "2027-01-13";
const ONE_MONTH_BEFORE = "2026-12-13";
const plan = (
  data: LiftTicketData,
  members: SpecMember[],
  today = ONE_MONTH_BEFORE,
  date = JAN13,
) =>
  calculateLiftTicketPlan(data, dayInput(date, DAY, party(...members), today));
const lines = (p: ReturnType<typeof plan>) => p.days[0].result.lines;
const warningsOf = (p: ReturnType<typeof plan>) =>
  lines(p).flatMap(line => line.warnings ?? []);

// ---------- W ----------
test("W01 Web 5,500円・窓口 6,000円。照会日は利用日の1か月前（Web購入と表示）", () => {
  const p = plan(webResort, [adult(1)]);
  assert.equal(p.total, 5500);
  assert.ok((lines(p)[0].purchaseNote ?? "").includes("Web"), "Web購入の表示");
});
test("W02 W01で、Webは利用日の前日まで。照会日が利用日の当日は窓口 6,000円", () => {
  assert.equal(plan(webDeadlineResort, [adult(1)], JAN13).total, 6000);
  assert.equal(
    plan(webDeadlineResort, [adult(1)], ONE_MONTH_BEFORE).total,
    5500,
  );
});
test("W03 Webの販売開始が照会日より後（利用日より前）は窓口 6,000円（まだ買えないWeb料金は使わない）", () => {
  const p = plan(webSalesStartResort, [adult(1)], "2026-11-06");
  assert.equal(p.total, 6000);
});
test("W04 早割 4,500円は11/30まで販売。照会日 12/1 は窓口 6,000円（早割は出さない）", () => {
  const p = plan(earlyBirdResort, [adult(1)], "2026-12-01");
  assert.equal(p.total, 6000);
  assert.equal(p.days[0].result.conditionalOffers.length, 0);
  assert.equal(plan(earlyBirdResort, [adult(1)], "2026-11-30").total, 4500);
});
test("W05 Webが窓口より高い（Web 6,200円・窓口 6,000円）は窓口 6,000円", () => {
  assert.equal(plan(webExpensiveResort, [adult(1)]).total, 6000);
});
test("W06 Web料金が大人だけにある。大人＋小学生は大人は Web、小学生は窓口の料金", () => {
  const p = plan(webAdultOnlyResort, [adult(1), elementary(1)]);
  assert.equal(p.total, 5500 + 3000);
  assert.ok((lines(p)[0].purchaseNote ?? "").includes("Web"));
  assert.equal(lines(p)[1].purchaseNote, null);
});
test("W07 Web 5,800円＋1決済100円、窓口 5,900円。大人1名は どちらも 5,900円で窓口を上にする", () => {
  const p = plan(webFeeResortA, [adult(1)]);
  assert.equal(p.total, 5900);
  assert.equal(p.days[0].result.productName, "1日券");
});
test("W08 W07で大人2名は Web 11,700円（窓口 11,800円より安い）", () => {
  // 手数料は1決済につき100円。Web 5,800円×2＋100円
  assert.equal(plan(webFeeResortA, [adult(2)]).total, 11700);
});
test("W09 Webの1枚ごとの手数料 100円。大人2名は Web料金に 200円を足して窓口と比べる", () => {
  // Web 5,500円×2＋200円 = 11,200円（窓口 11,800円より安い）
  const p = plan(webFeeResortB, [adult(2)]);
  assert.equal(p.total, 11200);
});
test("W10 ICカード保証金 500円（新規発行のみ、返却で返金）は 500円を足し、注記する", () => {
  const p = plan(icDepositResort, [adult(1)]);
  assert.equal(p.total, 6500);
  const text = JSON.stringify([p.days[0].result.notes, p.days[0].result.fees]);
  assert.ok(text.includes("返却で返金"), text);
  assert.ok(text.includes("お持ちのカードを使えば不要"), text);
});
test("W11 子ども用Web商品にだけ手数料。大人1＋子ども1の手数料は子どもの分だけ", () => {
  const p = plan(childWebFeeResort, [adult(1), elementary(1)]);
  assert.equal(p.total, 6000 + 3000 + 100);
});
const SKI3: TicketRentalRequest = {
  sport: "ski",
  items: ["skis", "ski_boots", "poles"],
};
const rentalAt = (today: string) =>
  calculateRentalPlan(
    webRentalResort,
    dayInput(JAN13, DAY, party({ ...adult(1), rental: SKI3 }), today),
  );
test("W12 レンタルのWeb予約 4,500円・店頭 5,000円（予約は前日まで）。前日以前は4,500円、当日は5,000円", () => {
  assert.equal(rentalAt(ONE_MONTH_BEFORE).total, 4500);
  assert.equal(rentalAt("2027-01-12").total, 4500);
  assert.equal(rentalAt(JAN13).total, 5000);
});

// ---------- PF ----------
test("PF01 ヤング料金に写真付きの年齢確認書類が必要。22歳はヤング料金＋必要な書類の警告", () => {
  const p = plan(youngProofResort, [adult(1, 22)]);
  assert.equal(p.total, 4500);
  assert.ok(
    warningsOf(p).some(text => text.includes("写真付きの年齢確認書類")),
    JSON.stringify(warningsOf(p)),
  );
});
test("PF02 シニア料金に年齢証明が必要。65歳は警告に出す", () => {
  const p = plan(seniorProofResort, [adult(1, 65)]);
  assert.equal(p.total, 4800);
  assert.ok(
    warningsOf(p).some(text => text.includes("年齢証明")),
    JSON.stringify(warningsOf(p)),
  );
});
test("PF04 早割に「QRコードの提示」が必要は警告に出す", () => {
  const p = plan(qrEarlyBirdResort, [adult(1)]);
  assert.equal(p.total, 4500);
  assert.ok(
    warningsOf(p).some(text => text.includes("QRコード")),
    JSON.stringify(warningsOf(p)),
  );
});

// ---------- SP ----------
test("SP01 単独券の特別日料金が無く共通券のフェスティバル料金だけがある日。単独券で1日は共通券の券名と「この日は単独券の販売がありません」を出す", () => {
  const p = plan(festivalResort, [adult(1)], "2026-11-06", FESTIVAL_DATE);
  const result = p.days[0].result;
  assert.equal(p.total, 7500);
  assert.ok((result.productName ?? "").includes("全山共通1日券"));
  assert.ok(
    JSON.stringify(result.notes).includes("この日は単独券の販売がありません"),
    JSON.stringify(result.notes),
  );
});

// ---------- Z ----------
test("Z01 めがひら型のデータに1日券が作られていない。料金表にも調べた券だけが並ぶ", () => {
  assert.ok(
    !hoursOnlyResort.products.some(
      product => product.validity?.mode === "calendar_day",
    ),
    "1日券が作られている",
  );
  const tables = buildLiftTicketPriceTables(hoursOnlyResort, {
    scope: "single",
    today: "2026-11-06",
  });
  const labels = tables.base.rows.map(row => row.label).sort();
  assert.deepEqual(labels, ["4時間券", "9時間券"]);
});
test("Z02 営業時間不明のデータに 8:00〜17:00 が書き込まれていない", () => {
  const hoursJson = JSON.stringify(hoursOnlyResort.operating_hours);
  assert.ok(!hoursJson.includes("08:00") && !hoursJson.includes("8:00"));
  assert.ok(!hoursJson.includes("17:00"));
  for (const entry of hoursOnlyResort.operating_hours ?? []) {
    assert.equal(entry.start_time, null);
    assert.equal(entry.end_time, null);
  }
});
test.skip("Z03 推定の営業時間に確度と出典が残る（対象外: operating_hours の型に確度・出典の項目が無く、架空データで確かめられない）", () => {});
