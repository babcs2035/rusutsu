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

  const oh = taxonomy.groups.operating_hours_types.labels;
  assert(
    "operating_hours_types 全6ラベルに定義がある",
    Object.keys(oh).length === 6 &&
      Object.values(oh).every((d) => d.status === "defined" && d.definition_ja),
    JSON.stringify(Object.keys(oh)),
  );
  assert(
    "closed は「料金を提示しない」と規定されている",
    /料金を提示しない/.test(oh.closed?.decision_rule_ja ?? ""),
    oh.closed?.decision_rule_ja,
  );

  // 個別曜日が実際に判定に効くこと（毎週火曜定休）
  const LOOKUP = path.join(SKILL_DIR, "scripts", "lookup-price.mjs");
  const REAL = path.join(
    SKILL_DIR, "..", "..", "..",
    "src/private/data/lift-ticket/megahira-onsen-megahira/tickets/2025-2026.json",
  );
  if (fs.existsSync(REAL)) {
    const q = (date) =>
      JSON.parse(run(LOOKUP, [REAL, "--date", date, "--audience", "adult", "--json"]).stdout);
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
    // 年末年始が定義されたので、平日カレンダーより優先される
    const yearEnd = q("2025-12-29");
    assert(
      "年末年始期間（12/29 月）が平日として素通りしない",
      (yearEnd.offers ?? []).length > 0,
      JSON.stringify(yearEnd.day),
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
    "condition に operator / value フィールドが残っていない",
    base.offers.every((o) =>
      (o.eligibility_conditions ?? []).every((c) => !("operator" in c) && !("value" in c)),
    ),
  );

  // 他セクションで表すべき概念を条件に書いたら、どこに書くかを案内する
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "lift-ticket-cond-"));
  try {
    const moved = {
      age: "audiences",
      school_level: "audiences",
      date: "calendars",
      time: "products.validity",
      purchase_deadline: "offers.purchase_deadline",
    };
    for (const [type, where] of Object.entries(moved)) {
      const data = JSON.parse(JSON.stringify(base));
      const offer = data.offers.find((o) => (o.eligibility_conditions ?? []).length > 0);
      offer.eligibility_conditions[0] = {
        type,
        official_label_ja: "テスト条件",
        description_ja: "テスト",
        genders: [],
        relationships: [],
        area_ids: [],
        match: null,
        proof_types: [],
        source_refs: offer.source_refs,
        notes_ja: null,
      };
      const file = path.join(tempDirectory, `${type}.json`);
      fs.writeFileSync(file, JSON.stringify(data));
      const result = run(SCRIPTS.taxonomy, [file]);
      const output = `${result.stdout}${result.stderr}`;
      assert(
        `条件に "${type}" を書くと ${where} で表すよう案内される`,
        result.status !== 0 && output.includes(where),
        output.split("\n").slice(0, 2).join("\n"),
      );
    }
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }

  // proof_types の定義
  const proof = taxonomy.groups.proof_types.labels;
  assert(
    "proof_types 全ラベルに定義がある",
    Object.values(proof).every((d) => d.status === "defined" && d.definition_ja),
    JSON.stringify(Object.entries(proof).filter(([, d]) => d.status !== "defined").map(([k]) => k)),
  );
  assert(
    "none_required は「明記されている場合のみ」と規定されている",
    /明記されている場合のみ/.test(proof.none_required?.decision_rule_ja ?? ""),
    proof.none_required?.decision_rule_ja,
  );
  assert(
    "address_proof は書類を推測しないよう規定されている",
    /これ以上具体化しない/.test(proof.address_proof?.decision_rule_ja ?? ""),
    proof.address_proof?.decision_rule_ja,
  );
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
        "covers_hours_types", "data_quality_statuses"].includes(name),
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

  // unknown 条件には公式表記と理由が必須
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "lift-ticket-unknown-"));
  try {
    const data = JSON.parse(fs.readFileSync(F, "utf8"));
    const offer = data.offers.find((o) => (o.eligibility_conditions ?? []).length > 0);
    offer.eligibility_conditions[0] = {
      type: "unknown",
      official_label_ja: null, // 公式表記を記録していない
      description_ja: null,
      genders: [],
      relationships: [],
      area_ids: [],
      match: null,
      proof_types: [],
      source_refs: offer.source_refs,
      notes_ja: null,
    };
    const file = path.join(tempDirectory, "bare-unknown.json");
    fs.writeFileSync(file, JSON.stringify(data));
    const r = run(SCRIPTS.taxonomy, [file]);
    const out = `${r.stdout}${r.stderr}`;
    assert(
      "unknown 条件に公式表記が無いとエラーになる（何を unknown にしたか伝わらない）",
      r.status !== 0 && /official_label_ja/.test(out),
      out.split("\n").filter((l) => /unknown/.test(l)).slice(0, 1).join(""),
    );
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
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
     "payment_method", "prior_purchase", "disability", "unknown"].every(
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
  assert(
    "地域割引は「資格が必要」として別掲される",
    (selection?.cheaper_alternatives ?? []).some(
      (a) => a.amount === 5000 && /資格が必要/.test(a.why_not_representative),
    ),
    JSON.stringify(selection?.cheaper_alternatives),
  );

  // ★ 条件を書き忘れた qualified_only の割引を検出する（実際にあった穴）
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "lift-ticket-applies-"));
  try {
    const data = JSON.parse(JSON.stringify(base));
    const src = data.offers.find((o) => o.id === "offer-adult-day-standard");
    const member = JSON.parse(JSON.stringify(src));
    member.id = "offer-member";
    member.name_ja = "会員割引1日券";
    member.official_label_ja = "会員割引";
    member.offer_type = "discounted";
    member.discount_reasons = ["membership"];
    member.price = { mode: "fixed", currency: "JPY", amount: 4000, notes_ja: null };
    member.eligibility_conditions = []; // 条件の書き忘れ
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
    const familyOffer = noParty.offers.find((o) => o.id === "offer-adult-day-standard");
    familyOffer.offer_type = "discounted";
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
      product_type: "other",
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
    amountOf(wed, "offer-adult-day-standard") === 6000,
    JSON.stringify(wed.day ?? wed.error),
  );
  assert(
    "平日の道民割が基準料金からの導出で5,000円",
    amountOf(wed, "offer-adult-day-dominwari") === 5000,
    JSON.stringify(wed.offers?.find((o) => o.id === "offer-adult-day-dominwari")),
  );

  const holiday = lookup(["--date", "2026-01-12", ...dayFilter]);
  assert(
    "祝日(2026-01-12)が成人の日と判定される",
    holiday.day?.holiday_name === "成人の日",
    JSON.stringify(holiday.day ?? holiday.error),
  );
  assert(
    "祝日の大人1日券が6,500円",
    amountOf(holiday, "offer-adult-day-standard") === 6500,
  );

  const newyear = lookup(["--date", "2026-01-01", ...dayFilter]);
  assert(
    "年末年始(2026-01-01)は7,000円（明示期間が祝日day_typeより優先）",
    amountOf(newyear, "offer-adult-day-standard") === 7000,
    JSON.stringify(newyear.offers?.find((o) => o.id === "offer-adult-day-standard")),
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
    "WEB前売が5,800円で前日期限(purchase_deadline)付き",
    webAdvance?.price?.amount === 5800 && webAdvance?.purchase_deadline?.mode === "relative",
    JSON.stringify(webAdvance),
  );
  const dynamic = ladies.offers?.find((o) => o.id === "offer-adult-day-web-dynamic");
  assert(
    "動的価格は金額null＋live_lookup_required＋当日購入可",
    dynamic?.price?.amount == null &&
      dynamic?.price?.live_lookup_required === true &&
      dynamic?.purchase_deadline?.mode === "same_day_allowed",
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

console.log("== 券の分類は validity 1軸（product_type は廃止） ==");
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
    "ナイター券は fixed_time_window で時間帯を表す（covers_hours_types は付けない）",
    byLabel("ナイター")?.validity?.mode === "fixed_time_window" &&
      byLabel("ナイター")?.validity?.start_time != null &&
      byLabel("ナイター")?.covers_hours_types == null,
    JSON.stringify(byLabel("ナイター")),
  );
  assert(
    "covers_hours_types は1日券・複数日券にのみ付く",
    data.products.every(
      (p) =>
        p.covers_hours_types == null ||
        ["calendar_day", "consecutive_days", "selectable_days"].includes(p.validity.mode),
    ),
    JSON.stringify(
      data.products
        .filter((p) => p.covers_hours_types != null)
        .map((p) => [p.id, p.validity.mode]),
    ),
  );
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

