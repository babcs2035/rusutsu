#!/usr/bin/env node
/**
 * check-fictional-coverage.mjs
 *
 * 実在施設にあって架空スキー場フィクスチャに無い「構造の特徴」を警告する
 * （docs/plans/lift-ticket-duration-test-cases.md の Y。仕様は references/fictional-fixtures.md）。
 *
 * 使い方:
 *   node check-fictional-coverage.mjs --real <file|dir> --fictional <dir> [--json]
 *        [--acknowledged <path>]
 *   --real         料金JSON1件、または src/private/data/lift-ticket のようなディレクトリ（<slug>/<season>.json）
 *   --fictional    tests/fixtures/fictional（本体 <resort>.json と variants/<CASE_ID>.json）
 *   --acknowledged 確認済み一覧（既定 references/coverage-acknowledged.json）
 *   --json         機械可読な結果を標準出力へ（テキスト出力はしない）
 *   --verbose      架空側にだけある特徴（情報）も1行ずつ出す
 *
 * 終了コード: 0=警告なし / 1=警告あり・確認済み一覧の不備（理由が空など）・読み込み失敗 / 2=使い方の誤り
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadFictional } from "./apply-fictional-variant.mjs";
import { extractFeatures } from "./lift-ticket-features.mjs";
import { REFERENCES_DIR, parseArgs, readJson } from "./_lib.mjs";

export const DEFAULT_ACKNOWLEDGED_PATH = path.join(REFERENCES_DIR, "coverage-acknowledged.json");

/** --real に渡されたファイル/ディレクトリから料金JSONの一覧を作る。 */
export function listRealFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const out = [];
  const walk = (dir, depth) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const s = fs.statSync(full);
      if (s.isDirectory() && depth < 2) walk(full, depth + 1);
      else if (s.isFile() && name.endsWith(".json")) out.push(full);
    }
  };
  walk(target, 0);
  return out;
}

/** 表示名: <slug>（同じ slug が複数あれば <slug>/<season>）。 */
export function labelRealFiles(files) {
  const slugOf = (f) => path.basename(path.dirname(f));
  const counts = new Map();
  for (const f of files) counts.set(slugOf(f), (counts.get(slugOf(f)) ?? 0) + 1);
  return files.map((f) => {
    const slug = slugOf(f);
    return counts.get(slug) > 1 ? `${slug}/${path.basename(f, ".json")}` : slug;
  });
}

/** 確認済み一覧の検査。不備は文字列の配列で返す。 */
export function validateAcknowledged(list) {
  const errors = [];
  if (!Array.isArray(list)) return ["確認済み一覧が配列ではありません"];
  list.forEach((e, i) => {
    const feature = typeof e?.feature === "string" ? e.feature.trim() : "";
    if (!feature) {
      errors.push(`確認済み一覧[${i}]: feature が空です`);
      return;
    }
    if (typeof e.reason_ja !== "string" || !e.reason_ja.trim()) {
      errors.push(`確認済み一覧: ${feature} の reason_ja（理由）が空です`);
    }
    if (e.cases != null && !(Array.isArray(e.cases) && e.cases.every((c) => typeof c === "string"))) {
      errors.push(`確認済み一覧: ${feature} の cases は文字列の配列にしてください`);
    }
  });
  return errors;
}

/**
 * 照合の本体（副作用なし）。
 * @param {{label:string, features:Set<string>}[]} real
 * @param {Map<string,string[]>} fictional 特徴 -> それを持つ架空ケースID
 * @param {{feature:string, reason_ja:string, cases?:string[]}[]} acknowledged
 */
export function computeCoverage(real, fictional, acknowledged = []) {
  const ack = new Map(acknowledged.map((e) => [e.feature, e]));
  const missing = [];
  const acknowledgedHits = [];
  const realUnion = new Set();
  for (const r of real) {
    for (const f of r.features) {
      realUnion.add(f);
      if (fictional.has(f)) continue;
      if (ack.has(f)) acknowledgedHits.push({ resort: r.label, feature: f });
      else missing.push({ resort: r.label, feature: f });
    }
  }
  const fictionalOnly = [...fictional.keys()].filter((f) => !realUnion.has(f)).sort();
  const staleAcknowledged = acknowledged
    .map((e) => e.feature)
    .filter((f) => fictional.has(f) || !realUnion.has(f));
  return { missing, acknowledgedHits, fictionalOnly, staleAcknowledged, realFeatureCount: realUnion.size };
}

