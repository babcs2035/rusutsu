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
// 群のサブセットとして意図的に一部を除いている enum は、理由付きでここに登録する
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
// excludes_ja の誘導先として妥当なもの: ラベル / 群名 / JSONのセクション名
const validTargets = new Set([
  ...taxonomy.groupNames(),
  ...taxonomy.groupNames().flatMap((g) => taxonomy.labels(g)),
  ...Object.keys(schema.properties ?? {}),
]);

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
    // excludes_ja が「〇〇 → 誘導先」形式で他を指す場合、誘導先が実在するか確認する。
    // 誘導先はラベル名だけでなく、ラベル群名（discount_reasons 等）や
    // JSONのセクション名（audiences / fees 等）でもよい
    // （「証明書は fees へ」のように、別ラベルではなく別セクションが正解の場合がある）
    for (const text of def.excludes_ja ?? []) {
      const match = /→\s*([a-z0-9_]+)/.exec(text);
      if (!match) continue;
      const target = match[1];
      if (validTargets.has(target)) continue;
      reporter.error(
        `${at}/excludes_ja`,
        `誘導先 "${target}" が taxonomy のラベル・群・JSONのセクションのいずれにも存在しません`,
      );
    }
  }
}

// --- 5. 廃止したフィールド・群がラベル定義の文章に残っていないか ---
// 定義の文章はモデルが読む唯一の手引きなので、廃止済みのフィールド名が残ると
// 「eligibility_conditions に書け」と指示してしまう（実際に2件残っていた）。
//
// 「廃止済み」の判定は名前の一覧を手で持つのではなく、
// **taxonomy のラベル・群にも schema のどのフィールドにも存在しないこと**で行う。
// moved_elsewhere.target_restrictions のキー（purchase_deadline / membership 等）は
// 「絞り込み条件として書くな」という案内であって廃止名ではないため、この方法だと
// 誤検出しない。
function collectSchemaKeys(node, into = new Set()) {
  if (!node || typeof node !== "object") return into;
  for (const key of Object.keys(node.properties ?? {})) into.add(key);
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") collectSchemaKeys(value, into);
  }
  return into;
}
const liveNames = new Set([
  ...taxonomy.groupNames(),
  ...taxonomy.groupNames().flatMap((g) => taxonomy.labels(g)),
  ...collectSchemaKeys(schema),
]);

const abolishedCandidates = new Set([
  ...Object.keys(taxonomy.raw.moved_elsewhere ?? {}),
  // 過去に廃止した名前（moved_elsewhere に残していないもの）
  "eligibility_conditions",
  "condition_types",
  "condition_operators",
  "product_types",
  "calendar_types",
  "forbidden_aliases",
]);
abolishedCandidates.delete("target_restrictions");
const abolished = [...abolishedCandidates].filter((name) => !liveNames.has(name));

const PROSE_FIELDS = ["definition_ja", "decision_rule_ja", "includes_ja", "excludes_ja"];
for (const groupName of taxonomy.groupNames()) {
  for (const [labelName, def] of Object.entries(
    taxonomy.raw.groups[groupName].labels ?? {},
  )) {
    const prose = PROSE_FIELDS.flatMap((f) => def[f])
      .filter((v) => typeof v === "string")
      .join(" ");
    for (const name of abolished) {
      // 識別子として現れた場合だけを検出する。部分一致だと
      // 後継フィールド名（usable_within → usable_within_ja）を誤検出する
      if (!new RegExp(`(?<![a-z0-9_])${name}(?![a-z0-9_])`).test(prose)) continue;
      const hint = taxonomy.raw.moved_elsewhere?.[name];
      const where = typeof hint === "string" ? `（正しい行き先: ${hint}）` : "";
      reporter.error(
        `/groups/${groupName}/labels/${labelName}`,
        `廃止した "${name}" を定義の文章が参照しています${where}。モデルはこの文章に従うため、廃止済みの書き方を指示してしまいます`,
      );
    }
  }
}

// --- 6. 順序の値が群に存在するか ---
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
