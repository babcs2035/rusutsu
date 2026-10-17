import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { LiftTicketData, TicketPartyGroup } from "../types";
import { calculateLiftTicket } from "./calculateLiftTicket";

const skill = ".shared/skills/collect-ski-lift-ticket-pricing";

test("収集時の検証は学校区分の欠落を拒否し、正しい学年指定を受け入れる", () => {
  const base = "src/private/data/resorts-temporary/tmp/lift-ticket-validation";
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, "case-"));
  try {
    const data = JSON.parse(
      fs.readFileSync(
        `${skill}/tests/fixtures/valid/yukigaoka-2025-2026.json`,
        "utf8",
      ),
    );
    const target = path.join(dir, "data.json");
    const check = (script = "check-taxonomy.mjs") => {
      fs.writeFileSync(target, JSON.stringify(data));
      return spawnSync(
        process.execPath,
        [`${skill}/scripts/${script}`, target],
        { encoding: "utf8" },
      );
    };
    const valid = check();
    assert.equal(valid.status, 0, valid.stdout + valid.stderr);
    const child = data.audiences.find(
      (a: { id: string }) => a.id === "elementary",
    );
    // 年齢が登録されていても、学校指定を消したデータを合格にしない。
    child.official_label_ja = "こども（小学生、6歳〜12歳）";
    child.age_min = 6;
    child.age_max = 12;
    child.school_levels = [];
    const invalid = check();
    assert.equal(invalid.status, 1);
    assert.match(
      invalid.stdout + invalid.stderr,
      /学校区分が school_levels にありません/,
    );
    child.school_levels = ["elementary_school"];
    const restored = check();
    assert.equal(restored.status, 0, restored.stdout + restored.stderr);
    child.age_min = 4;
    child.age_max = null;
    const schoolAndAge = check("check-lift-ticket-coverage.mjs");
    assert.equal(
      schoolAndAge.status,
      0,
      schoolAndAge.stdout + schoolAndAge.stderr,
    );
    const lookup = (school: string, age: number) => {
      fs.writeFileSync(target, JSON.stringify(data));
      const run = spawnSync(
        process.execPath,
        [
          `${skill}/scripts/lookup-price.mjs`,
          target,
          "--date",
          "2026-01-14",
          "--today",
          "2026-01-14",
          "--school",
          school,
          "--age",
          String(age),
          "--json",
        ],
        { encoding: "utf8" },
      );
      assert.equal(run.status, 0, run.stderr);
      return JSON.parse(run.stdout).filters.resolved_audience_ids;
    };
    assert.ok(!lookup("elementary_school", 3).includes("elementary"));
    assert.deepEqual(lookup("elementary_school", 4), ["elementary"]);
    assert.ok(!lookup("unknown", 65).includes("elementary"));
    child.school_levels = [];
    const ageOnly = check("check-lift-ticket-coverage.mjs");
    assert.equal(ageOnly.status, 1);
    assert.match(ageOnly.stdout + ageOnly.stderr, /年齢区分が重複/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const overlappingSchoolAndAgeData: LiftTicketData = {
  schema_version: "1.0.0",
  resort: { id: "school-age-test" },
  season: { id: "2025-2026", label_ja: "2025-2026シーズン" },
  sources: [],
  audiences: [
    { id: "adult", name_ja: "大人", is_default: true },
    {
      id: "school-child",
      name_ja: "4歳から高校生(18歳)まで",
      age_min: 4,
      age_max: 18,
      school_levels: ["preschool", "high_school"],
    },
    { id: "young", name_ja: "22歳まで", age_max: 22 },
    { id: "infant", name_ja: "3歳以下", age_max: 3 },
  ],
  calendars: [{ id: "all", name_ja: "全日", included_day_types: ["all"] }],
  products: [
    {
      id: "day",
      name_ja: "1日券",
      validity: { mode: "calendar_day", days: 1 },
    },
  ],
  channels: [],
  offers: [
    ["adult", 5500],
    ["school-child", 2000],
    ["young", 3900],
    ["infant", 0],
  ].map(([audience, amount]) => ({
    id: String(audience),
    name_ja: "1日券",
    product_id: "day",
    audience_ids: [String(audience)],
    calendar_ids: ["all"],
    price: { amount: Number(amount) },
  })),
  party_rules: [],
  fees: [],
  data_quality: { status: "needs_review", unresolved_questions: [] },
};

const schoolAgeResult = (group: Omit<TicketPartyGroup, "id" | "count">) =>
  calculateLiftTicket(
    overlappingSchoolAndAgeData,
    {
      visitDate: "2026-01-20",
      usePreference: "full_day",
      party: [{ ...group, id: "person", count: 1 }],
    },
    "day",
  );

test("学校料金の対象年齢が一致しない高校生を若者料金で埋めない", () => {
  for (const group of [
    { category: "high_school", age: 19 },
    { category: "disabled", baseCategory: "high_school", age: 19 },
  ] as const) {
    const result = schoolAgeResult(group);
    assert.equal(result.payableTotal, null);
    assert.match(result.lines[0].note ?? "", /公式の対象条件を確認/);
  }
  assert.equal(
    schoolAgeResult({ category: "high_school", age: 18 }).payableTotal,
    2000,
  );
  assert.equal(
    schoolAgeResult({ category: "university", age: 19 }).payableTotal,
    3900,
  );
});

test("年齢下限未満の未就学児には明記された幼児無料を使える", () => {
  assert.equal(
    schoolAgeResult({ category: "preschool", age: 3 }).payableTotal,
    0,
  );
  assert.equal(
    schoolAgeResult({ category: "preschool", age: 4 }).payableTotal,
    2000,
  );
});
