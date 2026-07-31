import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.dirname(SCRIPTS_DIR);
export const REFERENCES_DIR = path.join(SKILL_DIR, "references");
export const DEFAULT_SCHEMA_PATH = path.join(
  REFERENCES_DIR,
  "lift-ticket.schema.json",
);
export const DEFAULT_TAXONOMY_PATH = path.join(REFERENCES_DIR, "taxonomy.json");

/**
 * taxonomy.json のアクセサ。
 *
 * taxonomy はラベル1件ごとに定義を持つ構造（groups.<群>.labels.<ラベル>）。
 * 呼び出し側が構造を知らなくて済むよう、ここで配列に変換する。
 */
export class Taxonomy {
  constructor(raw) {
    this.raw = raw;
    this.version = raw.taxonomy_version ?? null;
  }

  /** 群に登録されているラベル名の配列 */
  labels(groupName) {
    const group = this.raw.groups?.[groupName];
    return group ? Object.keys(group.labels ?? {}) : null;
  }

  /** 1ラベルの定義（label_ja / definition_ja / excludes_ja …） */
  label(groupName, labelName) {
    return this.raw.groups?.[groupName]?.labels?.[labelName] ?? null;
  }

  groupNames() {
    return Object.keys(this.raw.groups ?? {});
  }

  order(orderName) {
    return this.raw.orders?.[orderName] ?? [];
  }

  /** 使ってはいけない表記揺れ → 正しいラベル */
  forbiddenAliases(groupName) {
    return this.raw.forbidden_aliases?.[groupName] ?? {};
  }

  /** そのラベルが誰に適用できるか（everyone / party_composition / qualified_only） */
  appliesTo(groupName, labelName) {
    return this.label(groupName, labelName)?.applies_to ?? null;
  }

  /** 別セクションへ移った概念 → どこに書くか */
  movedElsewhere(groupName) {
    return this.raw.moved_elsewhere?.[groupName] ?? {};
  }

  /** 定義が未記入のラベル（status: pending） */
  pendingLabels() {
    const out = [];
    for (const groupName of this.groupNames()) {
      for (const [labelName, def] of Object.entries(
        this.raw.groups[groupName].labels ?? {},
      )) {
        if (def?.status !== "defined") out.push(`${groupName}.${labelName}`);
      }
    }
    return out;
  }
}

export function loadTaxonomy(filePath = DEFAULT_TAXONOMY_PATH) {
  return new Taxonomy(readJson(filePath));
}

export function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`JSON構文エラー: ${filePath}: ${err.message}`);
  }
}

export function parseArgs(argv, flagsWithValue = []) {
  const files = [];
  const opts = { strict: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--strict") {
      opts.strict = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (flagsWithValue.includes(key)) {
        opts[key] = argv[++i];
      } else {
        opts[key] = true;
      }
    } else {
      files.push(arg);
    }
  }
  return { files, opts };
}

export class Reporter {
  constructor(label) {
    this.label = label;
    this.errors = [];
    this.warnings = [];
  }

  error(jsonPath, message) {
    this.errors.push({ path: jsonPath, message });
  }

  warn(jsonPath, message) {
    this.warnings.push({ path: jsonPath, message });
  }

  print(filePath) {
    for (const e of this.errors) {
      console.error(`ERROR   ${filePath} ${e.path}: ${e.message}`);
    }
    for (const w of this.warnings) {
      console.error(`WARNING ${filePath} ${w.path}: ${w.message}`);
    }
    const status = this.errors.length === 0 ? "OK" : "FAILED";
    console.log(
      `[${this.label}] ${filePath}: ${status} (errors: ${this.errors.length}, warnings: ${this.warnings.length})`,
    );
  }

  failed(strict = false) {
    return this.errors.length > 0 || (strict && this.warnings.length > 0);
  }
}

export function isValidCalendarDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export function forEachCondition(data, callback) {
  for (const [i, offer] of (data.offers ?? []).entries()) {
    for (const [j, cond] of (offer.eligibility_conditions ?? []).entries()) {
      callback(cond, `/offers/${i}/eligibility_conditions/${j}`, offer);
    }
  }
  for (const [i, rule] of (data.party_rules ?? []).entries()) {
    for (const [j, cond] of (rule.eligibility_conditions ?? []).entries()) {
      callback(cond, `/party_rules/${i}/eligibility_conditions/${j}`, rule);
    }
  }
}

export function periodInverted(period) {
  if (!period || typeof period !== "object") return false;
  const { start, end } = period;
  if (typeof start === "string" && typeof end === "string") {
    return start > end;
  }
  return false;
}