/** loadFictional の結果から 特徴 -> ケースID の Map を作る。 */
export function fictionalFeatureMap(items) {
  const map = new Map();
  for (const it of items) {
    for (const f of extractFeatures(it.data)) {
      if (!map.has(f)) map.set(f, []);
      map.get(f).push(it.id);
    }
  }
  return map;
}

function main() {
  const { opts } = parseArgs(process.argv.slice(2), ["real", "fictional", "acknowledged"]);
  if (typeof opts.real !== "string" || typeof opts.fictional !== "string") {
    console.error(
      "使い方: node check-fictional-coverage.mjs --real <file|dir> --fictional <dir> [--json] [--acknowledged path] [--verbose]",
    );
    process.exit(2);
  }
  const asJson = opts.json === true;
  const problems = []; // 失敗の原因（読み込み失敗・確認済み一覧の不備）

  let items;
  try {
    items = loadFictional(opts.fictional);
  } catch (err) {
    console.error(`ERROR 架空ケースを読めません: ${err.message}`);
    process.exit(2);
  }
  if (!items.length) {
    console.error(`ERROR 架空ケースが1件もありません: ${opts.fictional}`);
    process.exit(2);
  }
  const fictional = fictionalFeatureMap(items);

  let acknowledged = [];
  const ackPath = typeof opts.acknowledged === "string" ? opts.acknowledged : DEFAULT_ACKNOWLEDGED_PATH;
  try {
    acknowledged = readJson(ackPath);
  } catch (err) {
    problems.push(`確認済み一覧を読めません: ${ackPath}（${err.message}）`);
    acknowledged = [];
  }
  problems.push(...validateAcknowledged(acknowledged));
  // 理由が空の項目は「確認済み」として扱わない（Y03）
  const validAck = Array.isArray(acknowledged)
    ? acknowledged.filter((e) => typeof e?.feature === "string" && e.feature.trim() && typeof e.reason_ja === "string" && e.reason_ja.trim())
    : [];

  let files;
  try {
    files = listRealFiles(opts.real);
  } catch (err) {
    console.error(`ERROR 実在施設のJSONを読めません: ${err.message}`);
    process.exit(2);
  }
  const labels = labelRealFiles(files);
  const real = [];
  files.forEach((file, i) => {
    try {
      real.push({ label: labels[i], features: extractFeatures(readJson(file)) });
    } catch (err) {
      problems.push(`${labels[i]}: 読み込みに失敗しました（${err.message}）`);
    }
  });

  const result = computeCoverage(real, fictional, validAck);
  const failed = result.missing.length > 0 || problems.length > 0;

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          ok: !failed,
          real_resorts: real.length,
          real_feature_count: result.realFeatureCount,
          fictional_cases: items.length,
          fictional_feature_count: fictional.size,
          missing: result.missing,
          acknowledged: result.acknowledgedHits,
          fictional_only: result.fictionalOnly,
          stale_acknowledged: result.staleAcknowledged,
          problems,
        },
        null,
        2,
      ),
    );
  } else {
    for (const m of result.missing) console.log(`${m.resort}: ${m.feature}（架空ケースなし）`);
    for (const p of problems) console.log(`ERROR ${p}`);
    for (const f of result.staleAcknowledged) {
      console.log(`情報: 確認済み一覧の ${f} は、架空ケースが追加済みか実在施設に無いため、一覧から外せます`);
    }
    if (opts.verbose) {
      for (const f of result.fictionalOnly) {
        console.log(`情報: 架空ケースにだけある特徴: ${f}（${fictional.get(f).join("、")}）`);
      }
    }
    console.log(
      `[fictional-coverage] 実在 ${real.length} 施設（特徴 ${result.realFeatureCount} 種）、架空 ${items.length} 件（特徴 ${fictional.size} 種）: ${failed ? "FAILED" : "OK"}（警告 ${result.missing.length} 件、確認済みで除外 ${result.acknowledgedHits.length} 件、架空側のみの特徴 ${result.fictionalOnly.length} 種${opts.verbose ? "" : "（--verbose で一覧）"}）`,
    );
  }
  // process.exit() は大きな標準出力（パイプ）を途中で切るので exitCode で終える
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) main();
