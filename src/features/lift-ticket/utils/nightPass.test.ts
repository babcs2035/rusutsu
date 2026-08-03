import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { LiftTicketData } from "../types";
import { calculateDayPassResult } from "./calculateLiftTicket";

/**
 * 「1日券（ナイター無）」「ナイター単独券
 * （fixed_time_window + covers_hours_types: ["night"]）」
 * だけを持つ、日券にナイターが含まれない架空データ。
 * ①（ナイター込み1日券）を経由せず②（1日券＋ナイター単独券の合算）を検証するために作る。
 */
const NIGHT_TICKET_ONLY: LiftTicketData = {
  schema_version: "1.0.0",
  resort: { id: "night-test-resort" },
  season: {
    id: "2025-2026",
    label_ja: "2025-2026シーズン",
    start_date: "2026-01-01",
    end_date: "2026-03-31",
  },
  sources: [],
  operating_hours: [
    {
      id: "oh-regular",
      hours_type: "regular",
      calendar_ids: ["cal-all"],
      start_time: "08:00",
      end_time: "16:00",
    },
    {
      id: "oh-night",
      hours_type: "night",
      calendar_ids: ["cal-night"],
      start_time: "16:00",
      end_time: "20:00",
    },
  ],
  audiences: [{ id: "adult", name_ja: "大人" }],
  calendars: [
    {
      id: "cal-all",
      name_ja: "シーズン全日",
      included_date_ranges: [{ start: "2026-01-01", end: "2026-03-31" }],
    },
    {
      id: "cal-night",
      name_ja: "ナイター営業日",
      included_dates: ["2026-02-01"],
    },
  ],
  products: [
    {
      id: "day",
      name_ja: "1日券",
      validity: { mode: "calendar_day", days: 1 },
      covers_hours_types: ["regular"],
    },
    {
      id: "night",
      name_ja: "ナイター券",
      validity: {
        mode: "fixed_time_window",
        start_time: "16:00",
        end_time: "20:00",
      },
      covers_hours_types: ["night"],
    },
  ],
  channels: [],
  offers: [
    {
      id: "offer-day",
      name_ja: "1日券",
      product_id: "day",
      audience_ids: ["adult"],
      calendar_ids: ["cal-all"],
      price: { amount: 5000 },
    },
    {
      id: "offer-night",
      name_ja: "ナイター券",
      product_id: "night",
      audience_ids: ["adult"],
      calendar_ids: ["cal-night"],
      price: { amount: 1500 },
    },
  ],
  party_rules: [],
  fees: [],
  data_quality: { status: "complete", unresolved_questions: [] },
};

const PARTY = [{ id: "a", category: "adult" as const, age: null, count: 1 }];

test("ナイター営業が無い日は1日（ナイター無）と同じ結果になり、その旨が明示される", () => {
  const result = calculateDayPassResult(NIGHT_TICKET_ONLY, {
    visitDate: "2026-01-05",
    usePreference: "full_day",
    party: PARTY,
  });
  assert.equal(result.productName, "1日券");
  assert.equal(result.payableTotal, 5000);
  assert.match(result.notes.join(""), /ナイター営業がありません/);
});

test("ナイター営業日で、ナイター込み1日券が無ければ1日券とナイター単独券を合算する", () => {
  const result = calculateDayPassResult(NIGHT_TICKET_ONLY, {
    visitDate: "2026-02-01",
    usePreference: "full_day",
    party: PARTY,
  });
  assert.equal(result.payableTotal, 6500, "5000円の1日券 + 1500円のナイター券");
  assert.equal(result.productName, "1日券＋ナイター券");
  assert.equal(result.lines.length, 2, "1日券とナイター券、それぞれの行が並ぶ");
  assert.ok(
    result.lines.some(line => line.groupLabel.includes("ナイター")),
    "ナイター側の行だと区別できるラベルが付く",
  );
  assert.match(result.notes.join(""), /1日券とナイター券の合算/);
});

const MEGAHIRA = path.join(
  process.cwd(),
  "src/private/data/lift-ticket/megahira-onsen-megahira/tickets/2025-2026.json",
);
const megahira = JSON.parse(
  fs.readFileSync(MEGAHIRA, "utf8"),
) as LiftTicketData;

test("ナイター営業日でもナイター単独券の料金が資料に無ければ1日券のみの料金にする（めがひら実データ）", () => {
  // 2026-02-28 はめがひらのナイター営業日。1日券は無く最長9時間券で代替されるが、
  // ナイター単独券（covers_hours_types: ["night"]）も資料に無いので
  // 推測せず9時間券のみにする
  const result = calculateDayPassResult(megahira, {
    visitDate: "2026-02-28",
    usePreference: "full_day",
    party: [{ id: "a", category: "adult", age: 30, count: 1 }],
  });
  assert.equal(result.productName, "リフト9時間券");
  assert.equal(result.payableTotal, 6800);
  assert.match(
    result.notes.join(""),
    /ナイター単独券の料金が公式資料に記載されていない/,
  );
});
