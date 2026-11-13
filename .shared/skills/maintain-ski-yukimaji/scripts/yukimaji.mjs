#!/usr/bin/env node
// 雪マジの掲載（本番の yuki_magi）と、リフト券JSONの `yukimaji` 欄を突き合わせる。
// リポジトリのルートで実行する。本番へは読むだけで、書き込みはしない。
//
//   node .claude/skills/maintain-ski-yukimaji/scripts/yukimaji.mjs check \
//     --run src/private/data/resorts-temporary/tmp/yukimaji/<run-id> [--season 2026-2027] [--input <yuki-magi.json>]
//
// 出力: <run>/yuki-magi.json（取得した掲載）、<run>/report.json、<run>/summary.md
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export const PATHS = {
  facilityMap: "src/private/data/yukimaji/facility-map.json",
  liftTicket: "src/private/data/lift-ticket",
};

/**
 * 全施設に付く定型の注意書き。付いた・外れただけでは料金も条件も変わらないので比べない
 * （2026-11 に「最新の営業状況を…」が全施設へ一斉に追記された）
 */
const BOILERPLATE = [
  "※営業期間は変更になる可能性があります。",
  "最新の営業状況を施設のWEBサイトでご確認ください。",
];

/** 掲載文の比べ方。空白（全角を含む）と定型の注意書きの違いは変更と見なさない */
export const normalizeText = (text) => {
  let normalized = (text ?? "").replace(/[\s\u3000]+/gu, "");
  for (const phrase of BOILERPLATE) normalized = normalized.replaceAll(phrase, "");
  return normalized;
};

/** jalan.net 詳細URLの施設番号（CLYUKI000171） */
export const facilityCode = (url) =>
  (url ?? "").match(/CLYUKI\d+/u)?.[0] ?? null;

const parseArgs = (argv) => {
  const [command, ...rest] = argv;
  const options = { command, season: "2026-2027" };
  for (let i = 0; i < rest.length; i += 1) {
    const key = rest[i];
    if (key === "--run") options.run = rest[++i];
    else if (key === "--season") options.season = rest[++i];
    else if (key === "--input") options.input = rest[++i];
    else throw new Error(`不明な引数: ${key}`);
  }
  return options;
};

const fetchListing = async () => {
  dotenv.config({ path: ".env.local", quiet: true });
  dotenv.config({ quiet: true });
  const base = process.env.DATA_API_BASE_URL?.trim();
  const token = process.env.INTERNAL_DATA_API_ADMIN_TOKEN?.trim();
  if (!base || !token) {
    throw new Error(
      ".env.local に DATA_API_BASE_URL と INTERNAL_DATA_API_ADMIN_TOKEN が必要です",
    );
  }
  // 接続先はベースパス付き（https://…/rusutsu）なので、URL の結合でパスを落とさない
  const response = await fetch(
    `${base.replace(/\/+$/u, "")}/api/internal/v1/yuki-magi`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error(`雪マジの取得に失敗しました（HTTP ${response.status}）`);
  }
  return response.json();
};

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

/** 確定版JSONの `yukimaji`。ファイルが無ければ undefined、欄が null なら null */
const readResortYukimaji = async (resortId, season) => {
  const file = path.join(PATHS.liftTicket, resortId, `${season}.json`);
  if (!existsSync(file)) return { file, exists: false };
  const data = await readJson(file);
  return { file, exists: true, yukimaji: data.yukimaji };
};

/**
 * 突き合わせの本体（テストしやすいようにファイル読み込みと分ける）。
 * @param listing 本番の掲載 [{ id, name, url, tag, benefit, period }]
 * @param map facility-map.json の facilities（施設番号 → { name_ja, resort_ids }）
 * @param resorts { [resortId]: { exists, yukimaji } }（地図に載っている施設と、yukimaji を持つ全JSON）
 */
