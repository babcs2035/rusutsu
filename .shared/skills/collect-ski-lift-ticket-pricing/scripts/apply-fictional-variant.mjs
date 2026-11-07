#!/usr/bin/env node
/**
 * apply-fictional-variant.mjs
 *
 * 架空スキー場フィクスチャの本体と variants（差分）から、完全な料金JSONを作る。
 * 仕様は references/fictional-fixtures.md。
 *
 *   applyVariant(base, variant)  … remove → merge → append の順に適用した新しいJSONを返す（base は変更しない）
 *   loadFictional(dir)           … dir 直下の <resort>.json（本体）と dir/variants/<CASE_ID>.json を全部読み、
 *                                  [{ id, kind, file, caseId, base, data }] を返す
 *
 * CLI: node apply-fictional-variant.mjs <fictional-dir> [--out <dir>]
 *      各ケースの適用結果を <out>/<CASE_ID>.json に書く（--out なしは件数だけ表示）。
 *
 * ファイル名が `_` で始まるJSONは、テスト専用の補助として loadFictional が読まない。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, readJson } from "./_lib.mjs";

const APPENDABLE = new Set([
  "products", "offers", "rentals", "party_rules", "fees", "calendars", "audiences",
  "rental_audiences", "operating_hours", "channels", "sources", "areas",
]);

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

/** 深いマージ。オブジェクトは再帰、配列とスカラーは置き換え。 */
export function deepMerge(target, patch) {
  if (!isPlainObject(target) || !isPlainObject(patch)) return clone(patch);
  const out = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : clone(v);
  }
  return out;
}

export function applyVariant(base, variant) {
  let data = clone(base);
  // 1. remove: { "<配列名>": ["<id>", ...] }
  for (const [key, ids] of Object.entries(variant.remove ?? {})) {
    if (!Array.isArray(data[key])) {
      throw new Error(`remove: ${key} は配列ではありません（case ${variant.case_id}）`);
    }
    const drop = new Set(ids);
    const found = new Set();
    data[key] = data[key].filter((el) => {
      if (drop.has(el?.id)) {
        found.add(el.id);
        return false;
      }
      return true;
    });
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length) {
      throw new Error(`remove: ${key} に存在しないid ${missing.join(", ")}（case ${variant.case_id}）`);
    }
  }
  // 2. merge
  if (variant.merge) data = deepMerge(data, variant.merge);
  // 3. append
  for (const [key, items] of Object.entries(variant.append ?? {})) {
    if (!APPENDABLE.has(key)) {
      throw new Error(`append: ${key} は追加できる配列ではありません（case ${variant.case_id}）`);
    }
    data[key] = [...(data[key] ?? []), ...clone(items)];
  }
  return data;
}

function jsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => path.join(dir, f));
}

export function loadFictional(dir) {
  const bases = new Map(); // resort key (ファイル名) -> data
  const out = [];
  for (const file of jsonFiles(dir)) {
    const key = path.basename(file, ".json");
    const data = readJson(file);
    bases.set(key, data);
    out.push({ id: key, kind: "base", file, caseId: null, base: null, data });
  }
  for (const file of jsonFiles(path.join(dir, "variants"))) {
    const variant = readJson(file);
    const caseId = variant.case_id ?? path.basename(file, ".json");
    const baseKey = variant.base;
    // base は "a" でも "fictional-a" でも、ファイル名（a.json）でも resort.id でも引けるようにする
    const baseData =
      bases.get(baseKey) ??
      bases.get(String(baseKey).replace(/^fictional-/, "")) ??
      [...bases.values()].find((d) => d.resort?.id === baseKey || d.resort?.id === `fictional-${baseKey}`);
    if (!baseData) {
      throw new Error(`${file}: base "${baseKey}" の本体JSONが見つかりません`);
    }
    out.push({
      id: caseId,
      kind: "variant",
      file,
      caseId,
      base: baseKey,
      data: applyVariant(baseData, variant),
    });
  }
  return out;
}

// ---------- CLI ----------
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const { files, opts } = parseArgs(process.argv.slice(2), ["out"]);
  if (files.length !== 1) {
    console.error("使い方: node apply-fictional-variant.mjs <fictional-dir> [--out <dir>]");
    process.exit(2);
  }
  try {
    const items = loadFictional(files[0]);
    if (opts.out) {
      fs.mkdirSync(opts.out, { recursive: true });
      for (const it of items) {
        fs.writeFileSync(path.join(opts.out, `${it.id}.json`), `${JSON.stringify(it.data, null, 2)}\n`);
      }
    }
    console.log(`架空ケース ${items.length} 件（本体 ${items.filter((i) => i.kind === "base").length}、variants ${items.filter((i) => i.kind === "variant").length}）`);
  } catch (err) {
    console.error(`ERROR ${err.message}`);
    process.exit(1);
  }
}
