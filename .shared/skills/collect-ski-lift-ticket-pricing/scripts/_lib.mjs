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

/**
 * 対象者の絞り込み（target_genders / target_qualification）を走査する。
 *
 * 機械的に判定できる軸は性別だけ（`target_genders`）。
 * 地域住民・宿泊者・会員などは照会の入力から判定できないため、
 * 分類せず公式表記のまま `target_qualification` に置く。
 * かつて geographic_areas ＋ area_relationships ＋ geographic_levels で
 * 構造化していたが、料金計算に一切効かず分類の手間だけが残っていた。
 */
export const TARGET_FIELDS = ["target_genders", "target_qualification"];

export function forEachTarget(data, callback) {
  const scan = (holder, basePath) => {
    for (const [i, item] of (holder ?? []).entries()) {
      for (const field of TARGET_FIELDS) {
        const value = item[field];
        if (value == null) continue;
        callback(value, `${basePath}/${i}/${field}`, item, field);
      }
    }
  };
  scan(data.offers, "/offers");
  scan(data.party_rules, "/party_rules");
}

/** そのofferに対象者の絞り込みがあるか */
export function hasTargetRestriction(item) {
  return TARGET_FIELDS.some((field) => item?.[field] != null);
}

/**
 * 料金の種類を、どのフィールドが埋まっているかから決める。
 *
 * かつて `price.mode` という分類フィールドがあったが、実データ290件で例外なく
 * 導出でき、しかも「mode: free なのに amount: 500」のような**内部矛盾を
 * 書けてしまう**穴だった（それを取り締まる検査とfixtureまで存在した）。
 * 導出にすればその矛盾は構造的に書けない。
 */
export function priceModeOf(price) {
  // date_table は廃止（1 offer = 1 金額。日付で変わるならカレンダーごとにofferを分ける）
  if (price?.live_lookup_required === true) return "live_dynamic";
  if (price?.base_offer_id != null) return "derived_discount";
  if (price?.range != null) return "range";
  if (price?.amount === 0) return "free";
  if (typeof price?.amount === "number") return "fixed";
  return "unknown";
}

/** 金額が確定している料金か（未確定なら推測で埋めさせない） */
export function isConfirmedPrice(price) {
  return priceModeOf(price) !== "unknown";
}

/** 絞り込みを人間向けの文言（公式表記優先）にする */
export function targetLabels(item) {
  const out = [];
  for (const field of TARGET_FIELDS) {
    const value = item?.[field];
    if (value == null) continue;
    out.push(value.official_label_ja ?? value.description_ja ?? field);
  }
  return out;
}

export function periodInverted(period) {
  if (!period || typeof period !== "object") return false;
  const { start, end } = period;
  if (typeof start === "string" && typeof end === "string") {
    return start > end;
  }
  return false;
}