export const compare = ({ listing, map, resorts }) => {
  const rows = [];
  const listedCodes = new Set();
  for (const entry of listing) {
    const code = facilityCode(entry.url);
    listedCodes.add(code);
    const mapped = map[code];
    if (!mapped) {
      rows.push({ state: "unmapped", code, name_ja: entry.name, tag: entry.tag });
      continue;
    }
    for (const resortId of mapped.resort_ids) {
      const resort = resorts[resortId] ?? { exists: false };
      const base = { code, name_ja: entry.name, tag: entry.tag, resort_id: resortId };
      if (!resort.exists) {
        rows.push({ ...base, state: "no_json" });
        continue;
      }
      const yukimaji = resort.yukimaji;
      if (yukimaji == null) {
        rows.push({ ...base, state: "missing_in_json" });
        continue;
      }
      if (facilityCode(yukimaji.majibu_url) !== code) {
        rows.push({
          ...base,
          state: "code_mismatch",
          json_code: facilityCode(yukimaji.majibu_url),
        });
        continue;
      }
      const changes = [];
      if (normalizeText(yukimaji.benefit_text_ja) !== normalizeText(entry.benefit)) {
        changes.push({ field: "benefit", json: yukimaji.benefit_text_ja, listing: entry.benefit });
      }
      // 除外日を期間の文の後ろに続けて写した JSON もある（「…3/28 除外日【…】オープン～12/31」）
      const periodTexts = [
        entry.period,
        `${entry.period ?? ""}除外日${entry.exclusionDate ?? ""}`,
      ].map(normalizeText);
      if (!periodTexts.includes(normalizeText(yukimaji.period_text_ja))) {
        changes.push({ field: "period", json: yukimaji.period_text_ja, listing: entry.period });
      }
      // 「準備中」タグでも特典・期間が載っていれば listed（data-model の yukimaji）。
      // 特典が「後日追加予定」のときだけ preparing と見なす
      const preparing =
        (entry.tag ?? "").includes("準備中") && /後日/u.test(entry.benefit ?? "");
      if ((yukimaji.status === "preparing") !== preparing) {
        changes.push({ field: "status", json: yukimaji.status, listing: entry.tag });
      }
      rows.push({ ...base, state: changes.length ? "text_changed" : "current", changes });
    }
  }
  // 掲載から消えた施設（JSON に listed のまま残っている）
  for (const [resortId, resort] of Object.entries(resorts)) {
    const code = facilityCode(resort.yukimaji?.majibu_url);
    if (resort.yukimaji && !listedCodes.has(code)) {
      rows.push({ state: "delisted", code, resort_id: resortId, name_ja: resort.yukimaji.majibu_name_ja });
    }
  }
  return rows;
};

const STATE_LABELS = {
  current: "最新（掲載文が一致）",
  text_changed: "掲載文が変わった → yukimaji を更新",
  missing_in_json: "JSON の yukimaji が null なのに掲載あり → yukimaji を記入",
  code_mismatch: "JSON の施設番号が対応表と違う → 名寄せを確認",
  no_json: "リフト券JSONが無い → collect-ski-lift-ticket-pricing の対象",
  unmapped: "対応表に無い施設 → facility-map.json に追記",
  delisted: "掲載から消えた → 掲載終了か確認し yukimaji を null に",
};

const summarize = (rows, meta) => {
  const lines = [
    "# 雪マジ点検",
    "",
    `- 取得: ${meta.fetchedAt}（掲載 ${meta.listingCount} 施設、シーズン ${meta.season}）`,
    "",
  ];
  for (const [state, label] of Object.entries(STATE_LABELS)) {
    const hits = rows.filter((row) => row.state === state);
    lines.push(`## ${label}: ${hits.length}`);
    if (state === "current") {
      lines.push("");
      continue;
    }
    for (const row of hits) {
      lines.push(`- ${row.resort_id ?? "-"} ${row.name_ja ?? ""} ${row.code ?? ""}`);
      for (const change of row.changes ?? []) {
        lines.push(`  - ${change.field}: ${change.json ?? "null"}`);
        lines.push(`    → ${change.listing ?? "null"}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
};

const check = async (options) => {
  if (!options.run) throw new Error("--run <作業ディレクトリ> を指定してください");
  await mkdir(options.run, { recursive: true });
  const raw = options.input ? await readJson(options.input) : await fetchListing();
  const listing = Array.isArray(raw) ? raw : raw.entries;
  await writeFile(path.join(options.run, "yuki-magi.json"), `${JSON.stringify(raw, null, 2)}\n`);
  const map = (await readJson(PATHS.facilityMap)).facilities;

  const resortIds = new Set(Object.values(map).flatMap((entry) => entry.resort_ids));
  for (const dir of readdirSync(PATHS.liftTicket, { withFileTypes: true })) {
    if (dir.isDirectory()) resortIds.add(dir.name);
  }
  const resorts = {};
  for (const resortId of resortIds) {
    resorts[resortId] = await readResortYukimaji(resortId, options.season);
  }
  const rows = compare({ listing, map, resorts });
  const meta = {
    fetchedAt: new Date().toISOString(),
    listingCount: listing.length,
    season: options.season,
  };
  const counts = Object.fromEntries(
    Object.keys(STATE_LABELS).map((state) => [state, rows.filter((row) => row.state === state).length]),
  );
  await writeFile(
    path.join(options.run, "report.json"),
    `${JSON.stringify({ ...meta, counts, rows }, null, 2)}\n`,
  );
  await writeFile(path.join(options.run, "summary.md"), `${summarize(rows, meta)}\n`);
  console.log(JSON.stringify(counts));
  console.log(`report: ${path.join(options.run, "report.json")}`);
};

const isMain = () => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isMain()) {
  const options = parseArgs(process.argv.slice(2));
  if (options.command !== "check") {
    console.error("使い方: yukimaji.mjs check --run <dir> [--season 2026-2027] [--input <file>]");
    process.exit(2);
  }
  check(options).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
