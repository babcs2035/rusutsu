import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

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