console.log("== パーティ構成での料金計算（party_rules の適用） ==");
{
  const LOOKUP = path.join(SKILL_DIR, "scripts", "lookup-price.mjs");
  const F = path.join(TESTS_DIR, "fixtures", "valid", "yukigaoka-2025-2026.json");
  const q = (args) => {
    const r = run(LOOKUP, [F, ...args, "--json"]);
    if (r.status !== 0) return { error: `${r.stdout}${r.stderr}` };
    return JSON.parse(r.stdout);
  };

  // 大人2＋小学生2: 個別18,400円よりファミリーパック14,000円が安い
  const family = q(["--date", "2026-01-14", "--party", "adult:2,elementary:2"]);
  const calc = family.party_calculation;
  assert(
    "ファミリーパック¥14,000が個別購入¥18,400より安く選ばれる",
    calc?.cheapest?.total_amount === 14000 &&
      calc.cheapest.rule_id === "rule-family-pack",
    JSON.stringify(calc?.cheapest),
  );
  assert(
    "個別購入の合計も併記される",
    calc?.individual_total === 18400,
    String(calc?.individual_total),
  );
  assert(
    "セット料金の内訳が合計と矛盾しない",
    calc?.cheapest?.covered?.filter((c) => c.amount != null).length === 1 &&
      calc.cheapest.covered.find((c) => c.amount != null).amount === 14000,
    JSON.stringify(calc?.cheapest?.covered),
  );

  // ナイター券を「大人の最安」に選ばない（時間帯固定の券は制約付き）
  assert(
    "ナイター券(¥2,500)を大人の最安として選ばない",
    (calc?.options ?? [])
      .find((o) => o.kind === "individual")
      ?.breakdown?.find((b) => b.audience_id === "adult")?.unit_amount === 6000,
    JSON.stringify(calc?.options?.find((o) => o.kind === "individual")?.breakdown),
  );

  // 大人1名につき未就学児2名まで無料
  const companion = q(["--date", "2026-01-14", "--party", "adult:1,preschool:2"]);
  const rule = (companion.party_calculation?.options ?? []).find(
    (o) => o.rule_id === "rule-preschool-free",
  );
  assert(
    "未就学児無料ルールが適用され大人1名分のみ課金される",
    rule?.total_amount === 6000 &&
      rule.covered.find((c) => c.role_ja === "未就学児")?.count === 2,
    JSON.stringify(rule),
  );

  // 無料枠を超えた人数はルール外として分離される
  const over = q(["--date", "2026-01-14", "--party", "adult:1,preschool:3"]);
  const overRule = (over.party_calculation?.options ?? []).find(
    (o) => o.rule_id === "rule-preschool-free",
  );
  assert(
    "無料枠（大人1人につき2人）を超えた1人はルール外に回る",
    overRule?.covered.find((c) => c.role_ja === "未就学児")?.count === 2 &&
      overRule.leftover.some((l) => l.audience_id === "preschool" && l.count === 1),
    JSON.stringify(overRule),
  );

  // 人数条件を満たさないルールは適用しない
  const notEnough = q(["--date", "2026-01-14", "--party", "adult:2,elementary:1"]);
  assert(
    "ファミリーパックの人数条件（大人2＋小学生2）を満たさなければ適用しない",
    !(notEnough.party_calculation?.options ?? []).some(
      (o) => o.rule_id === "rule-family-pack",
    ),
    JSON.stringify(notEnough.party_calculation?.options?.map((o) => o.rule_id)),
  );

  // 存在しない audience はエラーを返す
  const bad = q(["--date", "2026-01-14", "--party", "nobody:1"]);
  assert(
    "存在しないaudienceを指定するとエラーを返す",
    /audience が見つかりません/.test(bad.party_calculation?.error_ja ?? ""),
    JSON.stringify(bad.party_calculation),
  );
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
