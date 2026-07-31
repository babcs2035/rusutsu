#!/usr/bin/env node
/**
 * run-tests.mjs — Skillの検証スクリプトのテストランナー
 *
 * - fixtures/valid/*.json    … 3スクリプトすべてで exit 0 になること
 * - fixtures/invalid/*.json  … ファイル名のプレフィックスで指定された
 *                              スクリプトが exit 非0 になること
 *     schema-*   → validate-lift-ticket.mjs が失敗する
 *     taxonomy-* → check-taxonomy.mjs が失敗する
 *     coverage-* → check-lift-ticket-coverage.mjs が失敗する
 *   （プレフィックスより前段のスクリプトは通過することも確認する。
 *     例: coverage-* は schema / taxonomy を通過しなければならない）
 *
 * --with-capture を付けると、Playwrightで fixtures/capture/price-page.html を
 * file:// URL経由で取得し、manifest / page.html / visible-text / screenshot が
 * 生成されることを確認する（要 playwright ブラウザ）。
 *
 * 使い方: node run-tests.mjs [--with-capture]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.dirname(TESTS_DIR);
const SCRIPTS = {
  schema: path.join(SKILL_DIR, "scripts", "validate-lift-ticket.mjs"),
  taxonomy: path.join(SKILL_DIR, "scripts", "check-taxonomy.mjs"),
  coverage: path.join(SKILL_DIR, "scripts", "check-lift-ticket-coverage.mjs"),
};
const ORDER = ["schema", "taxonomy", "coverage"];

const withCapture = process.argv.includes("--with-capture");

let passed = 0;
let failed = 0;
const failures = [];

function run(scriptPath, args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
  });
}

function assert(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    failures.push({ name, detail });
    console.error(`  FAIL ${name}\n${detail ?? ""}`);
  }
}

function listFixtures(kind) {
  const dir = path.join(TESTS_DIR, "fixtures", kind);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f));
}

console.log("== ラベル体系の健全性（skill自体の検査） ==");
{
  const INTEGRITY = path.join(SKILL_DIR, "scripts", "check-taxonomy-integrity.mjs");
  const result = run(INTEGRITY, []);
  assert(
    "check-taxonomy-integrity が通る（schemaのenumとtaxonomyの一致・全群が検証対象）",
    result.status === 0,
    `${result.stdout}${result.stderr}`,
  );
  // 全ラベルの定義が揃ったので --strict を既定にする。
  // 以後ラベルを足して定義を書き忘れた瞬間にここで落ちる
  const strict = run(INTEGRITY, ["--strict"]);
  assert(
    "--strict でも通る（定義が未記入のラベルが1件も無い）",
    strict.status === 0,
    `${strict.stdout}${strict.stderr}`.split("\n").slice(0, 3).join("\n"),
  );

  // 定義済みラベルの品質
  const taxonomy = JSON.parse(
    fs.readFileSync(path.join(SKILL_DIR, "references", "taxonomy.json"), "utf8"),
  );
  const school = taxonomy.groups?.school_levels?.labels ?? {};
  assert(
    "school_levels が6区分＋unknown（細分類も other も持たない）",
    Object.keys(school).join(",") ===
      "preschool,elementary_school,junior_high_school,high_school,university,graduate,unknown",
    Object.keys(school).join(","),
  );
  assert(
    "school_levels 全ラベルに定義がある",
    Object.values(school).every((d) => d.status === "defined" && d.definition_ja),
    JSON.stringify(Object.entries(school).filter(([, d]) => d.status !== "defined").map(([k]) => k)),
  );
  assert(
    "大学生の判断規則に公式表記の範囲確認が書かれている",
    /範囲を必ず確認/.test(school.university?.decision_rule_ja ?? ""),
    school.university?.decision_rule_ja,
  );
  assert(
    "6区分外の学校区分は human_review_required で人間へ通知する規則になっている",
    /human_review_required/.test(school.university?.decision_rule_ja ?? ""),
    school.university?.decision_rule_ja,
  );
  assert(
    "併用可否の語彙が stacking_modes に統一されている",
    Object.keys(taxonomy.groups?.stacking_modes?.labels ?? {}).join(",") ===
      "stackable,not_stackable,unknown",
    Object.keys(taxonomy.groups?.stacking_modes?.labels ?? {}).join(","),
  );
}

console.log("== 正常fixture: 3スクリプトすべて通過すること ==");
for (const file of listFixtures("valid")) {
  const base = path.basename(file);
  for (const key of ORDER) {
    const result = run(SCRIPTS[key], [file]);
    assert(
      `valid/${base} × ${key}`,
      result.status === 0,
      `${result.stdout}${result.stderr}`,
    );
  }
}

console.log("== 異常fixture: 指定スクリプトで失敗すること ==");
for (const file of listFixtures("invalid")) {
  const base = path.basename(file);
  const expected = ORDER.find((key) => base.startsWith(`${key}-`));
  if (!expected) {
    assert(`invalid/${base}`, false, "ファイル名が schema-/taxonomy-/coverage- で始まっていません");
    continue;
  }
  for (const key of ORDER) {
    const result = run(SCRIPTS[key], [file]);
    if (key === expected) {
      assert(
        `invalid/${base} × ${key} → 失敗する`,
        result.status !== 0,
        `exit 0 になってしまいました\n${result.stdout}${result.stderr}`,
      );
      break; // 前段（expectedより前）は通過確認済み、後段は対象外
    }
    assert(
      `invalid/${base} × ${key} → 通過する（前段）`,
      result.status === 0,
      `${result.stdout}${result.stderr}`,
    );
  }
}

console.log("== 日付の判定（calendar_type 廃止・年末年始の落とし穴） ==");
{
  const taxonomy = JSON.parse(
    fs.readFileSync(path.join(SKILL_DIR, "references", "taxonomy.json"), "utf8"),
  );
  const F = path.join(TESTS_DIR, "fixtures", "valid", "yukigaoka-2025-2026.json");
  const data = JSON.parse(fs.readFileSync(F, "utf8"));

  assert(
    "calendar_types 群が廃止されている（day_types等から導出でき、実データで恣意的だった）",
    taxonomy.groups.calendar_types === undefined,
  );
  assert(
    "calendar_type フィールドがどのカレンダーにも残っていない",
    data.calendars.every((c) => !("calendar_type" in c)),
    JSON.stringify(data.calendars.filter((c) => "calendar_type" in c).map((c) => c.id)),
  );
  assert(
    "calendar の包含フィールドは included_* に統一されている",
    data.calendars.every(
      (c) =>
        !("day_types" in c) &&
        !("dates" in c) &&
        !("date_ranges" in c) &&
        Array.isArray(c.included_day_types) &&
        Array.isArray(c.included_dates) &&
        Array.isArray(c.included_date_ranges) &&
        Array.isArray(c.excluded_dates) &&
        Array.isArray(c.excluded_date_ranges),
    ),
    JSON.stringify(data.calendars),
  );

  const day = taxonomy.groups.day_types.labels;
  assert(
    "day_types 全13ラベルに定義がある（個別曜日を含む）",
    Object.keys(day).length === 13 &&
      Object.values(day).every((d) => d.status === "defined" && d.definition_ja),
    JSON.stringify(Object.keys(day)),
  );
  assert(
    "weekday の判断規則に「年末年始を含んでしまう」警告がある",
    /年末年始を含んでしまう/.test(day.weekday?.decision_rule_ja ?? ""),
    day.weekday?.decision_rule_ja,
  );
  assert(
    "year_end_new_year は単独では一致しないと定義されている",
    /単独では日付に一致しない/.test(day.year_end_new_year?.definition_ja ?? "") &&
      /推測して書いてはいけない/.test(day.year_end_new_year?.decision_rule_ja ?? ""),
    JSON.stringify(day.year_end_new_year),
  );
  assert(
    "群の注記に年末年始の落とし穴が最重要として書かれている",
    /最重要の落とし穴/.test(taxonomy.groups.day_types.notes_ja ?? ""),
    taxonomy.groups.day_types.notes_ja?.slice(0, 80),
  );

  // 営業時間帯の語彙は1群に統合した。operating_hours と products で
  // regular / night / early_morning が完全に重複していて、片方だけ増やすと食い違った
  const oh = taxonomy.groups.hours_bands.labels;
  assert(
    "operating_hours_types / covers_hours_types が hours_bands に統合されている",
    taxonomy.groups.operating_hours_types === undefined &&
      taxonomy.groups.covers_hours_types === undefined &&
      taxonomy.groups.hours_bands !== undefined,
    JSON.stringify(Object.keys(taxonomy.groups)),
  );
  assert(
    "hours_bands が5ラベル（特別営業は廃止）で全て定義済み",
    Object.keys(oh).length === 5 &&
      oh.special === undefined &&
      Object.values(oh).every((d) => d.status === "defined" && d.definition_ja),
    JSON.stringify(Object.keys(oh)),
  );
  assert(
    "closed は「料金を提示しない」と規定されている",
    /料金を提示しない/.test(oh.closed?.decision_rule_ja ?? ""),
    oh.closed?.decision_rule_ja,
  );
  // 統合で closed を失うと定休日の扱いが壊れる。券側では使えないことも明示する
  for (const label of ["closed", "unknown"]) {
    assert(
      `${label} は operating_hours 専用と明記されている`,
      /operating_hours 専用/.test(oh[label]?.decision_rule_ja ?? ""),
      oh[label]?.decision_rule_ja,
    );
  }

  // 個別曜日が実際に判定に効くこと（毎週火曜定休）
  const LOOKUP = path.join(SKILL_DIR, "scripts", "lookup-price.mjs");
  const REAL = path.join(
    SKILL_DIR, "..", "..", "..",
    "src/private/data/lift-ticket/megahira-onsen-megahira/tickets/2025-2026.json",
  );
  if (fs.existsSync(REAL)) {
    const q = (date, audience = "adult") =>
      JSON.parse(
        run(LOOKUP, [
          REAL,
          "--date",
          date,
          "--audience",
          audience,
          "--json",
        ]).stdout,
      );
    assert(
      "day_type tuesday で毎週火曜が定休日と判定される",
      q("2026-01-27").operating?.reason === "closed",
      JSON.stringify(q("2026-01-27").operating),
    );
    assert(
      "excluded_dates で例外営業日（12/30 火）が営業と判定される",
      q("2025-12-30").operating?.open === true,
      JSON.stringify(q("2025-12-30").operating),
    );
    // 年末年始を平日から除外し、土日祝へ包含している
    const yearEnd = q("2025-12-29");
    assert(
      "年末年始期間（12/29 月）が平日として素通りしない",
      (yearEnd.offers ?? []).length > 0,
      JSON.stringify(yearEnd.day),
    );
    const specialSaturday = q("2025-12-27", "child");
    const specialSaturdayIds = new Set(
      (specialSaturday.offers ?? []).map((offer) => offer.id),
    );
    assert(
      "通常料金・kids_day・special_dayはカレンダー形式に関係なくすべて候補に残る",
      [
        "offer-hours9-child",
        "offer-kids-day-saturday",
        "offer-event-1227-child",
      ].every((id) => specialSaturdayIds.has(id)),
      JSON.stringify([...specialSaturdayIds]),
    );
  }
}

console.log("== 条件は他セクションと重複させない ==");
{
  const base = JSON.parse(
    fs.readFileSync(
      path.join(TESTS_DIR, "fixtures", "valid", "yukigaoka-2025-2026.json"),
      "utf8",
    ),
  );
  const taxonomy = JSON.parse(
    fs.readFileSync(path.join(SKILL_DIR, "references", "taxonomy.json"), "utf8"),
  );

  assert(
    "condition_operators 群が廃止されている（実データ0件・value が型なしの穴だった）",
    taxonomy.groups.condition_operators === undefined,
    JSON.stringify(Object.keys(taxonomy.groups)),
  );
  assert(
    "condition_types 群が廃止されている（絞り込める軸は性別と地域の2つだけだった）",
    taxonomy.groups.condition_types === undefined,
    JSON.stringify(Object.keys(taxonomy.groups)),
  );
  assert(
    "汎用の eligibility_conditions が実データに残っていない",
    base.offers.every((o) => !("eligibility_conditions" in o)) &&
      (base.party_rules ?? []).every((r) => !("eligibility_conditions" in r)),
  );

  // 他セクションで表すべき概念の行き先が正本（taxonomy）に記録されている
  const moved = {
    age: "audiences",
    school_level: "audiences",
    date: "calendars",
    time: "products.validity",
    purchase_deadline: "offers.purchase_deadline",
    proof_required: "requirements",
    companion: "party_rules",
    membership: "membership",
  };
  for (const [concept, where] of Object.entries(moved)) {
    const hint = taxonomy.moved_elsewhere?.target_restrictions?.[concept];
    assert(
      `"${concept}" は ${where} で表すよう taxonomy に案内がある`,
      typeof hint === "string" && hint.includes(where),
      String(hint),
    );
  }

  // 旧形式（汎用の条件配列）を書いたら schema で落ちる
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "lift-ticket-cond-"));
  try {
    const data = JSON.parse(JSON.stringify(base));
    data.offers[0].eligibility_conditions = [
      { type: "age", official_label_ja: "テスト条件", source_refs: data.offers[0].source_refs },
    ];
    const file = path.join(tempDirectory, "legacy-conditions.json");
    fs.writeFileSync(file, JSON.stringify(data));
    const result = run(SCRIPTS.schema, [file]);
    const output = `${result.stdout}${result.stderr}`;
    assert(
      "旧形式の eligibility_conditions は schema で拒否される",
      result.status !== 0 && /eligibility_conditions/.test(output),
      output.split("\n").slice(0, 3).join("\n"),
    );
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }

  // 証明書の種類は分類しない（写真付き身分証明書と運転免許証を区別しても
  // 料金計算に効かない）。ラベル群ではなく文章のフィールドで受ける
  assert(
    "proof_types 群が廃止されている",
    taxonomy.groups.proof_types === undefined,
    JSON.stringify(Object.keys(taxonomy.groups)),
  );
  const schemaProof = JSON.parse(
    fs.readFileSync(path.join(SKILL_DIR, "references", "lift-ticket.schema.json"), "utf8"),
  );
  assert(
    "requirements に proof_ja（文章）があり proof_types が無い",
    schemaProof.$defs.requirement.properties.proof_ja !== undefined &&
      schemaProof.$defs.requirement.properties.proof_types === undefined,
    JSON.stringify(Object.keys(schemaProof.$defs.requirement.properties)),
  );
  assert(
    "requirements の定義が offer と partyRule で共有されている（二重管理しない）",
    schemaProof.$defs.offer.properties.requirements.items.$ref ===
      "#/$defs/requirement" &&
      schemaProof.$defs.partyRule.properties.requirements.items.$ref ===
        "#/$defs/requirement",
  );
  assert(
    "proof_ja は「書いていない＝不要と解釈しない」と規定されている",
    /不要と解釈しない/.test(schemaProof.$defs.requirement.properties.proof_ja.description),
    schemaProof.$defs.requirement.properties.proof_ja.description,
  );
}

console.log("== ラベル定義の中身（境界が言葉で確定しているか） ==");
{
  const taxonomy = JSON.parse(
    fs.readFileSync(path.join(SKILL_DIR, "references", "taxonomy.json"), "utf8"),
  );

  const labels = taxonomy.groups.included_item_types.labels;
  assert(
    "included_item_types 全ラベルに定義がある",
    Object.values(labels).every((d) => d.status === "defined" && d.definition_ja),
    JSON.stringify(
      Object.entries(labels)
        .filter(([, d]) => d.status !== "defined")
        .map(([k]) => k),
    ),
  );

  // 細かく分けても料金計算に効かないので7区分に統合した。
  // 昼食/食事券/飲み物、温泉/サウナのような分類は判断が揺れるだけだった
  assert(
    "included_item_types は7区分（細かく分けない）",
    Object.keys(labels).sort().join(",") ===
      "bath,lesson,meal,parking,rental,unknown,voucher",
    JSON.stringify(Object.keys(labels)),
  );
  for (const gone of [
    "lunch",
    "meal_voucher",
    "drink",
    "onsen",
    "spa",
    "coupon_voucher",
    "gondola_sightseeing",
  ]) {
    assert(
      `統合前の "${gone}" が行き先付きで記録されている`,
      typeof taxonomy.moved_elsewhere?.included_item_type?.[gone] === "string",
      JSON.stringify(taxonomy.moved_elsewhere?.included_item_type),
    );
  }

  // 残った境界（食事券か汎用金額券か）だけは互いへの誘導を持つこと
  assert(
    'included_item_types: "voucher" が "meal" との境界を明示している',
    (labels.voucher.excludes_ja ?? []).join(" ").includes("meal"),
    JSON.stringify(labels.voucher.excludes_ja),
  );

  // 公式に金額が書かれていない特典に金額を書かせない（絶対原則の再掲）
  assert(
    "meal の定義が「金額を推測しない」と規定している",
    /推測しない/.test(labels.meal.decision_rule_ja ?? ""),
    labels.meal.decision_rule_ja,
  );
  assert(
    "群の注記が「細かく分けない」と明言している",
    /細かく分けない/.test(taxonomy.groups.included_item_types.notes_ja ?? ""),
    taxonomy.groups.included_item_types.notes_ja,
  );

  // --- 地域の構造化を廃止したこと ---
  // 照会の入力に居住地が無いため、居住/在勤/在学や都道府県/市町村を分類しても
  // 料金計算に一切効かなかった。分類せず公式表記の文章だけを残す
  for (const groupName of ["area_relationships", "geographic_levels", "condition_match_modes"]) {
    assert(
      `${groupName} 群が廃止されている`,
      taxonomy.groups[groupName] === undefined,
      JSON.stringify(Object.keys(taxonomy.groups)),
    );
  }
  const schemaRaw2 = JSON.parse(
    fs.readFileSync(path.join(SKILL_DIR, "references", "lift-ticket.schema.json"), "utf8"),
  );
  assert(
    "geographic_areas セクションが schema から消えている",
    schemaRaw2.properties.geographic_areas === undefined &&
      !schemaRaw2.required.includes("geographic_areas"),
  );
  assert(
    "offer の絞り込みは target_genders と target_qualification の2つだけ",
    Object.keys(schemaRaw2.$defs.offer.properties)
      .filter((k) => k.startsWith("target_"))
      .sort()
      .join(",") === "target_genders,target_qualification",
    JSON.stringify(Object.keys(schemaRaw2.$defs.offer.properties).filter((k) => k.startsWith("target_"))),
  );

  // 資格が必要な割引は、分類しない代わりに「公式表記」と「誰が対象か」を必ず残す
  const qualDir = fs.mkdtempSync(path.join(os.tmpdir(), "lift-ticket-qual-"));
  try {
    const real = JSON.parse(
      fs.readFileSync(path.join(TESTS_DIR, "fixtures", "valid", "yukigaoka-2025-2026.json"), "utf8"),
    );
    const dropped = JSON.parse(JSON.stringify(real));
    const local = dropped.offers.find((o) => (o.discount_reasons ?? []).includes("local_resident"));
    local.target_qualification = null;
    const droppedFile = path.join(qualDir, "local-no-qualification.json");
    fs.writeFileSync(droppedFile, JSON.stringify(dropped));
    const r1 = run(SCRIPTS.taxonomy, [droppedFile]);
    const out1 = `${r1.stdout}${r1.stderr}`;
    assert(
      "地域割引に target_qualification が無いとエラーになる（資格の無い人に安い金額を出す穴）",
      r1.status !== 0 && /target_qualification/.test(out1),
      out1.split("\n").filter((l) => /target_qualification/.test(l)).slice(0, 1).join(""),
    );

    const vague = JSON.parse(JSON.stringify(real));
    const local2 = vague.offers.find((o) => (o.discount_reasons ?? []).includes("local_resident"));
    local2.target_qualification = {
      official_label_ja: "道民割",
      description_ja: "",
      source_refs: local2.source_refs,
      notes_ja: null,
    };
    const vagueFile = path.join(qualDir, "qualification-no-description.json");
    fs.writeFileSync(vagueFile, JSON.stringify(vague));
    const r2 = run(SCRIPTS.taxonomy, [vagueFile]);
    const out2 = `${r2.stdout}${r2.stderr}`;
    assert(
      "target_qualification に「誰が対象か」が無いとエラーになる",
      r2.status !== 0 && /description_ja/.test(out2),
      out2.split("\n").filter((l) => /description_ja/.test(l)).slice(0, 1).join(""),
    );
  } finally {
    fs.rmSync(qualDir, { recursive: true, force: true });
  }
}

console.log("== other の全廃と unknown の通知 ==");
{
  const taxonomy = JSON.parse(
    fs.readFileSync(path.join(SKILL_DIR, "references", "taxonomy.json"), "utf8"),
  );
  const schema = JSON.parse(
    fs.readFileSync(path.join(SKILL_DIR, "references", "lift-ticket.schema.json"), "utf8"),
  );

  const withOther = Object.entries(taxonomy.groups).filter(([, g]) =>
    Object.keys(g.labels).includes("other"),
  );
  assert(
    "どの群にも other ラベルが無い",
    withOther.length === 0,
    JSON.stringify(withOther.map(([k]) => k)),
  );

  // 選択肢のある群には必ず unknown がある（確定できないときの逃げ道）
  const noUnknown = Object.entries(taxonomy.groups).filter(
    ([name, g]) =>
      !Object.keys(g.labels).includes("unknown") &&
      // data_quality_statuses は抽出担当の自己申告なので unknown を持たない
      !["currencies", "condition_match_modes", "discount_value_types",
        "data_quality_statuses"].includes(name),
  );
  assert(
    "確定できない可能性がある群には unknown がある",
    noUnknown.length === 0,
    JSON.stringify(noUnknown.map(([k]) => k)),
  );

  // schema の enum にも other が残っていない
  const enumsWithOther = [];
  const walk = (node, pointer) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node.enum) && node.enum.includes("other")) enumsWithOther.push(pointer);
    for (const [k, v] of Object.entries(node)) {
      if (v && typeof v === "object") walk(v, `${pointer}/${k}`);
    }
  };
  walk(schema, "");
  assert(
    "schema の enum にも other が残っていない",
    enumsWithOther.length === 0,
    JSON.stringify(enumsWithOther),
  );

  // unknown にした項目が「どの項目か」まで通知される
  const F = path.join(TESTS_DIR, "fixtures", "valid", "yukigaoka-2025-2026.json");
  const result = run(SCRIPTS.taxonomy, [F]);
  const output = `${result.stdout}${result.stderr}`;
  assert(
    "unknown にした項目がパスと公式表記付きで通知される",
    /\[unknown\] \/[a-z_]+\/\d+.*公式表記/.test(output),
    output.split("\n").filter((l) => l.includes("[unknown]")).slice(0, 2).join("\n"),
  );
  assert(
    "unknown の件数が警告として集計される",
    /unknown にした項目が \d+ 件あります/.test(output),
    output.split("\n").filter((l) => /unknown にした項目/.test(l)).join(""),
  );

  // target_qualification は「分類できなかったもの」ではなく「分類しないと決めたもの」なので
  // unknown の通知には載せない（載せると毎回ノイズになり、本当の unknown が埋もれる）
  const F2 = path.join(TESTS_DIR, "fixtures", "valid", "yukigaoka-2025-2026.json");
  const qualified = JSON.parse(fs.readFileSync(F2, "utf8"));
  const qualResult = run(SCRIPTS.taxonomy, [F2]);
  const qualOut = `${qualResult.stdout}${qualResult.stderr}`;
  assert(
    "実データに target_qualification が存在する（テストの前提）",
    qualified.offers.some((o) => o.target_qualification != null),
  );
  assert(
    "target_qualification は unknown の通知に載らない（分類しないと決めたものだから）",
    !/\[unknown\] \S*target_qualification/.test(qualOut),
    qualOut.split("\n").filter((l) => /target_qualification/.test(l)).slice(0, 2).join("\n"),
  );

}

console.log("== 割引の適用範囲（誰でも / パーティ構成 / 資格が必要） ==");
{
  const taxonomy = JSON.parse(
    fs.readFileSync(path.join(SKILL_DIR, "references", "taxonomy.json"), "utf8"),
  );
  const reasons = taxonomy.groups.discount_reasons.labels;

  assert(
    "forbidden_aliases が廃止されている（enumと定義で足りる）",
    taxonomy.forbidden_aliases === undefined,
  );
  assert(
    "student が廃止されている（audiences.school_levels で表す）",
    reasons.student === undefined,
    JSON.stringify(Object.keys(reasons)),
  );
  assert(
    "全ラベルに applies_to がある",
    Object.values(reasons).every((r) =>
      ["everyone", "party_composition", "qualified_only"].includes(r.applies_to),
    ),
    JSON.stringify(Object.entries(reasons).map(([k, v]) => [k, v.applies_to])),
  );
  assert(
    "誰でも使える割引: online_purchase / advance_purchase / special_day",
    ["online_purchase", "advance_purchase", "special_day"].every(
      (k) => reasons[k].applies_to === "everyone",
    ),
  );
  assert(
    "パーティ構成で自動判定: family / group",
    ["family", "group"].every((k) => reasons[k].applies_to === "party_composition"),
  );
  assert(
    "資格が必要: 会員・宿泊者・地域・クーポン等",
    ["membership", "hotel_guest", "local_resident", "coupon", "app_registration",
     "payment_method", "prior_purchase", "unknown"].every(
      (k) => reasons[k].applies_to === "qualified_only",
    ),
    JSON.stringify(Object.entries(reasons).filter(([, v]) => v.applies_to === "qualified_only").map(([k]) => k)),
  );

  const base = JSON.parse(
    fs.readFileSync(
      path.join(TESTS_DIR, "fixtures", "valid", "yukigaoka-2025-2026.json"),
      "utf8",
    ),
  );
  const LOOKUP = path.join(SKILL_DIR, "scripts", "lookup-price.mjs");

  // 資格が必要な割引は代表にせず、理由付きで別掲する
  const r = run(LOOKUP, [
    path.join(TESTS_DIR, "fixtures", "valid", "yukigaoka-2025-2026.json"),
    "--date", "2026-01-14", "--audience", "adult", "--day-pass", "--json",
  ]);
  const selection = JSON.parse(r.stdout).selection;
  assert(
    "地域割引¥5,000を代表にせず通常料金¥6,000を出す",
    selection?.total_amount === 6000,
    JSON.stringify(selection?.representative),
  );
  // 制約の集合が複製されると片方だけ古くなる。実際 cheapestPerPerson に独自の
  // コピーがあり qualification_required が漏れて、道民割がパーティ合計に混入した
  assert(
    "NARROWING_CONSTRAINTS の定義が1箇所だけ（集合を複製しない）",
    (fs
      .readFileSync(path.join(SKILL_DIR, "scripts", "lookup-price.mjs"), "utf8")
      .match(/new Set\(\[[^\]]*"advance_purchase_required"/g) ?? []).length === 1,
  );

  assert(
    "地域割引は「資格が必要」として別掲される",
    (selection?.cheaper_alternatives ?? []).some(
      (a) => a.amount === 5000 && /資格が必要/.test(a.why_not_representative),
    ),
    JSON.stringify(selection?.cheaper_alternatives),
  );

  const disabilityTemp = fs.mkdtempSync(
    path.join(os.tmpdir(), "lift-ticket-disability-"),
  );
  try {
    const disabilityData = JSON.parse(JSON.stringify(base));
    disabilityData.audiences.push({
      id: "disabled-adult",
      name_ja: "障がい者",
      official_label_ja: "障がい者本人",
      age_min: null,
      age_max: null,
      age_basis_ja: null,
      school_levels: [],
      is_disability_qualified: true,
      base_audience_id: "adult",
      source_refs: ["src-page-ryokin"],
      is_default: false,
    });
    const standard = disabilityData.offers.find(
      (offer) => offer.id === "offer-adult-day-standard-weekday",
    );
    const disability = JSON.parse(JSON.stringify(standard));
    disability.id = "offer-disabled";
    disability.name_ja = "障がい者1日券";
    disability.official_label_ja = "障がい者割引";
    disability.discount_reasons = [];
    disability.audience_ids = ["disabled-adult"];
    disability.target_qualification = {
      official_label_ja: "障がい者手帳をお持ちの方",
      description_ja: "障がい者手帳をお持ちの方。",
      source_refs: ["src-page-ryokin"],
      notes_ja: null,
    };
    disability.price = { currency: "JPY", amount: 3000, notes_ja: null };
    disabilityData.offers.push(disability);

    const disabilityFile = path.join(disabilityTemp, "with-disability.json");
    fs.writeFileSync(disabilityFile, JSON.stringify(disabilityData));
    const disabilityLookup = run(LOOKUP, [
      disabilityFile,
      "--date",
      "2026-01-14",
      "--audience",
      "disabled-adult",
      "--day-pass",
      "--json",
    ]);
    const disabilitySelection = JSON.parse(
      disabilityLookup.stdout,
    ).selection;
    assert(
      "障がい者区分を指定すると専用料金を代表にする",
      disabilitySelection?.total_amount === 3000,
      JSON.stringify(disabilitySelection),
    );

    disabilityData.offers = disabilityData.offers.filter(
      (offer) => offer.id !== "offer-disabled",
    );
    const fallbackFile = path.join(disabilityTemp, "fallback.json");
    fs.writeFileSync(fallbackFile, JSON.stringify(disabilityData));
    const fallbackLookup = run(LOOKUP, [
      fallbackFile,
      "--date",
      "2026-01-14",
      "--audience",
      "disabled-adult",
      "--day-pass",
      "--json",
    ]);
    const fallbackSelection = JSON.parse(fallbackLookup.stdout).selection;
    assert(
      "障がい者専用料金が無ければ基準の大人料金へ戻す",
      fallbackSelection?.total_amount === 6000,
      JSON.stringify(fallbackSelection),
    );
  } finally {
    fs.rmSync(disabilityTemp, { recursive: true, force: true });
  }

  const ageGenerationTemp = fs.mkdtempSync(
    path.join(os.tmpdir(), "lift-ticket-age-generation-"),
  );
  try {
    const ageGenerationData = JSON.parse(JSON.stringify(base));
    ageGenerationData.products.push({
      id: "age-generation-product",
      name_ja: "平日20才リフト無料",
      official_label_ja: "平日20才リフト無料",
      validity: {
        mode: "unknown",
        notes_ja: "公式には平日のリフトが無料で乗り放題とだけ記載。",
      },
      covers_hours_types: null,
      area_ids: [],
      source_refs: ["src-page-ryokin"],
    });
    ageGenerationData.offers.push({
      id: "age-generation-offer",
      name_ja: "平日20才リフト無料",
      official_label_ja: "平日20才リフト無料",
      discount_reasons: ["app_registration"],
      product_id: "age-generation-product",
      audience_ids: ["adult"],
      calendar_ids: ["cal-weekday"],
      channel_ids: ["window"],
      target_qualification: {
        official_label_ja: "2005年4月2日〜2006年4月1日生まれの方",
        description_ja:
          "2005年4月2日から2006年4月1日までに生まれ、公式アプリへ登録した方。",
        nominal_age: 20,
        source_refs: ["src-page-ryokin"],
      },
      requirements: [
        {
          description_ja: "公式アプリのクーポンと本人確認書類を提示する。",
          source_refs: ["src-page-ryokin"],
        },
      ],
      price: {
        currency: "JPY",
        amount: 0,
      },
      source_refs: ["src-page-ryokin"],
    });
    const ageGenerationFile = path.join(
      ageGenerationTemp,
      "age-generation.json",
    );
    fs.writeFileSync(ageGenerationFile, JSON.stringify(ageGenerationData));

    const age20 = JSON.parse(
      run(LOOKUP, [
        ageGenerationFile,
        "--date",
        "2026-01-14",
        "--age",
        "20",
        "--day-pass",
        "--json",
      ]).stdout,
    );
    assert(
      "年度生まれ割引は名目年齢20歳の検索で自動適用する",
      age20.selection?.total_amount === 0 &&
        age20.selection?.mode === "age_generation_offer",
      JSON.stringify(age20.selection),
    );
    assert(
      "年度生まれ割引は公式の生年月日範囲を警告する",
      (age20.selection?.warnings_ja ?? []).some((warning) =>
        warning.includes("2005年4月2日〜2006年4月1日"),
      ),
      JSON.stringify(age20.selection?.warnings_ja),
    );

    const age50 = JSON.parse(
      run(LOOKUP, [
        ageGenerationFile,
        "--date",
        "2026-01-14",
        "--age",
        "50",
        "--day-pass",
        "--json",
      ]).stdout,
    );
    assert(
      "年齢50歳の検索は子供無料を選ばずデフォルトの大人料金へ戻す",
      age50.selection?.total_amount === 6000 &&
        age50.filters?.resolved_audience_ids?.includes("adult") &&
        age50.offers?.every(
          (offer) => offer.id !== "age-generation-offer",
        ),
      JSON.stringify({
        selection: age50.selection,
        filters: age50.filters,
      }),
    );

    const noAudience = JSON.parse(
      run(LOOKUP, [
        ageGenerationFile,
        "--date",
        "2026-01-14",
        "--day-pass",
        "--json",
      ]).stdout,
    );
    assert(
      "人物指定が無い照会もデフォルトの大人料金を使う",
      noAudience.selection?.total_amount === 6000 &&
        noAudience.filters?.resolved_audience_ids?.includes("adult"),
      JSON.stringify({
        selection: noAudience.selection,
        filters: noAudience.filters,
      }),
    );
  } finally {
    fs.rmSync(ageGenerationTemp, { recursive: true, force: true });
  }

  // ★ 条件を書き忘れた qualified_only の割引を検出する（実際にあった穴）
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "lift-ticket-applies-"));
  try {
    const data = JSON.parse(JSON.stringify(base));
    const src = data.offers.find((o) => o.id === "offer-adult-day-standard-weekday");
    const member = JSON.parse(JSON.stringify(src));
    member.id = "offer-member";
    member.name_ja = "会員割引1日券";
    member.official_label_ja = "会員割引";
    member.discount_reasons = ["membership"];
    member.price = { currency: "JPY", amount: 4000, notes_ja: null };
    // 絞り込みの書き忘れ（target_* を一切設定しない）
    data.offers.push(member);
    const file = path.join(tempDirectory, "member-no-condition.json");
    fs.writeFileSync(file, JSON.stringify(data));
    const result = run(SCRIPTS.taxonomy, [file]);
    const output = `${result.stdout}${result.stderr}`;
    assert(
      "資格が必要な割引に条件が無いとエラーになる（資格の無い人に安い金額を出す穴）",
      result.status !== 0 && /qualified_only/.test(output) && /資格の無い人/.test(output),
      output.split("\n").filter((l) => /membership/.test(l)).slice(0, 1).join(""),
    );

    // パーティ構成の割引に party_rules が無ければエラー
    const noParty = JSON.parse(JSON.stringify(base));
    noParty.party_rules = [];
    const familyOffer = noParty.offers.find(
      (o) => o.id === "offer-adult-day-standard-weekday",
    );
    familyOffer.discount_reasons = ["family"];
    const file2 = path.join(tempDirectory, "family-no-party-rules.json");
    fs.writeFileSync(file2, JSON.stringify(noParty));
    const result2 = run(SCRIPTS.taxonomy, [file2]);
    assert(
      "パーティ構成の割引に party_rules が無いとエラーになる",
      result2.status !== 0 &&
        /party_composition/.test(`${result2.stdout}${result2.stderr}`),
      `${result2.stdout}${result2.stderr}`.split("\n").slice(0, 2).join("\n"),
    );

    // 未登録ラベルには使用可能な一覧を提示する（禁止リストの代わり）
    const unknown = JSON.parse(JSON.stringify(base));
    unknown.offers.find((o) => (o.discount_reasons ?? []).length > 0).discount_reasons = [
      "web_discount",
    ];
    const file3 = path.join(tempDirectory, "unknown-label.json");
    fs.writeFileSync(file3, JSON.stringify(unknown));
    const result3 = run(SCRIPTS.taxonomy, [file3]);
    const out3 = `${result3.stdout}${result3.stderr}`;
    assert(
      "未登録ラベルには使用可能なラベル一覧を提示する",
      result3.status !== 0 &&
        out3.includes("使用可能:") &&
        out3.includes("online_purchase"),
      out3.split("\n").slice(0, 2).join("\n"),
    );
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

console.log("== 収集対象外データ: 意味的検証で拒否すること ==");
{
  const base = JSON.parse(
    fs.readFileSync(
      path.join(TESTS_DIR, "fixtures", "valid", "minimal.json"),
      "utf8",
    ),
  );
  base.products = [
    {
      id: "out-of-scope-pass",
      name_ja: "シーズン券",
      validity: { mode: "unknown" },
      area_ids: [],
      shared_with_resorts: [],
      included_items: [],
      source_refs: [],
    },
  ];
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "lift-ticket-scope-test-"),
  );
  const tempFile = path.join(tempDirectory, "out-of-scope.json");
  try {
    fs.writeFileSync(tempFile, JSON.stringify(base));
    const result = run(SCRIPTS.coverage, [tempFile]);
    assert(
      "シーズン券が別ラベルで記録されてもcoverage検証が失敗する",
      result.status !== 0 &&
        `${result.stdout}${result.stderr}`.includes(
          "収集対象外のシーズン券関連情報",
        ),
      `${result.stdout}${result.stderr}`,
    );
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

console.log("== lookup-price: 日付から料金が機械的に引けること ==");
{
  const LOOKUP = path.join(SKILL_DIR, "scripts", "lookup-price.mjs");
  const FULL = path.join(TESTS_DIR, "fixtures", "valid", "yukigaoka-2025-2026.json");
  const lookup = (args) => {
    const r = run(LOOKUP, [FULL, ...args, "--json"]);
    if (r.status !== 0) return { error: `${r.stdout}${r.stderr}` };
    return JSON.parse(r.stdout);
  };
  const amountOf = (result, offerId) =>
    result.offers?.find((o) => o.id === offerId)?.price?.amount ?? null;
  const dayFilter = ["--audience", "adult", "--product", "day-pass", "--channel", "window"];

  const wed = lookup(["--date", "2026-01-14", ...dayFilter]);
  assert(
    "平日(2026-01-14 水)の大人1日券が6,000円",
    amountOf(wed, "offer-adult-day-standard-weekday") === 6000,
    JSON.stringify(wed.day ?? wed.error),
  );
  assert(
    "平日の道民割が基準料金からの導出で5,000円",
    amountOf(wed, "offer-adult-day-dominwari-weekday") === 5000,
    JSON.stringify(wed.offers?.map((o) => [o.id, o.price?.amount])),
  );

  const holiday = lookup(["--date", "2026-01-12", ...dayFilter]);
  assert(
    "祝日(2026-01-12)が成人の日と判定される",
    holiday.day?.holiday_name === "成人の日",
    JSON.stringify(holiday.day ?? holiday.error),
  );
  assert(
    "祝日の大人1日券が6,500円",
    amountOf(holiday, "offer-adult-day-standard-holiday") === 6500,
  );

  const newyear = lookup(["--date", "2026-01-01", ...dayFilter]);
  assert(
    "年末年始(2026-01-01)は通常祝日から除外され、年末年始料金7,000円になる",
    amountOf(newyear, "offer-adult-day-standard-yearend") === 7000,
    JSON.stringify(newyear.offers?.map((o) => [o.id, o.price?.amount])),
  );

  const ladies = lookup(["--date", "2026-01-08", "--audience", "adult"]);
  assert(
    "レディースデー(2026-01-08 木)に4,500円offerが出る",
    amountOf(ladies, "offer-ladies-day") === 4500,
    JSON.stringify(ladies.day ?? ladies.error),
  );
  assert(
    "対象日以外(2026-01-14)はレディースデーofferが出ない",
    wed.offers?.every((o) => o.id !== "offer-ladies-day") ?? false,
  );
  const webAdvance = ladies.offers?.find((o) => o.id === "offer-adult-day-web-advance");
  assert(
    "WEB前売が5,800円で「当日は買えない」と記録されている",
    webAdvance?.price?.amount === 5800 &&
      webAdvance?.purchase_deadline?.same_day_allowed === false &&
      typeof webAdvance?.purchase_deadline?.official_text_ja === "string",
    JSON.stringify(webAdvance),
  );
  const dynamic = ladies.offers?.find((o) => o.id === "offer-adult-day-web-dynamic");
  assert(
    "動的価格は金額null＋live_lookup_required＋当日購入可",
    dynamic?.price?.amount == null &&
      dynamic?.price?.live_lookup_required === true &&
      dynamic?.purchase_deadline?.same_day_allowed === true,
    JSON.stringify(dynamic),
  );
  assert(
    "party rule（未就学児無料）が表示される",
    (ladies.party_rules ?? []).some((r) => r.id === "rule-preschool-free"),
  );
}

console.log("== 営業時間・定休日・滑走時間要件（実データ: めがひら） ==");
{
  const LOOKUP = path.join(SKILL_DIR, "scripts", "lookup-price.mjs");
  const REAL = path.join(
    SKILL_DIR, "..", "..", "..",
    "src/private/data/lift-ticket/megahira-onsen-megahira/tickets/2025-2026.json",
  );
  if (!fs.existsSync(REAL)) {
    console.log("  SKIP 実データが見つかりません");
  } else {
    const q = (args) => {
      const r = run(LOOKUP, [REAL, ...args, "--json"]);
      if (r.status !== 0) return { error: `${r.stdout}${r.stderr}` };
      return JSON.parse(r.stdout);
    };

    // 定休日（毎週火曜）には料金を出さない
    const closed = q(["--date", "2026-01-27", "--audience", "adult"]);
    assert(
      "定休日(2026-01-27 火)は営業していないと判定される",
      closed.operating?.open === false && closed.operating?.reason === "closed",
      JSON.stringify(closed.operating ?? closed.error),
    );
    assert(
      "定休日には料金を1件も出さない",
      (closed.offers ?? []).length === 0,
      String((closed.offers ?? []).length),
    );

    // 12/30 は火曜だが営業する（excluded_dates の例外）
    const exception = q(["--date", "2025-12-30", "--audience", "adult"]);
    assert(
      "12/30(火)は例外的に営業する",
      exception.operating?.open === true,
      JSON.stringify(exception.operating ?? exception.error),
    );
    assert(
      "年末年始を平日から除外して土日祝へ包含し、土日祝料金になる",
      exception.offers?.some(
        (o) =>
          o.id === "offer-hours9-adult-weekend" &&
          o.price?.amount === 6800,
      ) &&
        exception.offers?.every(
          (o) =>
            o.id !== "offer-hours9-adult-weekday" &&
            o.id !== "offer-gogoichi",
        ),
      JSON.stringify(
        exception.offers?.map((o) => [o.id, o.price?.amount]),
      ),
    );

    // 営業時間とナイターの有無
    const weekday = q(["--date", "2026-01-28", "--audience", "adult"]);
    assert(
      "平日の営業時間が08:00〜17:00と引ける",
      weekday.operating?.daytime?.start === 8 * 60 &&
        weekday.operating?.daytime?.end === 17 * 60,
      JSON.stringify(weekday.operating?.daytime),
    );
    assert(
      "ナイターが無い日は has_night が false",
      weekday.operating?.has_night === false,
    );
    const nightDay = q(["--date", "2026-02-28", "--audience", "adult"]);
    assert(
      "ナイター営業日(2026-02-28)は has_night が true で17:00〜21:00",
      nightDay.operating?.has_night === true &&
        nightDay.operating?.night?.start === 17 * 60 &&
        nightDay.operating?.night?.end === 21 * 60,
      JSON.stringify(nightDay.operating?.night),
    );
    assert(
      "ナイター時に運休するリフトが判別できる",
      (nightDay.operating?.entries ?? [])
        .find((e) => e.hours_type === "night")
        ?.lifts?.some((l) => l.operating === false),
      JSON.stringify(nightDay.operating?.entries),
    );

    // 4時間滑りたい（朝から）→ 時間帯固定のゴゴイチ券は代表にしない
    const h4 = q(["--date", "2026-01-28", "--audience", "adult", "--hours", "4"]);
    assert(
      "4時間希望の代表は4時間券¥5,400（ゴゴイチ¥3,800を代表にしない）",
      h4.selection?.representative?.price?.amount === 5400,
      JSON.stringify(h4.selection?.representative),
    );
    const gogoichi = (h4.selection?.cheaper_alternatives ?? []).find(
      (a) => a.id === "offer-gogoichi",
    );
    assert(
      "ゴゴイチ券は「もっと安い」として理由付きで残る",
      gogoichi?.amount === 3800 &&
        gogoichi.constraints.some((c) => c.type === "time_window_fixed"),
      JSON.stringify(gogoichi),
    );
    assert(
      "3時間券は要件未達として除外される",
      (h4.selection?.cheaper_alternatives ?? []).some(
        (a) => a.id === "offer-hours3-adult-weekday" && /3時間しか/.test(a.why_not_representative),
      ),
      JSON.stringify(h4.selection?.cheaper_alternatives),
    );
    assert(
      "回数券は滑走時間で比較できないと明示される",
      (h4.selection?.cheaper_alternatives ?? []).some(
        (a) => a.id === "offer-ride5" && /比較できない/.test(a.why_not_representative),
      ),
    );

    // 午後からでよいと明示したらゴゴイチ券が代表になる
    const afternoon = q([
      "--date", "2026-01-28", "--audience", "adult", "--hours", "4", "--from", "13:00",
    ]);
    assert(
      "13:00からと指定するとゴゴイチ券¥3,800が代表になる",
      afternoon.selection?.representative?.id === "offer-gogoichi",
      JSON.stringify(afternoon.selection?.representative),
    );

    // キャンペーンの長時間券が通常券より安ければそれを代表にする
    const h5 = q(["--date", "2026-01-26", "--audience", "adult", "--hours", "5"]);
    assert(
      "5時間希望の代表はキャンペーン9時間券¥3,400（6時間券¥5,900より安い）",
      h5.selection?.representative?.price?.amount === 3400 &&
        h5.selection?.representative?.skiable_hours === 9,
      JSON.stringify(h5.selection?.representative),
    );
  }
}

console.log("== 分類フィールドの廃止（product_type / offer_type） ==");
{
  const F = path.join(TESTS_DIR, "fixtures", "valid", "yukigaoka-2025-2026.json");
  const data = JSON.parse(fs.readFileSync(F, "utf8"));
  const byLabel = (text) =>
    data.products.find((p) => (p.official_label_ja ?? "").includes(text));

  assert(
    "product_type フィールドがどのproductにも残っていない",
    data.products.every((p) => !("product_type" in p)),
    JSON.stringify(data.products.filter((p) => "product_type" in p).map((p) => p.id)),
  );

  // offer_type も同じ理由で廃止した。実データ39件のうち10件（26%）で
  // 複数のラベルが同時に該当し、どれを選ぶかが恣意的だった
  // （構造が同一の standard+package に "standard" と "package" が混在していた）
  const taxonomyRaw = JSON.parse(
    fs.readFileSync(path.join(SKILL_DIR, "references", "taxonomy.json"), "utf8"),
  );
  const schemaRaw = JSON.parse(
    fs.readFileSync(path.join(SKILL_DIR, "references", "lift-ticket.schema.json"), "utf8"),
  );
  // 費用の種類は分類しない。支払総額に効くのは「返金されるか」と
  // 「券の提示価格に含まれているか」の2つだけ
  assert(
    "fee_types 群が廃止されている",
    taxonomyRaw.groups.fee_types === undefined,
    JSON.stringify(Object.keys(taxonomyRaw.groups)),
  );
  assert(
    "fee.fee_type が schema から消えている",
    schemaRaw.$defs.fee.properties.fee_type === undefined,
    JSON.stringify(Object.keys(schemaRaw.$defs.fee.properties)),
  );
  assert(
    "返金の有無・提示価格込みのフラグを持たない（載っているものは全て負担）",
    schemaRaw.$defs.fee.properties.refundable === undefined &&
      schemaRaw.$defs.fee.properties.included_in_offer_price === undefined,
    JSON.stringify(Object.keys(schemaRaw.$defs.fee.properties)),
  );
  assert(
    "返金される保証金は記録しないと明記されている",
    /保証金（ICカードデポジット等）は記録しない/.test(schemaRaw.$defs.fee.description ?? ""),
    schemaRaw.$defs.fee.description,
  );

  const feeDir = fs.mkdtempSync(path.join(os.tmpdir(), "lift-ticket-fee-"));
  try {
    const yuki = JSON.parse(
      fs.readFileSync(path.join(TESTS_DIR, "fixtures", "valid", "yukigaoka-2025-2026.json"), "utf8"),
    );

    // 返金される保証金は「負担」ではないので載せない
    const deposit = JSON.parse(JSON.stringify(yuki));
    deposit.fees.push({
      id: "fee-ic-deposit",
      name_ja: "ICカード保証金",
      official_label_ja: "ICカードデポジット",
      amount: 500,
      currency: "JPY",
      applies_to_product_ids: [],
      applies_to_channel_ids: [],
      notes_ja: null,
      source_refs: ["src-page-ryokin"],
    });
    const depositFile = path.join(feeDir, "deposit-as-fee.json");
    fs.writeFileSync(depositFile, JSON.stringify(deposit));
    const r1 = run(SCRIPTS.taxonomy, [depositFile]);
    const out1 = `${r1.stdout}${r1.stderr}`;
    assert(
      "返金される保証金を fees に入れるとエラーになる（実質の負担ではない）",
      r1.status !== 0 && /実質の負担ではありません/.test(out1),
      out1.split("\n").filter((l) => /fees/.test(l)).slice(0, 1).join(""),
    );

    // 紛失時だけの費用も載せない
    const reissue = JSON.parse(JSON.stringify(yuki));
    reissue.fees.push({
      id: "fee-reissue",
      name_ja: "ICカード再発行手数料",
      official_label_ja: "再発行手数料",
      amount: 1000,
      currency: "JPY",
      applies_to_product_ids: [],
      applies_to_channel_ids: [],
      notes_ja: null,
      source_refs: ["src-page-ryokin"],
    });
    const reissueFile = path.join(feeDir, "reissue-fee.json");
    fs.writeFileSync(reissueFile, JSON.stringify(reissue));
    const r2 = run(SCRIPTS.taxonomy, [reissueFile]);
    const out2 = `${r2.stdout}${r2.stderr}`;
    assert(
      "再発行手数料を fees に入れるとエラーになる（収集対象外）",
      r2.status !== 0 && /収集対象外/.test(out2),
      out2.split("\n").filter((l) => /fees/.test(l)).slice(0, 1).join(""),
    );

    // ★保証金込みで提示されている券は、実質負担へ差し引いた説明が必須
    const included = JSON.parse(JSON.stringify(yuki));
    const standard = included.offers.find(
      (o) => o.id === "offer-adult-day-standard-weekday",
    );
    standard.official_label_ja = "リフト1日券（おとな・IC保証金500円込）";
    standard.price.notes_ja = null;
    const includedFile = path.join(feeDir, "deposit-included-no-note.json");
    fs.writeFileSync(includedFile, JSON.stringify(included));
    const r3 = run(SCRIPTS.taxonomy, [includedFile]);
    const out3 = `${r3.stdout}${r3.stderr}`;
    assert(
      "保証金込みの提示価格なのに差し引きの説明が無いとエラーになる",
      r3.status !== 0 && /実質負担で記録/.test(out3),
      out3.split("\n").filter((l) => /price/.test(l)).slice(0, 1).join(""),
    );

    // 券の合計 ＋ 返ってこない負担 ＝ 実質負担（数字は1つ）
    const query = (file) => {
      const r = run(path.join(SKILL_DIR, "scripts", "lookup-price.mjs"), [
        file, "--date", "2026-01-14", "--today", "2026-01-01",
        "--party", "adult:2", "--day-pass", "--json",
      ]);
      return JSON.parse(r.stdout).party_calculation;
    };
    const calc = query(path.join(TESTS_DIR, "fixtures", "valid", "yukigaoka-2025-2026.json"));
    assert(
      "実質負担＝券の合計＋返ってこない負担（¥12,000＋¥1,000）",
      calc?.best?.total_amount === 12000 &&
        calc?.fees?.fee_total === 1000 &&
        calc?.fees?.net_total === 13000,
      JSON.stringify(calc?.fees),
    );
    assert(
      "「戻る額」「窓口で払う額」の3段表示をやめ、実質負担1本にする",
      calc?.fees?.refunded_total === undefined &&
        calc?.fees?.payable_total === undefined,
      JSON.stringify(Object.keys(calc?.fees ?? {})),
    );
  } finally {
    fs.rmSync(feeDir, { recursive: true, force: true });
  }

  // 「いつまでに使い切るか」は分割して使える券だけの概念。
  // 日数の構造化と分類ラベルは照会にも表示にも使われていなかったので廃止した
  assert(
    "usable_within_types 群が廃止されている",
    taxonomyRaw.groups.usable_within_types === undefined,
    JSON.stringify(Object.keys(taxonomyRaw.groups)),
  );
  const validityProps = schemaRaw.$defs.product.properties.validity.properties;
  assert(
    "usable_within（構造化）は無く usable_within_ja（自由文）になっている",
    validityProps.usable_within === undefined &&
      validityProps.usable_within_ja?.type?.includes("string"),
    JSON.stringify(Object.keys(validityProps)),
  );
  assert(
    "当日券には書かないと明記されている",
    /当日しか使えない券/.test(validityProps.usable_within_ja.description ?? ""),
    validityProps.usable_within_ja.description,
  );

  const uwDir = fs.mkdtempSync(path.join(os.tmpdir(), "lift-ticket-uw-"));
  try {
    const F2 = path.join(TESTS_DIR, "fixtures", "valid", "daypass-test-2025-2026.json");
    const base = JSON.parse(fs.readFileSync(F2, "utf8"));

    // その日で終わる券に「いつまでに使い切るか」を書かせない
    const onDay = JSON.parse(JSON.stringify(base));
    const dayPass = onDay.products.find((p) => p.validity?.mode === "calendar_day");
    dayPass.validity.usable_within_ja = "購入日から30日以内";
    const onDayFile = path.join(uwDir, "usable-within-on-day-pass.json");
    fs.writeFileSync(onDayFile, JSON.stringify(onDay));
    const r1 = run(SCRIPTS.taxonomy, [onDayFile]);
    const out1 = `${r1.stdout}${r1.stderr}`;
    assert(
      "当日券に usable_within_ja を書くとエラーになる（その日で終わる券には概念が無い）",
      r1.status !== 0 && /その日で終わる券/.test(out1),
      out1.split("\n").filter((l) => /usable_within/.test(l)).slice(0, 1).join(""),
    );

    // 分割して使える券に記録が無ければ注意喚起
    const missing = JSON.parse(JSON.stringify(base));
    const pooled = missing.products.find((p) => p.validity?.mode === "hours_pool");
    pooled.validity.usable_within_ja = null;
    const missingFile = path.join(uwDir, "usable-within-missing.json");
    fs.writeFileSync(missingFile, JSON.stringify(missing));
    const r2 = run(SCRIPTS.taxonomy, [missingFile]);
    const out2 = `${r2.stdout}${r2.stderr}`;
    assert(
      "分割して使える券に記録が無いと推測しないよう注意喚起される",
      /推測しないでください/.test(out2),
      out2.split("\n").filter((l) => /usable_within/.test(l)).slice(0, 1).join(""),
    );

    // 旧形式の構造を書いたら行き先を案内する
    const legacy = JSON.parse(JSON.stringify(base));
    const pooled2 = legacy.products.find((p) => p.validity?.mode === "hours_pool");
    pooled2.validity.usable_within = { type: "season", official_text_ja: "シーズン中有効" };
    const legacyFile = path.join(uwDir, "usable-within-legacy.json");
    fs.writeFileSync(legacyFile, JSON.stringify(legacy));
    const r3 = run(SCRIPTS.taxonomy, [legacyFile]);
    const out3 = `${r3.stdout}${r3.stderr}`;
    assert(
      "旧形式の usable_within を書くと usable_within_ja への案内が出る",
      r3.status !== 0 && /usable_within_ja/.test(out3),
      out3.split("\n").filter((l) => /usable_within/.test(l)).slice(0, 1).join(""),
    );
  } finally {
    fs.rmSync(uwDir, { recursive: true, force: true });
  }

  // 単独券／共通券。苗場とかぐらのように両方を売るスキー場があるので
  // 画面で選べるようにする。分類ラベルは持たず shared_with_resorts の有無で決まる
  const swSchema = schemaRaw.$defs.product.properties.shared_with_resorts;
  assert(
    "共通券の相手スキー場は resort_id が必須（画面から相手へ辿るため）",
    swSchema.items.required.includes("resort_id"),
    JSON.stringify(swSchema.items.required),
  );
  assert(
    "「単独券か共通券か」の分類ラベルは持たない（配列の有無で決まる）",
    taxonomyRaw.groups.pass_scopes === undefined &&
      taxonomyRaw.groups.shared_pass_types === undefined &&
      /空なら単独券、1件以上あれば共通券/.test(swSchema.description ?? ""),
    swSchema.description,
  );

  const scopeDir = fs.mkdtempSync(path.join(os.tmpdir(), "lift-ticket-scope-"));
  try {
    const YUKI = path.join(TESTS_DIR, "fixtures", "valid", "yukigaoka-2025-2026.json");
    const ask = (scope) => {
      const r = run(path.join(SKILL_DIR, "scripts", "lookup-price.mjs"), [
        YUKI, "--date", "2026-01-14", "--audience", "adult", "--scope", scope, "--json",
      ]);
      return JSON.parse(r.stdout);
    };
    const single = ask("single");
    const shared = ask("shared");
    assert(
      "--scope single では共通券が出ない",
      (single.offers ?? []).length > 0 &&
        (single.offers ?? []).every((o) => o.shared_pass === false),
      JSON.stringify((single.offers ?? []).map((o) => [o.name_ja, o.shared_pass])),
    );
    assert(
      "--scope shared では共通券だけが出る",
      (shared.offers ?? []).length > 0 &&
        (shared.offers ?? []).every((o) => o.shared_pass === true),
      JSON.stringify((shared.offers ?? []).map((o) => [o.name_ja, o.shared_pass])),
    );
    assert(
      "共通券の相手スキー場が resort_id 付きで返る（画面から辿れる）",
      (shared.offers ?? []).some((o) =>
        (o.shared_with_resorts ?? []).some((p) => p.resort_id === "yukidani"),
      ),
      JSON.stringify((shared.offers ?? []).map((o) => o.shared_with_resorts)),
    );
    assert(
      "共通券の一覧がまとめて返る（画面のセレクタ用）",
      (single.shared_passes ?? []).some(
        (p) => p.product_id === "two-resort-pass" && p.shared_with_resorts.length > 0,
      ),
      JSON.stringify(single.shared_passes),
    );

    // relatort_id が無いと画面から相手へ辿れないので検出する
    const noId = JSON.parse(fs.readFileSync(YUKI, "utf8"));
    const sharedProduct = noId.products.find((p) => (p.shared_with_resorts ?? []).length > 0);
    sharedProduct.shared_with_resorts[0].resort_id = null;
    const noIdFile = path.join(scopeDir, "shared-no-resort-id.json");
    fs.writeFileSync(noIdFile, JSON.stringify(noId));
    const r = run(SCRIPTS.taxonomy, [noIdFile]);
    const out = `${r.stdout}${r.stderr}`;
    assert(
      "共通券の相手に resort_id が無いとエラーになる",
      r.status !== 0 && /resort_id/.test(out),
      out.split("\n").filter((l) => /shared_with_resorts/.test(l)).slice(0, 1).join(""),
    );
  } finally {
    fs.rmSync(scopeDir, { recursive: true, force: true });
  }

  // 資料の種類は拡張子が表す。分類ラベルは何も足していなかった
  assert(
    "source_types 群が廃止されている",
    taxonomyRaw.groups.source_types === undefined,
    JSON.stringify(Object.keys(taxonomyRaw.groups)),
  );
  assert(
    "source.type が schema から消え、path が必須になっている",
    schemaRaw.$defs.source.properties.type === undefined &&
      schemaRaw.$defs.source.required.includes("path"),
    JSON.stringify(schemaRaw.$defs.source.required),
  );
  assert(
    "source.type フィールドがどの資料にも残っていない",
    (data.sources ?? []).every((s) => !("type" in s)),
    JSON.stringify((data.sources ?? []).filter((s) => "type" in s).map((s) => s.id)),
  );

  // 1 offer = 1 金額。日付で料金が変わるならカレンダーごとに offer を分ける。
  // date_table は日付マッチングと「金額の読み方」を二重実装にしていた
  assert(
    "price.date_table が schema から消えている",
    schemaRaw.$defs.price.properties.date_table === undefined,
    JSON.stringify(Object.keys(schemaRaw.$defs.price.properties)),
  );
  assert(
    "date_table がどのofferにも残っていない",
    data.offers.every((o) => o.price?.date_table === undefined),
    JSON.stringify(data.offers.filter((o) => o.price?.date_table).map((o) => o.id)),
  );
  assert(
    "1 offer = 1 金額 と schema に明記されている",
    /1つの offer は1つの金額を持つ/.test(schemaRaw.$defs.price.description ?? ""),
    schemaRaw.$defs.price.description?.slice(0, 60),
  );
  assert(
    "全offerが単一金額（同じ券種はカレンダーごとに別offer）",
    data.offers.every(
      (o) =>
        o.price?.amount != null ||
        o.price?.base_offer_id != null ||
        o.price?.live_lookup_required === true ||
        o.price?.range != null ||
        typeof o.price?.notes_ja === "string",
    ),
    JSON.stringify(data.offers.filter((o) => o.price?.amount == null).map((o) => o.id)),
  );

  const dtDir = fs.mkdtempSync(path.join(os.tmpdir(), "lift-ticket-dt-"));
  try {
    const legacy = JSON.parse(JSON.stringify(data));
    legacy.offers[0].price = {
      currency: "JPY",
      amount: null,
      date_table: [{ calendar_id: legacy.calendars[0].id, amount: 6000 }],
      notes_ja: "日付別",
    };
    const legacyFile = path.join(dtDir, "legacy-date-table.json");
    fs.writeFileSync(legacyFile, JSON.stringify(legacy));
    const r = run(SCRIPTS.taxonomy, [legacyFile]);
    const out = `${r.stdout}${r.stderr}`;
    assert(
      "date_table を書くと「カレンダーごとにofferを分ける」案内が出る",
      r.status !== 0 && /カレンダーごとに offer を分けて/.test(out),
      out.split("\n").filter((l) => /date_table/.test(l)).slice(0, 1).join(""),
    );
  } finally {
    fs.rmSync(dtDir, { recursive: true, force: true });
  }

  // 購入期限は「当日買えるか」の1ビットだけが計算に使われていた。
  // 日数・時刻の構造化と mode ラベルは廃止し、詳細は公式表記のまま置く
  assert(
    "purchase_deadline_modes 群が廃止されている",
    taxonomyRaw.groups.purchase_deadline_modes === undefined,
    JSON.stringify(Object.keys(taxonomyRaw.groups)),
  );
  const pdSchema = (() => {
    const find = (n) => {
      if (!n || typeof n !== "object") return null;
      if (n.properties?.purchase_deadline) return n.properties.purchase_deadline;
      for (const v of Object.values(n)) {
        const hit = find(v);
        if (hit) return hit;
      }
      return null;
    };
    return find(schemaRaw);
  })();
  assert(
    "purchase_deadline は当日可否・何日前・固定期限・公式表記の4軸",
    Object.keys(pdSchema?.properties ?? {})
      .filter((k) => !["notes_ja", "source_refs"].includes(k))
      .sort()
      .join(",") === "days_before_use,deadline_date,official_text_ja,same_day_allowed",
    JSON.stringify(Object.keys(pdSchema?.properties ?? {})),
  );
  assert(
    "期限の表し方を分類する mode は残っていない",
    pdSchema?.properties?.mode === undefined,
    JSON.stringify(Object.keys(pdSchema?.properties ?? {})),
  );
  assert(
    "当日内の分単位の期限は構造化しない（1日単位の判定に効かないため）",
    ["time_of_day", "minutes_before_use"].every(
      (k) => pdSchema?.properties?.[k] === undefined,
    ) && /official_text_ja だけに書く/.test(pdSchema?.properties?.days_before_use?.description ?? ""),
    pdSchema?.properties?.days_before_use?.description,
  );
  assert(
    "記載なしを推測で埋めないと明記されている",
    /推測してはいけない/.test(pdSchema?.properties?.same_day_allowed?.description ?? ""),
    pdSchema?.properties?.same_day_allowed?.description,
  );

  // 「今日は何日で、行くのは何日後だから買えるか」を実際に判定できること。
  // --today で固定しないとシステム日付に依存してテストが壊れる
  const YUKI = path.join(TESTS_DIR, "fixtures", "valid", "yukigaoka-2025-2026.json");
  const askOn = (today) => {
    const r = run(path.join(SKILL_DIR, "scripts", "lookup-price.mjs"), [
      YUKI, "--date", "2026-01-08", "--today", today,
      "--audience", "adult", "--day-pass", "--json",
    ]);
    if (r.status !== 0) return { error: `${r.stdout}${r.stderr}` };
    const parsed = JSON.parse(r.stdout);
    return parsed.offers.find((o) => o.id === "offer-adult-day-web-advance");
  };

  const early = askOn("2025-12-25");
  assert(
    "14日前の照会では前売りがまだ買えると判定される",
    early?.purchasability?.purchasable === true &&
      /あと13日/.test(early?.purchasability?.reason_ja ?? ""),
    JSON.stringify(early?.purchasability),
  );
  const lastDay = askOn("2026-01-07");
  assert(
    "購入期限当日の照会では「今日が購入期限」と判定される",
    lastDay?.purchasability?.purchasable === true &&
      /今日が購入期限/.test(lastDay?.purchasability?.reason_ja ?? ""),
    JSON.stringify(lastDay?.purchasability),
  );
  const tooLate = askOn("2026-01-08");
  assert(
    "利用日当日の照会では前売りが買えないと判定される",
    tooLate?.purchasability?.purchasable === false &&
      /1日前までに購入が必要/.test(tooLate?.purchasability?.reason_ja ?? ""),
    JSON.stringify(tooLate?.purchasability),
  );
  const sameDay = (() => {
    const r = run(path.join(SKILL_DIR, "scripts", "lookup-price.mjs"), [
      YUKI, "--date", "2026-01-08", "--today", "2026-01-08",
      "--audience", "adult", "--day-pass", "--json",
    ]);
    return JSON.parse(r.stdout).offers.find((o) => o.id === "offer-adult-day-web-dynamic");
  })();
  assert(
    "当日購入可の券は利用日当日でも買えると判定される",
    sameDay?.purchasability?.purchasable === true,
    JSON.stringify(sameDay?.purchasability),
  );

  const pdDir = fs.mkdtempSync(path.join(os.tmpdir(), "lift-ticket-pd-"));
  try {
    // 窓口だけで買う券に期限を書かせない（「当日その場で買う」以外の選択肢が無い）
    const onsite = JSON.parse(JSON.stringify(data));
    const windowOffer = onsite.offers.find((o) =>
      (o.channel_ids ?? []).some((id) => {
        const ch = onsite.channels.find((c) => c.id === id);
        return ch && !ch.url;
      }),
    );
    windowOffer.purchase_deadline = {
      same_day_allowed: true,
      official_text_ja: "当日購入OK",
      notes_ja: null,
      source_refs: windowOffer.source_refs,
    };
    const onsiteFile = path.join(pdDir, "onsite-with-deadline.json");
    fs.writeFileSync(onsiteFile, JSON.stringify(onsite));
    const r1 = run(SCRIPTS.taxonomy, [onsiteFile]);
    const out1 = `${r1.stdout}${r1.stderr}`;
    assert(
      "窓口で買える券に購入期限を書くと不要だと指摘される",
      /現地購入だけなら purchase_deadline は不要/.test(out1),
      out1.split("\n").filter((l) => /purchase_deadline/.test(l)).slice(0, 1).join(""),
    );

    // オンライン券には必須（「今日これを買えるのか」が実際に問われる）
    const online = JSON.parse(JSON.stringify(data));
    const webOffer = online.offers.find((o) =>
      (o.discount_reasons ?? []).includes("online_purchase"),
    );
    delete webOffer.purchase_deadline;
    const onlineFile = path.join(pdDir, "online-no-deadline.json");
    fs.writeFileSync(onlineFile, JSON.stringify(online));
    const r2 = run(SCRIPTS.taxonomy, [onlineFile]);
    const out2 = `${r2.stdout}${r2.stderr}`;
    assert(
      "オンライン券に購入期限が無いとエラーになる",
      r2.status !== 0 && /purchase_deadline/.test(out2),
      out2.split("\n").filter((l) => /purchase_deadline/.test(l)).slice(0, 1).join(""),
    );

    // 期限があるのに公式表記が無いと「いつまでに買うか」が失われる
    const noText = JSON.parse(JSON.stringify(data));
    const webOffer2 = noText.offers.find((o) => o.purchase_deadline != null);
    webOffer2.purchase_deadline.official_text_ja = null;
    const noTextFile = path.join(pdDir, "deadline-no-text.json");
    fs.writeFileSync(noTextFile, JSON.stringify(noText));
    const r3 = run(SCRIPTS.taxonomy, [noTextFile]);
    const out3 = `${r3.stdout}${r3.stderr}`;
    // 当日買えるかと何日前かが食い違うと、購入可否の判定が逆になる
    const contradiction = JSON.parse(JSON.stringify(data));
    const anyDeadline = contradiction.offers.find((o) => o.purchase_deadline != null);
    anyDeadline.purchase_deadline = {
      ...anyDeadline.purchase_deadline,
      same_day_allowed: true,
      days_before_use: 3,
    };
    const contradictionFile = path.join(pdDir, "deadline-contradiction.json");
    fs.writeFileSync(contradictionFile, JSON.stringify(contradiction));
    const r4 = run(SCRIPTS.taxonomy, [contradictionFile]);
    const out4 = `${r4.stdout}${r4.stderr}`;
    assert(
      "当日購入可なのに3日前までの期限があるとエラーになる",
      r4.status !== 0 && /days_before_use/.test(out4),
      out4.split("\n").filter((l) => /purchase_deadline/.test(l)).slice(0, 1).join(""),
    );

    assert(
      "期限があるのに公式表記が無いとエラーになる",
      r3.status !== 0 && /official_text_ja/.test(out3),
      out3.split("\n").filter((l) => /official_text_ja/.test(l)).slice(0, 1).join(""),
    );
  } finally {
    fs.rmSync(pdDir, { recursive: true, force: true });
  }

  // price.mode は「どのフィールドが埋まっているか」で決まる。実データ290件で
  // 例外なく導出でき、しかも「mode: free なのに amount: 500」という
  // 内部矛盾を書けてしまう穴だった（それを取り締まる検査とfixtureまであった）
  assert(
    "price_modes 群が廃止されている",
    taxonomyRaw.groups.price_modes === undefined,
    JSON.stringify(Object.keys(taxonomyRaw.groups)),
  );
  assert(
    "price.mode が schema から消えている",
    schemaRaw.$defs.price.properties.mode === undefined,
    JSON.stringify(Object.keys(schemaRaw.$defs.price.properties)),
  );
  assert(
    "price.mode フィールドがどのofferにも残っていない",
    data.offers.every((o) => !("mode" in (o.price ?? {}))),
    JSON.stringify(data.offers.filter((o) => "mode" in (o.price ?? {})).map((o) => o.id)),
  );
  for (const [concept, where] of Object.entries({
    free: "amount",
    derived_discount: "base_offer_id",
    live_dynamic: "live_lookup_required",
    range: "range",
    unknown: "notes_ja",
  })) {
    const hint = taxonomyRaw.moved_elsewhere?.price_mode?.[concept];
    assert(
      `price_mode の "${concept}" は ${where} から決まると案内がある`,
      typeof hint === "string" && hint.includes(where),
      String(hint),
    );
  }

  // 金額未確定の理由は必須。かつて mode: "unknown" という明示的な宣言が
  // 「書き忘れ」と「判読不能」を区別していたので、その役目を理由の記述が引き継ぐ
  const unkDir = fs.mkdtempSync(path.join(os.tmpdir(), "lift-ticket-unkprice-"));
  try {
    const noReason = JSON.parse(JSON.stringify(data));
    noReason.offers[0].price = { currency: "JPY", amount: null, notes_ja: null };
    const noReasonFile = path.join(unkDir, "no-reason.json");
    fs.writeFileSync(noReasonFile, JSON.stringify(noReason));
    const r = run(SCRIPTS.taxonomy, [noReasonFile]);
    const out = `${r.stdout}${r.stderr}`;
    assert(
      "金額未確定に理由が無いとエラーになる（書き忘れと判読不能を区別する）",
      r.status !== 0 && /notes_ja/.test(out),
      out.split("\n").filter((l) => /price/.test(l)).slice(0, 1).join(""),
    );
  } finally {
    fs.rmSync(unkDir, { recursive: true, force: true });
  }

  assert(
    "channel_types 群が廃止されている（購入場所は URL があれば足りる）",
    taxonomyRaw.groups.channel_types === undefined,
    JSON.stringify(Object.keys(taxonomyRaw.groups)),
  );
  assert(
    "channel_type が schema から消えている",
    schemaRaw.$defs.channel.properties.channel_type === undefined &&
      !schemaRaw.$defs.channel.required.includes("channel_type"),
  );
  assert(
    "channel_type フィールドがどのchannelにも残っていない",
    data.channels.every((c) => !("channel_type" in c)),
    JSON.stringify(data.channels.filter((c) => "channel_type" in c).map((c) => c.id)),
  );
  assert(
    "channel_type の行き先（url と name_ja）が案内されている",
    /url/.test(taxonomyRaw.moved_elsewhere?.channel_type ?? ""),
    String(taxonomyRaw.moved_elsewhere?.channel_type),
  );

  assert(
    "offer_types 群が廃止されている",
    taxonomyRaw.groups.offer_types === undefined,
    JSON.stringify(Object.keys(taxonomyRaw.groups)),
  );
  assert(
    "offer_type が schema から消えている",
    schemaRaw.$defs.offer.properties.offer_type === undefined &&
      !schemaRaw.$defs.offer.required.includes("offer_type"),
  );
  assert(
    "offer_type フィールドがどのofferにも残っていない",
    data.offers.every((o) => !("offer_type" in o)),
    JSON.stringify(data.offers.filter((o) => "offer_type" in o).map((o) => o.id)),
  );
  // 変動価格の検出は offer_type との食い違いではなく、証拠側の文言と
  // observed_amount（取得時点の観測値）で行う。offer_type を消しても
  // 「変動価格を固定価格として保存する」穴が開かないことを確かめる
  const dynDir = fs.mkdtempSync(path.join(os.tmpdir(), "lift-ticket-dyn-"));
  try {
    const dyn = JSON.parse(JSON.stringify(data));
    dyn.offers[0].price = {
      currency: "JPY",
      amount: 6200,
      observed_amount: 6200,
      observed_at: "2026-07-18T02:05:30Z",
      notes_ja: null,
    };
    const dynFile = path.join(dynDir, "observed-as-fixed.json");
    fs.writeFileSync(dynFile, JSON.stringify(dyn));
    const dynResult = run(SCRIPTS.taxonomy, [dynFile]);
    const dynOut = `${dynResult.stdout}${dynResult.stderr}`;
    assert(
      "observed_amount があるのに固定料金だとエラーになる（観測値を確定料金にする穴）",
      dynResult.status !== 0 && /live_lookup_required/.test(dynOut),
      dynOut.split("\n").filter((l) => /observed_amount/.test(l)).slice(0, 1).join(""),
    );
  } finally {
    fs.rmSync(dynDir, { recursive: true, force: true });
  }

  for (const [concept, where] of Object.entries({
    discounted: "discount_reasons",
    free: "price.amount",
    package: "included_items",
    dynamic: "price.live_lookup_required",
  })) {
    const hint = taxonomyRaw.moved_elsewhere?.offer_type?.[concept];
    assert(
      `offer_type の "${concept}" は ${where} で表すよう案内がある`,
      typeof hint === "string" && hint.includes(where),
      String(hint),
    );
  }

  // 付帯情報は専用フィールドが担い、validity は利用単位だけを表す
  assert(
    "ランチパック1日券は calendar_day（セットは included_items が表す）",
    byLabel("ランチパック")?.validity?.mode === "calendar_day" &&
      (byLabel("ランチパック")?.included_items ?? []).length > 0,
    JSON.stringify(byLabel("ランチパック")),
  );
  assert(
    "2山共通1日券は calendar_day（共通券は shared_with_resorts が表す）",
    byLabel("共通")?.validity?.mode === "calendar_day" &&
      (byLabel("共通")?.shared_with_resorts ?? []).length > 0,
    JSON.stringify(byLabel("共通")),
  );
  assert(
    "ナイター券は fixed_time_window と covers_hours_types で時間帯を表す",
    byLabel("ナイター")?.validity?.mode === "fixed_time_window" &&
      byLabel("ナイター")?.validity?.start_time != null &&
      JSON.stringify(byLabel("ナイター")?.covers_hours_types) ===
        JSON.stringify(["night"]),
    JSON.stringify(byLabel("ナイター")),
  );
  assert(
    "covers_hours_types は1日券・複数日券・時間帯固定券にのみ付く",
    data.products.every(
      (p) =>
        p.covers_hours_types == null ||
        [
          "calendar_day",
          "consecutive_days",
          "selectable_days",
          "fixed_time_window",
        ].includes(p.validity.mode),
    ),
    JSON.stringify(
      data.products
        .filter((p) => p.covers_hours_types != null)
        .map((p) => [p.id, p.validity.mode]),
    ),
  );
  assert(
    "hours_band は schema と実データのどちらにも存在しない",
    !JSON.stringify(schemaRaw).includes('"hours_band"') &&
      data.products.every((p) => !("hours_band" in (p.validity ?? {}))),
  );

  const hoursBandDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "lift-ticket-hours-band-"),
  );
  try {
    const withoutCovers = JSON.parse(JSON.stringify(data));
    const nightProduct = withoutCovers.products.find(
      (p) => p.validity?.mode === "fixed_time_window",
    );
    nightProduct.covers_hours_types = null;
    const withoutCoversFile = path.join(
      hoursBandDir,
      "fixed-window-without-covers.json",
    );
    fs.writeFileSync(withoutCoversFile, JSON.stringify(withoutCovers));
    const result = run(SCRIPTS.taxonomy, [withoutCoversFile]);
    const output = `${result.stdout}${result.stderr}`;
    assert(
      "fixed_time_window では covers_hours_types が必須",
      result.status !== 0 &&
        /fixed_time_window.*covers_hours_types が必須/.test(output),
      output,
    );
  } finally {
    fs.rmSync(hoursBandDir, { recursive: true, force: true });
  }
  assert(
    "resort は id のみ（名称・都道府県は SkiResort マスタが正本）",
    Object.keys(data.resort).join(",") === "id",
    JSON.stringify(data.resort),
  );

  // 表示用の分類は validity から導出できる
  const LOOKUP = path.join(SKILL_DIR, "scripts", "lookup-price.mjs");
  const r = run(LOOKUP, [F, "--date", "2026-01-14", "--audience", "adult", "--json"]);
  const offers = JSON.parse(r.stdout).offers;
  assert(
    "1日券の分類名が validity から導出される",
    offers.some((o) => o.category_ja === "1日券"),
    JSON.stringify(offers.map((o) => o.category_ja)),
  );
  assert(
    "時間帯固定券の分類名に時間帯が入る",
    offers.some((o) => /時間帯固定券（\d{2}:\d{2}〜\d{2}:\d{2}）/.test(o.category_ja ?? "")),
    JSON.stringify(offers.map((o) => o.category_ja)),
  );

}

console.log("== パーティ構成での料金計算（繰り返しと組み合わせ） ==");
{
  const LOOKUP = path.join(SKILL_DIR, "scripts", "lookup-price.mjs");
  const F = path.join(TESTS_DIR, "fixtures", "valid", "yukigaoka-2025-2026.json");
  const q = (args, file = F) => {
    const r = run(LOOKUP, [file, ...args, "--json"]);
    if (r.status !== 0) return { error: `${r.stdout}${r.stderr}` };
    return JSON.parse(r.stdout);
  };
  const ruleSteps = (calc) =>
    (calc?.best?.steps ?? []).filter((step) => step.kind === "party_rule");
  const individualStep = (calc) =>
    (calc?.best?.steps ?? []).find((step) => step.kind === "individual");

  // 大人2＋小学生2: 個別18,400円よりファミリーパック14,000円が安い
  const family = q(["--date", "2026-01-14", "--party", "adult:2,elementary:2"]);
  const calc = family.party_calculation;
  assert(
    "ファミリーパック¥14,000が個別購入¥18,400より安く選ばれる",
    calc?.best?.total_amount === 14000 &&
      ruleSteps(calc).some((step) => step.rule_id === "rule-family-pack"),
    JSON.stringify(calc?.best),
  );
  assert(
    "個別購入の合計も併記され、差額が出る",
    calc?.individual_total === 18400 && calc?.saving_vs_individual === 4400,
    `${calc?.individual_total} / ${calc?.saving_vs_individual}`,
  );
  assert(
    "セット料金の内訳が合計と矛盾しない",
    ruleSteps(calc)[0]?.covered?.filter((c) => c.amount != null).length === 1 &&
      ruleSteps(calc)[0].covered.find((c) => c.amount != null).amount === 14000,
    JSON.stringify(ruleSteps(calc)[0]?.covered),
  );

  // ナイター券を「大人の最安」に選ばない（時間帯固定の券は制約付き）
  const solo = q(["--date", "2026-01-14", "--party", "adult:1"]);
  assert(
    "ナイター券(¥2,500)を大人の最安として選ばない",
    individualStep(solo.party_calculation)?.breakdown?.find(
      (b) => b.audience_id === "adult",
    )?.unit_amount === 6000,
    JSON.stringify(individualStep(solo.party_calculation)?.breakdown),
  );

  // 大人1名につき未就学児2名まで無料
  const companion = q(["--date", "2026-01-14", "--party", "adult:1,preschool:2"]);
  const companionCalc = companion.party_calculation;
  assert(
    "未就学児無料ルールが適用され大人1名分のみ課金される",
    companionCalc?.best?.total_amount === 6000 &&
      ruleSteps(companionCalc).some(
        (step) =>
          step.rule_id === "rule-preschool-free" &&
          step.covered.find((c) => c.role_ja === "未就学児")?.count === 2,
      ),
    JSON.stringify(companionCalc?.best),
  );

  // 人数条件を満たさないルールは適用しない
  const notEnough = q(["--date", "2026-01-14", "--party", "adult:2,elementary:1"]);
  assert(
    "ファミリーパックの人数条件（大人2＋小学生2）を満たさなければ適用しない",
    !ruleSteps(notEnough.party_calculation).some(
      (step) => step.rule_id === "rule-family-pack",
    ),
    JSON.stringify(ruleSteps(notEnough.party_calculation).map((s) => s.rule_id)),
  );

  // 存在しない audience はエラーを返す
  const bad = q(["--date", "2026-01-14", "--party", "nobody:1"]);
  assert(
    "存在しないaudienceを指定するとエラーを返す",
    /audience が見つかりません/.test(bad.party_calculation?.error_ja ?? ""),
    JSON.stringify(bad.party_calculation),
  );

  // 無条件の0円offerが人数上限を回避する穴を検出すること
  const bypassDir = fs.mkdtempSync(path.join(os.tmpdir(), "lift-ticket-bypass-"));
  try {
    const bypass = JSON.parse(fs.readFileSync(F, "utf8"));
    const freeOffer = bypass.offers.find((o) => o.id === "offer-preschool-free");
    freeOffer.target_qualification = null; // 同伴条件を落とす＝誰でも無料になる
    const bypassFile = path.join(bypassDir, "party-rule-bypass.json");
    fs.writeFileSync(bypassFile, JSON.stringify(bypass));
    const r = run(SCRIPTS.taxonomy, [bypassFile]);
    const out = `${r.stdout}${r.stderr}`;
    assert(
      "無条件の0円offerで人数上限が回避されるとエラーになる",
      r.status !== 0 && /人数上限/.test(out),
      out.split("\n").filter((l) => /offers/.test(l)).slice(0, 1).join(""),
    );
  } finally {
    fs.rmSync(bypassDir, { recursive: true, force: true });
  }

  // ★ルールの繰り返しと組み合わせ。
  // 「親1人＋子供1人のペア券」しかないスキー場に親2＋子供3で行くなら
  // ペア券×2＋残り1人が正しい。1回しか適用しないと高すぎる金額になる
  const pairDir = fs.mkdtempSync(path.join(os.tmpdir(), "lift-ticket-pair-"));
  try {
    const base = JSON.parse(fs.readFileSync(F, "utf8"));
    base.party_rules = base.party_rules.filter((r) => r.id !== "rule-family-pack");
    base.party_rules.push({
      id: "rule-pair",
      name_ja: "親子ペア券",
      official_label_ja: "親子ペア1日券",
      description_ja: "大人1名＋小学生1名の1日券セットで8,000円。",
      calendar_ids: [],
      channel_ids: [],
      target_genders: null,
      target_qualification: null,
      components: [
        {
          role_ja: "大人",
          audience_ids: ["adult"],
          product_ids: [],
          offer_ids: [],
          min_count: 1,
          max_count: 1,
          per_qualifying_count: null,
          price_effect: { type: "fixed_total", amount: 8000, percent: null, notes_ja: null },
          notes_ja: null,
        },
        {
          role_ja: "小学生",
          audience_ids: ["elementary"],
          product_ids: [],
          offer_ids: [],
          min_count: 1,
          max_count: 1,
          per_qualifying_count: null,
          price_effect: null,
          notes_ja: null,
        },
      ],
      sales_period: null,
      use_period: null,
      requirements: [],
      source_refs: ["src-page-ryokin"],
      notes_ja: null,
    });
    const pairFile = path.join(pairDir, "pair-pack.json");
    fs.writeFileSync(pairFile, JSON.stringify(base));

    const two = q(["--date", "2026-01-14", "--party", "adult:2,elementary:3"], pairFile);
    const twoCalc = two.party_calculation;
    const pairStep = ruleSteps(twoCalc).find((step) => step.rule_id === "rule-pair");
    assert(
      "ペア券が2組ぶん適用され、残り1人は個別料金になる（¥8,000×2＋¥3,200）",
      twoCalc?.best?.total_amount === 19200 &&
        pairStep?.applications === 2 &&
        pairStep?.amount === 16000 &&
        individualStep(twoCalc)?.breakdown?.some(
          (b) => b.audience_id === "elementary" && b.count === 1,
        ),
      JSON.stringify(twoCalc?.best),
    );

    // 未就学児が無料のスキー場なら、ペア券×2 と未就学児無料が同時に成立する
    const mixed = q(
      ["--date", "2026-01-14", "--party", "adult:2,elementary:2,preschool:1"],
      pairFile,
    );
    const mixedCalc = mixed.party_calculation;
    assert(
      "ペア券×2と未就学児無料が同時に成立する（¥16,000）",
      mixedCalc?.best?.total_amount === 16000 &&
        ruleSteps(mixedCalc).find((s) => s.rule_id === "rule-pair")?.applications === 2,
      JSON.stringify(mixedCalc?.best),
    );

    // 「大人1名につき未就学児2名まで」の上限が無条件offerで回避されないこと。
    // 実際にこの穴があり、親1人＋未就学児5人でも全員無料になっていた
    const over = q(["--date", "2026-01-14", "--party", "adult:1,preschool:3"]);
    assert(
      "無料枠（大人1人につき2人）を超える人数は料金を出せないと明示する",
      over.party_calculation?.best == null &&
        (over.party_calculation?.unresolved ?? []).some(
          (u) => u.audience_id === "preschool",
        ),
      JSON.stringify(over.party_calculation),
    );

    // ルールを使うと高くなる場合は使わない（探索が最安を選ぶ）
    const single = q(["--date", "2026-01-14", "--party", "adult:1"], pairFile);
    assert(
      "ペア券の人数条件を満たさない1人なら個別料金になる",
      single.party_calculation?.best?.total_amount === 6000 &&
        ruleSteps(single.party_calculation).length === 0,
      JSON.stringify(single.party_calculation?.best),
    );
  } finally {
    fs.rmSync(pairDir, { recursive: true, force: true });
  }
}

console.log("== 1日券・ナイター・複数日券の扱い ==");
{
  const LOOKUP = path.join(SKILL_DIR, "scripts", "lookup-price.mjs");
  const F = path.join(TESTS_DIR, "fixtures", "valid", "daypass-test-2025-2026.json");
  const q = (args) => {
    const r = run(LOOKUP, [F, ...args, "--json"]);
    if (r.status !== 0) return { error: `${r.stdout}${r.stderr}` };
    return JSON.parse(r.stdout);
  };
  const A = ["--audience", "adult"];

  // 1日券がある場合はそれを出す
  const day = q(["--date", "2026-01-14", ...A, "--day-pass"]);
  assert(
    "1日券があれば1日券¥6,000を出す",
    day.selection?.mode === "day_pass" && day.selection?.total_amount === 6000,
    JSON.stringify(day.selection),
  );

  // ナイター込み1日券があればそれ
  const night = q(["--date", "2026-01-31", ...A, "--day-pass", "--with-night"]);
  assert(
    "ナイター込み1日券があれば¥7,000を出す",
    night.selection?.mode === "day_pass_with_night" && night.selection?.total_amount === 7000,
    JSON.stringify(night.selection),
  );

  // ナイター営業がない日に --with-night → 明示する
  const noNight = q(["--date", "2026-01-14", ...A, "--day-pass", "--with-night"]);
  assert(
    "ナイター営業がない日はその旨を出す",
    (noNight.selection?.notes_ja ?? []).some((n) => /ナイター営業がありません/.test(n)),
    JSON.stringify(noNight.selection?.notes_ja),
  );

  // 25時間券（hours_pool）を単日の代表にしない
  const h5 = q(["--date", "2026-01-14", ...A, "--hours", "5"]);
  assert(
    "5時間希望の代表は1日券¥6,000（25時間券¥5,000を代表にしない）",
    h5.selection?.representative?.id === "offer-day-1",
    JSON.stringify(h5.selection?.representative),
  );
  assert(
    "25時間券は「複数日に分けて使う券」として別掲される",
    (h5.selection?.cheaper_alternatives ?? []).some(
      (a) => a.id === "offer-hours-25" && /複数日に分けて使う券/.test(a.why_not_representative),
    ),
    JSON.stringify(h5.selection?.cheaper_alternatives),
  );
  assert(
    "1日券の滑走時間が営業時間から算出される（08:30〜16:30 = 8時間）",
    h5.selection?.representative?.skiable_hours === 8,
    String(h5.selection?.representative?.skiable_hours),
  );
  // 連続2日券を単日の代表にしない
  const d2 = q(["--date", "2026-01-14", ...A, "--hours", "8"]);
  assert(
    "連続2日券は単日の代表にならない",
    d2.selection?.representative?.id !== "offer-day-2",
    JSON.stringify(d2.selection?.representative),
  );

  // 1日券が存在しないスキー場（めがひら実データ）
  const REAL = path.join(
    SKILL_DIR, "..", "..", "..",
    "src/private/data/lift-ticket/megahira-onsen-megahira/tickets/2025-2026.json",
  );
  if (fs.existsSync(REAL)) {
    const qr = (args) => {
      const r = run(LOOKUP, [REAL, ...args, "--json"]);
      if (r.status !== 0) return { error: `${r.stdout}${r.stderr}` };
      return JSON.parse(r.stdout);
    };
    const sub = qr(["--date", "2026-01-28", ...A, "--day-pass"]);
    assert(
      "1日券が無いスキー場では最長の9時間券で代替する",
      sub.selection?.mode === "substituted_hours_pass" &&
        sub.selection?.substituted_hours === 9 &&
        sub.selection?.total_amount === 6300,
      JSON.stringify(sub.selection),
    );
    assert(
      "代替したことを明示する",
      (sub.selection?.notes_ja ?? []).some((n) => /1日券はありません/.test(n)),
      JSON.stringify(sub.selection?.notes_ja),
    );

    // 「もっと安い」を理由なしで並べると「もっと安い1日券がある」と誤読される
    const alts = sub.selection?.cheaper_alternatives ?? [];
    assert(
      "制約の理由にラベル名が生で出ない（UIに advance_purchase_required と出ていた）",
      (sub.selection?.cheaper_alternatives ?? []).every(
        (a) => !/[a-z]+_(required|fixed):/.test(a.why_not_representative),
      ),
      JSON.stringify(
        (sub.selection?.cheaper_alternatives ?? []).map((a) => a.why_not_representative),
      ),
    );
    assert(
      "1日券モードの安い候補すべてに理由が付く（null で出さない）",
      alts.length > 0 && alts.every((a) => typeof a.why_not_representative === "string" && a.why_not_representative.length > 0),
      JSON.stringify(alts.map((a) => [a.name_ja, a.why_not_representative])),
    );
    assert(
      "回数券は「1日券ではない」と説明される",
      alts.some((a) => /リフト1回券/.test(a.name_ja) && /1日券ではない/.test(a.why_not_representative)),
      JSON.stringify(alts.find((a) => /リフト1回券/.test(a.name_ja))),
    );
    assert(
      "ゴゴイチ券は「時間が足りない」と「午後のみ」の両方が説明される",
      alts.some(
        (a) =>
          /ゴゴイチ/.test(a.name_ja) &&
          /1日分をカバーしない/.test(a.why_not_representative) &&
          /利用時間帯が固定/.test(a.why_not_representative),
      ),
      JSON.stringify(alts.find((a) => /ゴゴイチ/.test(a.name_ja))),
    );

    // ナイター日は営業13時間だが最長9時間券しかない
    const shortfall = qr(["--date", "2026-02-28", ...A, "--day-pass", "--with-night"]);
    assert(
      "ナイター日に9時間券では営業時間をカバーできないと明示する",
      shortfall.selection?.covers_full_day === false &&
        (shortfall.selection?.notes_ja ?? []).some((n) => /カバーできません/.test(n)),
      JSON.stringify(shortfall.selection),
    );
    assert(
      "ナイター券の料金が資料に無いことを明示する（推測しない）",
      (shortfall.selection?.notes_ja ?? []).some((n) => /記載されていません/.test(n)),
      JSON.stringify(shortfall.selection?.notes_ja),
    );
  }
}

console.log("== シーズン判定: 内容から料金の年度を特定し、宣言と照合すること ==");
{
  const { detectSeason, extractDateWeekdayPairs } = await import(
    path.join(SKILL_DIR, "scripts", "seasonDetect.mjs")
  );
  const detect = (pages, declared) =>
    detectSeason(
      pages.map((text, i) => ({ pageId: `page-00${i + 1}`, text })),
      declared,
      2026,
    );

  // 日付＋曜日は年が変われば曜日も変わるので、複数あればシーズンが一意に決まる
  assert(
    "「12/26（金）」形式を抽出できる",
    extractDateWeekdayPairs("12/26（金）はイベント").length === 1,
  );
  assert(
    "「12月26日(金)」形式も抽出できる",
    extractDateWeekdayPairs("12月26日(金)").length === 1,
  );
  assert(
    "同じ表記の重複は1件として数える",
    extractDateWeekdayPairs("12/26（金）と12/26（金）").length === 1,
  );

  // めがひらの実データと同じ組み合わせ。2025-2026 でのみ全件成立する
  const real = ["12/12（金） 12/26（金） 12/27（土） 1/10（土） 1/31（土） 2/28（土）"];
  const match = detect(real, "2025-2026");
  assert(
    "日付＋曜日から2025-2026と判定される",
    match.verdict === "match" && match.detected === "2025-2026",
    JSON.stringify({ v: match.verdict, d: match.detected, b: match.basis }),
  );
  assert(
    "他の年は候補から除外される",
    match.candidates_from_weekdays.length === 1,
    JSON.stringify(match.candidates_from_weekdays),
  );

  // 11月に取りに行ってサイトが前シーズンのままだったケース
  const stale = detect(real, "2026-2027");
  assert(
    "前シーズンの内容なら mismatch になる",
    stale.verdict === "mismatch" && stale.detected === "2025-2026",
    JSON.stringify({ v: stale.verdict, d: stale.detected }),
  );

  // 一部のページだけ新シーズンに更新されているケース
  const conflicting = detect(["12/26（金）", "12/26（土）"], "2026-2027");
  assert(
    "ページ間で年が矛盾すると conflicting になる",
    conflicting.verdict === "conflicting" && conflicting.detected === null,
    JSON.stringify({ v: conflicting.verdict, b: conflicting.basis }),
  );

  // 年号も日付も無いサイト（人間の確認が必要）
  const nothing = detect(["大人 6,300円 子供 4,300円"], "2026-2027");
  assert(
    "手がかりが無いと undetermined になる",
    nothing.verdict === "undetermined" && nothing.detected === null,
    JSON.stringify({ v: nothing.verdict, b: nothing.basis }),
  );

  // 年号の範囲表記だけがあるケース
  const range = detect(["営業期間 2026.12～2027.3"], "2026-2027");
  assert(
    "「2026.12～2027.3」から2026-2027と判定される",
    range.verdict === "match" && range.detected === "2026-2027",
    JSON.stringify({ v: range.verdict, d: range.detected }),
  );
  assert(
    "「令和8年度」から2026-2027と判定される",
    detect(["令和8年度 リフト料金"], "2026-2027").detected === "2026-2027",
  );
  assert(
    "「2026-27シーズン」から2026-2027と判定される",
    detect(["2026-27シーズン 料金表"], "2026-2027").detected === "2026-2027",
  );

  // 料金ページ自体に手がかりが無くても、別ページから確定できること
  const crossPage = detect(
    ["大人 6,300円 子供 4,300円", "営業カレンダー 12/12（金）～3/8（日） 1/31（土）"],
    "2025-2026",
  );
  assert(
    "料金ページに記載が無くても別ページの日付で確定できる",
    crossPage.verdict === "match" && crossPage.detected === "2025-2026",
    JSON.stringify({ v: crossPage.verdict, d: crossPage.detected }),
  );
  assert(
    "どのページに手がかりがあるかがページ単位で記録される",
    crossPage.by_page["page-001"].weekday_pairs === 0 &&
      crossPage.by_page["page-002"].weekday_pairs >= 2,
    JSON.stringify(crossPage.by_page),
  );

  // 存在しない日付を根拠にしない
  assert(
    "2/30 のような不正な日付は候補を成立させない",
    detect(["2/30（金）"], "2025-2026").verdict !== "match",
  );
}

console.log("== タイル分割: 長辺1568px未満に収まり、境界が重なること ==");
{
  const { tileRanges, TILE_HEIGHT, TILE_OVERLAP } = await import(
    path.join(SKILL_DIR, "scripts", "pageAssets.mjs")
  );
  assert(
    "タイル高さが縮小されない範囲（<=1568px）",
    TILE_HEIGHT <= 1568,
    String(TILE_HEIGHT),
  );

  const short = tileRanges(900);
  assert("ページがタイル1枚に収まる場合は1枚", short.length === 1, JSON.stringify(short));
  assert("1枚のときはページ高さぴったり", short[0].height === 900, JSON.stringify(short));

  const long = tileRanges(7785);
  assert("実測の縦7785pxが複数タイルに分かれる", long.length >= 5, String(long.length));
  assert(
    "全タイルが縮小されない高さ",
    long.every((r) => r.height <= 1568 && r.height > 0),
    JSON.stringify(long),
  );
  assert(
    "隣接タイルが重なる（境界で表の行が切れない）",
    long.every((r, i) => i === 0 || r.y < long[i - 1].y + long[i - 1].height),
    JSON.stringify(long.map((r) => [r.y, r.height])),
  );
  assert(
    `重なりが${TILE_OVERLAP}pxある`,
    long[1].y === long[0].y + TILE_HEIGHT - TILE_OVERLAP,
    JSON.stringify(long.slice(0, 2)),
  );
  assert(
    "最後のタイルがページ末尾で終わる",
    long.at(-1).y + long.at(-1).height === 7785,
    JSON.stringify(long.at(-1)),
  );
  assert(
    "ページ全体が隙間なく覆われる",
    long.every((r, i) => i === 0 || r.y <= long[i - 1].y + long[i - 1].height),
    JSON.stringify(long),
  );
}

if (withCapture) {
  console.log("== capture-sources: file:// のHTML fixtureを取得 ==");
  const tmpDir = path.join(TESTS_DIR, ".tmp");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const pageUrl = pathToFileURL(
    path.join(TESTS_DIR, "fixtures", "capture", "price-page.html"),
  ).href;
  const sourceDir = path.join(tmpDir, "lift-ticket-source");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(
    path.join(sourceDir, "test-resort.json"),
    JSON.stringify(
      { urls: [{ url: pageUrl, label_ja: "料金ページ(fixture)" }] },
      null,
      2,
    ),
  );

  const outDir = path.join(tmpDir, "lift-ticket");
  const result = run(path.join(SKILL_DIR, "scripts", "capture-sources.mjs"), [
    "--source-dir",
    sourceDir,
    "--resort",
    "test-resort",
    "--season",
    "2025-2026",
    "--out",
    outDir,
  ]);
  assert("capture-sources 実行 (exit 0)", result.status === 0, `${result.stdout}${result.stderr}`);

  const seasonDir = path.join(outDir, "test-resort", "sources", "2025-2026");
  const manifestPath = path.join(seasonDir, "manifest.json");
  assert("manifest.json が生成される", fs.existsSync(manifestPath));
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert("manifestに成功したpageがある", manifest.pages?.[0]?.success === true);
    const pageDir = path.join(seasonDir, manifest.pages[0].dir);
    assert("page.html が保存される", fs.existsSync(path.join(pageDir, "page.html")));
    assert(
      "screens/full.jpg が保存される（人間の確認用）",
      fs.existsSync(path.join(pageDir, "screens", "full.jpg")),
    );
    assert("links.json が保存される", fs.existsSync(path.join(pageDir, "links.json")));
    const textPath = path.join(pageDir, "visible-text.txt");
    assert("visible-text.txt が保存される", fs.existsSync(textPath));
    if (fs.existsSync(textPath)) {
      const text = fs.readFileSync(textPath, "utf8");
      assert(
        "JavaScript実行後の料金テキストが含まれる",
        text.includes("6,200円"),
        text.slice(0, 500),
      );
      assert(
        "details内のWEB前売テキストが含まれる（展開操作）",
        text.includes("5,800円"),
        text.slice(0, 500),
      );
    }
    const metadata = JSON.parse(
      fs.readFileSync(path.join(pageDir, "metadata.json"), "utf8"),
    );
    assert("metadata.json に取得日時とURLがある", Boolean(metadata.fetched_at && metadata.requested_url));

    // 表のTSV化: innerText が復元不可能に壊す唯一の情報を確定させる
    const tablesPath = path.join(pageDir, "tables.md");
    assert("tables.md が生成される", fs.existsSync(tablesPath));
    if (fs.existsSync(tablesPath)) {
      const md = fs.readFileSync(tablesPath, "utf8");
      assert("表の見出しが記録される", md.includes("窓口料金"), md.slice(0, 300));
      assert(
        "平日6,000円・土日祝6,500円が正しい列に入る",
        md.includes("大人1日券\t6,000円\t6,500円"),
        md,
      );

      // セル結合表: rowspan/colspan を解決して1セル=1値にできているか
      const blocks = md.split("```").filter((b) => b.includes("\t"));
      assert("表が2件出力される", blocks.length === 2, String(blocks.length));
      const rows = blocks[1].trim().split("\n").map((r) => r.split("\t"));
      assert("セル結合ありと注記される", md.includes("セル結合あり"));
      assert("セル結合表が4列に正規化される", rows.every((r) => r.length === 4), blocks[1]);
      assert(
        "colspanのナイターが2列に複製される",
        rows[0][2] === "ナイター" && rows[0][3] === "ナイター",
        blocks[1],
      );
      assert(
        "rowspanの大人が2行に複製される",
        rows[2][0] === "大人" && rows[3][0] === "大人",
        blocks[1],
      );
      assert(
        "結合行のナイター＋温泉が正しい行・列に付く",
        rows[3][1] === "ナイター＋温泉" && rows[3][2] === "4,000円" && rows[3][3] === "4,500円",
        blocks[1],
      );
      assert("小学生行がずれない", rows[4][0] === "小学生" && rows[4][2] === "1,500円", blocks[1]);
    }

    // スクリーンショット: フルページ＋縮小されないタイル
    const screensDir = path.join(pageDir, "screens");
    assert(
      "screens/full.jpg が保存される",
      fs.existsSync(path.join(screensDir, "full.jpg")),
    );
    const tiles = fs.existsSync(screensDir)
      ? fs.readdirSync(screensDir).filter((f) => /^\d+\.jpg$/.test(f)).sort()
      : [];
    assert("タイルが1枚以上保存される", tiles.length >= 1, String(tiles.length));
    const { jpegSize } = await import(path.join(SKILL_DIR, "scripts", "pageAssets.mjs"));
    for (const tile of tiles) {
      const { width, height } = jpegSize(fs.readFileSync(path.join(screensDir, tile)));
      assert(
        `タイル${tile}が縮小されないサイズ（実測 ${width}x${height}px）`,
        width > 0 && height > 0 && width <= 1568 && height <= 1568,
      );
    }
    // 同じURLを取り直したとき、ページが重複せず入れ替わること
    // （gitに含まれない screens/ を再生成するために取り直すケース）
    const second = run(path.join(SKILL_DIR, "scripts", "capture-sources.mjs"), [
      "--source-dir", sourceDir, "--resort", "test-resort",
      "--season", "2025-2026", "--out", outDir,
    ]);
    assert("再取得が成功する (exit 0)", second.status === 0, `${second.stdout}${second.stderr}`);
    const manifest2 = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert(
      "同じURLの再取得でページが重複しない",
      manifest2.pages.length === 1,
      JSON.stringify(manifest2.pages.map((p) => [p.id, p.requested_url])),
    );
    assert(
      "再取得でもページIDが維持される",
      manifest2.pages[0].id === "page-001",
      manifest2.pages[0].id,
    );
    assert(
      "再取得の旨がログに出る",
      second.stdout.includes("取り直し"),
      second.stdout,
    );
    assert(
      "再取得後もタイルが揃っている",
      fs.readdirSync(path.join(pageDir, "screens")).filter((f) => /^\d+\.jpg$/.test(f)).length >= 1,
    );

    assert(
      "manifestに表の件数とタイル数が記録される",
      manifest.pages[0].tables_extracted === 2 && manifest.pages[0].screen_tiles >= 1,
      JSON.stringify([manifest.pages[0].tables_extracted, manifest.pages[0].screen_tiles]),
    );
  }
}

console.log(`\n結果: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("失敗したテスト:");
  for (const f of failures) console.error(` - ${f.name}`);
  process.exit(1);
}
