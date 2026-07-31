import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { LiftTicketData } from "../types";
import { buildLiftTicketPriceTables } from "./priceTable";

const FIXTURES = path.join(
  process.cwd(),
  ".shared/skills/collect-ski-lift-ticket-pricing/tests/fixtures/valid",
);
const REAL = path.join(
  process.cwd(),
  "src/private/data/lift-ticket/megahira-onsen-megahira/tickets/2025-2026.json",
);

const load = (file: string) =>
  JSON.parse(fs.readFileSync(file, "utf8")) as LiftTicketData;

type Table = ReturnType<typeof buildLiftTicketPriceTables>["base"];

const rowOf = (table: Table, label: string) =>
  table.rows.find(row => row.label === label);

/** セル内の金額。日付で変わる券は calendar 名で1件を選ぶ */
const amount = (
  table: Table,
  label: string,
  calendarLabel: string | null,
  audienceLabel: string,
) => {
  const row = rowOf(table, label);
  const audience = table.audiences.find(a => a.label.startsWith(audienceLabel));
  if (!audience) return undefined;
  const entries = row?.cells.get(audience.id)?.entries ?? [];
  const entry =
    calendarLabel == null
      ? entries[0]
      : entries.find(e => e.calendarLabel?.includes(calendarLabel));
  return entry?.amount;
};

test("1券種=1行。日付別の料金は同じセルに並べる", () => {
  // 公式サイトの料金表と同じ見え方（「平日：6,300円 / 土日：6,800円」）。
  // 行を分けると日付で変わらない区分の金額が繰り返され、差が読み取りにくい
  const { base } = buildLiftTicketPriceTables(load(REAL), { scope: "single" });
  const rows = base.rows.filter(row => row.label === "9時間券");
  assert.equal(rows.length, 1, "9時間券が複数行になっている");
  assert.equal(amount(base, "9時間券", "平日", "大人"), 6300);
  assert.equal(amount(base, "9時間券", "土日", "大人"), 6800);
});

test("一部の料金区分の除外日を券種全体の利用不可として表示しない", () => {
  const { base } = buildLiftTicketPriceTables(load(REAL), { scope: "single" });
  const row = rowOf(base, "9時間券");
  assert.ok(row);
  assert.ok(
    row.conditions.every(condition => !/12\/29|1\/3|利用不可/.test(condition)),
    JSON.stringify(row.conditions),
  );
});

test("日付で料金が変わらない区分は日付ラベルを付けない", () => {
  // めがひらの子供料金はシーズン全期間で一律なので「平日：」を付ける意味が無い
  const { base } = buildLiftTicketPriceTables(load(REAL), { scope: "single" });
  const row = rowOf(base, "9時間券");
  const child = base.audiences.find(a => a.label.startsWith("子供"));
  const entries = child ? (row?.cells.get(child.id)?.entries ?? []) : [];
  assert.equal(entries.length, 1);
  assert.equal(entries[0].calendarLabel, null);
  assert.equal(entries[0].amount, 4300);
});

test("全区分で同額ならセルを結合する", () => {
  // 回数券は大人・子供が同額なので、公式サイトと同じく1つの金額として見せる
  const { base } = buildLiftTicketPriceTables(load(REAL), { scope: "single" });
  assert.equal(rowOf(base, "リフト5回券")?.spansAllAudiences, true);
  assert.equal(rowOf(base, "9時間券")?.spansAllAudiences, false);
});

test("券種名に日付区分の接尾辞が残らない", () => {
  const { base } = buildLiftTicketPriceTables(load(REAL), { scope: "single" });
  for (const row of base.rows) {
    assert.ok(
      !/（.*平日.*）$|／平日$/.test(row.label),
      `行ラベルに日付区分が混ざっている: ${row.label}`,
    );
  }
});

test("基本料金の表には条件付きの料金を混ぜない", () => {
  const data = load(path.join(FIXTURES, "yukigaoka-2025-2026.json"));
  const { base, discount } = buildLiftTicketPriceTables(data, {
    scope: "single",
  });
  const offerIds = new Set(
    base.rows.flatMap(row =>
      [...row.cells.values()].flatMap(cell =>
        cell.entries.map(entry => entry.offerId),
      ),
    ),
  );
  for (const id of offerIds) {
    const offer = data.offers.find(o => o.id === id);
    assert.equal(
      (offer?.discount_reasons?.length ?? 0) +
        (offer?.target_qualification ? 1 : 0) +
        (offer?.target_genders ? 1 : 0),
      0,
      `基本料金の表に条件付きofferが入っている: ${id}`,
    );
  }
  assert.ok(discount.rows.length > 0, "割引の表が空になっている");
});

test("差額指定の割引は確定金額として表示する", () => {
  // 「通常料金から1,000円引き」を「要確認」と出しても利用者には意味が無い
  const data = load(path.join(FIXTURES, "yukigaoka-2025-2026.json"));
  const { discount } = buildLiftTicketPriceTables(data, { scope: "single" });
  assert.equal(amount(discount, "道民割引", "平日", "おとな"), 5000);
  assert.equal(amount(discount, "道民割引", "土日祝", "おとな"), 5500);
  assert.equal(amount(discount, "道民割引", "年末年始", "おとな"), 7000 - 1000);
});

test("同じ割引理由でも別のキャンペーンは別の行になる", () => {
  // 「サンフレッチェ応援デー」と「ドラゴンフライズ応援デー」は
  // 券種・割引理由・購入経路が同じだが別のキャンペーン
  const { discount } = buildLiftTicketPriceTables(load(REAL), {
    scope: "single",
  });
  const labels = discount.rows.map(row => row.label);
  assert.ok(new Set(labels).size > 1, JSON.stringify(labels));
  assert.equal(
    new Set(labels).size,
    labels.length,
    `行が重複している: ${labels}`,
  );
});

test("単独券と共通券を分けて表を作れる", () => {
  const data = load(path.join(FIXTURES, "yukigaoka-2025-2026.json"));
  const single = buildLiftTicketPriceTables(data, { scope: "single" });
  const shared = buildLiftTicketPriceTables(data, { scope: "shared" });
  const labels = (t: typeof single) => t.base.rows.map(row => row.label);
  assert.ok(!labels(single).some(l => l.includes("共通")));
  assert.ok(labels(shared).some(l => l.includes("共通")));
});

test("列はその表に金額があった人物区分だけ", () => {
  const { base } = buildLiftTicketPriceTables(load(REAL), { scope: "single" });
  for (const audience of base.audiences) {
    assert.ok(
      base.rows.some(row => row.cells.has(audience.id)),
      `どの行にも金額が無い列がある: ${audience.label}`,
    );
  }
});

test("スキー場固有の分岐を持たない（データだけで表が決まる）", () => {
  // コメント内の例示（「めがひらの子供料金のように」）は分岐ではないので除く。
  // 検出したいのは実装コードにスキー場名やIDが埋め込まれていること
  const source = fs
    .readFileSync(
      path.join(process.cwd(), "src/features/lift-ticket/utils/priceTable.ts"),
      "utf8",
    )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const name of ["megahira", "yukigaoka", "めがひら", "苗場", "かぐら"]) {
    assert.ok(
      !source.includes(name),
      `スキー場名が実装コードに埋め込まれている: ${name}`,
    );
  }
});
