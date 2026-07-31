#!/usr/bin/env node
/**
 * check-taxonomy-integrity.mjs
 *
 * ラベル体系そのものの健全性を検証する（料金データではなく skill 側の検査）。
 *
 * なぜ必要か:
 * ラベルが taxonomy.json と JSON Schema と説明ドキュメントの3箇所に散ると、
 * 値が食い違っても誰も気づかない。実際に school_levels は
 *   schema: "elementary" / data-model.md: "elementary_school"（さらに
 *   junior_high__school という誤記） / taxonomy.json: 群そのものが不在
 * という三重の不整合を起こしていた。モデルがドキュメントに従うと schema で落ちる。
 *
 * さらに、taxonomy に群を足しても check-taxonomy.mjs が参照しなければ
 * 「宣言されているが検証されないラベル群」になり、そこは何でも書ける。
 *
 * 検査項目:
 *   1. schema の全 enum が taxonomy の群と一致するか（二重管理の検出）
 *   2. taxonomy の全群が check-taxonomy.mjs で実際に検証されているか
 *   3. ラベル定義の記入状況（status: defined か）
 *   4. 定義の整合性（excludes_ja が実在するラベルを指しているか等）
 *
 * 使い方: node check-taxonomy-integrity.mjs [--strict]
 *   --strict を付けると、定義未記入（status: pending）も失敗扱いにする。
 */
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_SCHEMA_PATH,
  DEFAULT_TAXONOMY_PATH,
  Reporter,
  SCRIPTS_DIR,
  loadTaxonomy,
  parseArgs,
  readJson,
} from "./_lib.mjs";

const { opts } = parseArgs(process.argv.slice(2), ["taxonomy", "schema"]);
const taxonomy = loadTaxonomy(opts.taxonomy ?? DEFAULT_TAXONOMY_PATH);
const schema = readJson(opts.schema ?? DEFAULT_SCHEMA_PATH);
const checkerSource = fs.readFileSync(
  path.join(SCRIPTS_DIR, "check-taxonomy.mjs"),
  "utf8",
);

const reporter = new Reporter("taxonomy-integrity");
const signature = (values) => [...values].sort().join("|");

/** schema 内の全 enum を JSON Pointer 付きで集める */
function collectEnums(node, pointer = "") {
  const found = [];
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node.enum)) {
    found.push({
      pointer,
      values: node.enum.filter((v) => v !== null),
    });
  }
  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === "object") {
      found.push(...collectEnums(value, `${pointer}/${key}`));
    }
  }
  return found;
}

// --- 1. schema の enum と taxonomy の対応 ---
const bySignature = new Map();
for (const groupName of taxonomy.groupNames()) {
  bySignature.set(signature(taxonomy.labels(groupName)), groupName);
}
// 群のサブセットとして意図的に一部を除いている enum はここに登録する
const ALLOWED_SUBSETS = {};

for (const entry of collectEnums(schema)) {
  if (entry.values.length === 0) continue;
  const sig = signature(entry.values);
  if (bySignature.has(sig)) continue;

  const allowed = ALLOWED_SUBSETS[entry.pointer];
  if (allowed) {
    const full = taxonomy.labels(allowed.group) ?? [];
    const expected = full.filter((v) => !allowed.excluded.includes(v));
    if (signature(expected) === sig) continue;
    reporter.error(
      entry.pointer,
      `${allowed.group} のサブセットとして期待した値と一致しません（期待: ${expected.join(", ")} / 実際: ${entry.values.join(", ")}）`,
    );
    continue;
  }

  // 似ている群を探して「二重管理でドリフトしている」ことを具体的に指摘する
  let best = null;
  let bestScore = 0;
  for (const groupName of taxonomy.groupNames()) {
    const labels = taxonomy.labels(groupName);
    const overlap = entry.values.filter((v) => labels.includes(v)).length;
    const score = overlap / Math.max(entry.values.length, labels.length);
    if (score > bestScore) {
      bestScore = score;
      best = groupName;
    }
  }
  if (bestScore >= 0.5) {
    const labels = taxonomy.labels(best);
    reporter.error(
      entry.pointer,
      `taxonomy の群 "${best}" と値が食い違っています（schemaのみ: ${JSON.stringify(entry.values.filter((v) => !labels.includes(v)))} / taxonomyのみ: ${JSON.stringify(labels.filter((v) => !entry.values.includes(v)))}）。ラベルの正本は taxonomy.json です`,
    );
  } else {
    reporter.error(
      entry.pointer,
      `taxonomy 管理外の enum です（${JSON.stringify(entry.values)}）。taxonomy.json に群として登録するか、ALLOWED_SUBSETS に理由付きで登録してください`,
    );
  }
}

// --- 2. 全群が実際に検証されているか ---
for (const groupName of taxonomy.groupNames()) {
  if (!new RegExp(`["'\`]${groupName}["'\`]`).test(checkerSource)) {
    reporter.error(
      `/groups/${groupName}`,
      `check-taxonomy.mjs から参照されていません。宣言されているが検証されない群は、何でも書ける穴になります`,
    );
  }
}
for (const orderName of Object.keys(taxonomy.raw.orders ?? {})) {
  if (!new RegExp(`["'\`]${orderName}["'\`]`).test(checkerSource)) {
    reporter.error(`/orders/${orderName}`, `check-taxonomy.mjs から参照されていません`);
  }
}

// --- 3. ラベル定義の記入状況 ---
const pending = taxonomy.pendingLabels();
const total = taxonomy
  .groupNames()
  .reduce((sum, g) => sum + taxonomy.labels(g).length, 0);
if (pending.length > 0) {
  const byGroup = new Map();
  for (const item of pending) {
    const [group, label] = item.split(".");
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(label);
  }
  const message =
    `定義が未記入のラベル: ${pending.length}/${total} 件。` +
    `定義が無いとモデルはラベル名から意味を推測するため、誤ったラベル付けを防げません`;
  if (opts.strict) reporter.error("/groups", message);
  else reporter.warn("/groups", message);
  for (const [group, labels] of byGroup) {
    console.error(`  未定義 ${group}: ${labels.join(", ")}`);
  }
}

// --- 4. 定義の整合性 ---
for (const groupName of taxonomy.groupNames()) {
  const group = taxonomy.raw.groups[groupName];
  if (!group.description_ja) {
    reporter.warn(`/groups/${groupName}/description_ja`, `群の説明がありません`);
  }
  for (const [labelName, def] of Object.entries(group.labels ?? {})) {
    const at = `/groups/${groupName}/labels/${labelName}`;
    if (def.status !== "defined") continue;
    if (!def.label_ja) reporter.error(`${at}/label_ja`, `日本語名がありません`);
    if (!def.definition_ja) {
      reporter.error(`${at}/definition_ja`, `定義がありません（status: defined なのに）`);
    }
    // excludes_ja が「〇〇 → label」形式で他ラベルを指す場合、実在するか確認する
    for (const text of def.excludes_ja ?? []) {
      const match = /→\s*([a-z0-9_]+)/.exec(text);
      if (!match) continue;
      const target = match[1];
      const exists = taxonomy
        .groupNames()
        .some((g) => taxonomy.labels(g).includes(target));
      if (!exists) {
        reporter.error(
          `${at}/excludes_ja`,
          `誘導先のラベル "${target}" が taxonomy に存在しません`,
        );
      }
    }
  }
}

// --- 5. 順序の値が群に存在するか ---
for (const [orderName, values] of Object.entries(taxonomy.raw.orders ?? {})) {
  const groupName = orderName.replace(/_order$/, "").replace(/_level$/, "_levels");
  const labels = taxonomy.labels(groupName) ?? taxonomy.labels(`${groupName}s`);
  if (!labels) {
    reporter.warn(`/orders/${orderName}`, `対応する群が見つかりません`);
    continue;
  }
  for (const value of values) {
    if (!labels.includes(value)) {
      reporter.error(
        `/orders/${orderName}`,
        `"${value}" が群 "${groupName}" に存在しません`,
      );
    }
  }
}

console.log(
  `ラベル総数 ${total} 件 / 定義済み ${total - pending.length} 件 / 未記入 ${pending.length} 件`,
);
reporter.print("references/taxonomy.json");
process.exit(reporter.failed(opts.strict) ? 1 : 0);
