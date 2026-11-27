#!/usr/bin/env node
// 週次の見回り: 種類ごとの点検スクリプトを順に流し、結果を1枚の報告にまとめる。
// 点検は読むだけ（手元の指紋・ツアーリンクのファイルは更新する）。本番へは書かない。
//
//   node .claude/skills/maintain-ski-data-weekly/scripts/weekly.mjs run \
//     [--run <作業ディレクトリ>] [--only crawlers,links] [--skip listings] [--no-crawl]
//   node .claude/skills/maintain-ski-data-weekly/scripts/weekly.mjs summary --run <作業ディレクトリ>
//
// 出力: <run>/summary.md、<run>/weekly.json、<run>/<種類>/（種類ごとの結果）、<run>/logs/<種類>.log
//       src/private/data/maintenance/reports/<日付>-weekly.md（報告の履歴。Git管理）
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PATHS, SEVERITY, listArg, readJson, runCli, runDir, today, writeJson, writeText } from "./lib.mjs";

const SKILLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = (...parts) => path.join(SKILLS, ...parts);

/**
 * 点検の種類。chain が同じものは順に、違うものは同時に流す。
 * sites: スキー場の公式サイトを開く点検（同じサイトへ重ねて取りに行かないよう、1本の列にする）
 */
const AREAS = [
  { key: "crawlers", title: "営業情報クローラー", chain: "api", skill: "triage-ski-crawler-health", script: script("triage-ski-crawler-health/scripts/crawler-health.mjs") },
  { key: "yukimaji", title: "雪マジ", chain: "api", skill: "maintain-ski-yukimaji", script: script("maintain-ski-yukimaji/scripts/yukimaji.mjs") },
  { key: "listings", title: "ツアー・パスの掲載", chain: "api", skill: "maintain-ski-external-listings", script: script("maintain-ski-external-listings/scripts/listings.mjs"), pass: ["no-crawl"] },
  { key: "links", title: "リンク切れ", chain: "sites", skill: "check-ski-resort-link-health", script: script("check-ski-resort-link-health/scripts/link-health.mjs") },
  { key: "maps", title: "ゲレンデマップ", chain: "sites", skill: "maintain-ski-trail-maps", script: script("maintain-ski-trail-maps/scripts/trail-map.mjs") },
  { key: "pages", title: "料金ページ・未登録のページ", chain: "sites", skill: "watch-ski-official-pages", script: script("watch-ski-official-pages/scripts/page-watch.mjs") },
];

function runCheck(area, dir, args) {
  return new Promise(resolve => {
    const extra = (area.pass ?? []).filter(flag => args[flag]).map(flag => `--${flag}`);
    const started = Date.now();
    const log = createWriteStream(path.join(dir, "logs", `${area.key}.log`));
    const child = spawn(process.execPath, [area.script, "check", "--run", path.join(dir, area.key), ...extra], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on("close", code => {
      log.end();
      const minutes = ((Date.now() - started) / 60_000).toFixed(1);
      console.error(`${code === 0 ? "✓" : "✗"} ${area.title}（${minutes}分）`);
      resolve({ key: area.key, code, minutes: Number(minutes) });
    });
  });
}

// ---------- 種類ごとの結果を同じ形にそろえる ----------

const fromResult = result => ({
  checked: result.counts.checked,
  counts: result.counts,
  findings: result.findings.filter(f => !f.known),
  handoff: result.handoff ?? [],
  notes: result.notes ?? [],
});

/** maintain-ski-trail-maps の report.json */
function fromTrailMaps(report) {
  const level = { broken: "high", "stale-suspect": "medium", "page-missing": "medium", "display-warn": "low" };
  const findings = report.resorts
    .filter(r => level[r.status])
    .map(r => {
      const flags = r.flags.filter(f => SEVERITY[f.severity] >= 1);
      return { id: r.id, name: r.name, severity: level[r.status], code: r.status, message: flags.map(f => f.message).slice(0, 3).join(" ／ "), url: r.mapPageUrls?.[0]?.url ?? r.maps?.[0]?.url };
    });
  const ids = findings.filter(f => f.severity !== "low").map(f => f.id);
  return {
    checked: report.resorts.length,
    counts: countOf(findings, report.resorts.length),
    findings,
    handoff: ids.length ? [{ skill: "maintain-ski-trail-maps", what: "表示できない・古い疑いのマップを公式の現行マップへ差し替える（tasks.json）", ids }] : [],
    notes: [`状態: ${Object.entries(report.summary).map(([k, v]) => `${k} ${v}`).join("・")}`],
  };
}

/** maintain-ski-yukimaji の report.json */
function fromYukimaji(report) {
  const label = { text_changed: "掲載文が変わった", missing_in_json: "掲載があるのに料金データに未記入", unmapped: "新しく掲載された施設（スキー場へ未対応づけ）", code_mismatch: "施設番号が対応表と違う", delisted: "掲載から消えた", no_json: "料金データが無い（今季料金の発表待ち）" };
  const findings = report.rows
    .filter(row => label[row.state])
    .map(row => ({ id: row.resort_id ?? row.code, name: row.name_ja, severity: row.state === "no_json" ? "low" : "medium", code: row.state, message: label[row.state] }));
  const ids = findings.filter(f => f.severity !== "low").map(f => f.id);
  return {
    checked: report.listingCount,
    counts: countOf(findings, report.listingCount),
    findings,
    handoff: ids.length ? [{ skill: "maintain-ski-yukimaji", what: "掲載の変化を料金データの yukimaji 欄へ反映する", ids }] : [],
    notes: [],
  };
}

function countOf(findings, checked) {
  const counts = { checked, high: 0, medium: 0, low: 0, info: 0, known: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

async function loadArea(area, dir) {
  const base = path.join(dir, area.key);
  if (area.key === "maps") return fromTrailMaps(await readJson(path.join(base, "report.json")));
  if (area.key === "yukimaji") return fromYukimaji(await readJson(path.join(base, "report.json")));
  return fromResult(await readJson(path.join(base, "result.json")));
}

const cell = value => String(value ?? "").replaceAll("|", "／").replace(/\n+/gu, " ");

async function merge(dir, runs = []) {
  const areas = [];
  for (const area of AREAS) {
    const run = runs.find(r => r.key === area.key);
    try {
      areas.push({ ...area, ...(await loadArea(area, dir)), minutes: run?.minutes ?? null, failed: run ? run.code !== 0 : false });
    } catch (error) {
      if (run || error.code !== "ENOENT") areas.push({ ...area, missing: true, error: error.code === "ENOENT" ? "結果のファイルが無い" : error.message, minutes: run?.minutes ?? null });
    }
  }
  const done = areas.filter(a => !a.missing);
  const lines = [`# 週次の見回り（${today()}）`, "", "| 種類 | 点検 | 高 | 中 | 低 | 既知 | 詳しい結果 |", "|---|---|---|---|---|---|---|"];
  for (const a of areas) {
    if (a.missing) lines.push(`| ${a.title} | 点検できなかった | | | | | logs/${a.key}.log |`);
    else lines.push(`| ${a.title} | ${a.checked} | ${a.counts.high} | ${a.counts.medium} | ${a.counts.low} | ${a.counts.known ?? 0} | ${a.key}/summary.md |`);
  }
  lines.push("");
  const failed = areas.filter(a => a.missing || a.failed);
  if (failed.length) lines.push(`点検が最後まで動かなかった種類: ${failed.map(a => `${a.title}（logs/${a.key}.log）`).join("、")}`, "");

  lines.push("## 要対応（高・中）", "");
  let any = false;
  for (const a of done) {
    const rows = a.findings.filter(f => SEVERITY[f.severity] >= 2).sort((x, y) => SEVERITY[y.severity] - SEVERITY[x.severity] || String(x.id).localeCompare(String(y.id)));
    if (!rows.length) continue;
    any = true;
    lines.push(`### ${a.title}（${rows.length}件）`, "", "| 重さ | 対象 | 指摘 | 内容 | URL |", "|---|---|---|---|---|");
    for (const f of rows.slice(0, 25)) lines.push(`| ${f.severity === "high" ? "高" : "中"} | ${cell(f.name ? `${f.name}（${f.id}）` : f.id)} | ${f.code} | ${cell(f.message).slice(0, 220)} | ${f.url ? `<${f.url}>` : ""} |`);
    if (rows.length > 25) lines.push("", `ほか ${rows.length - 25}件は ${a.key}/summary.md にあります。`);
    lines.push("");
  }
  if (!any) lines.push("ありません。", "");

  const handoff = done.flatMap(a => a.handoff.map(h => ({ ...h, from: a.title, area: a.key })));
  lines.push("## 次に回す先", "");
  if (!handoff.length) lines.push("ありません。", "");
  for (const h of handoff) lines.push(`- ${h.skill}（${h.from}）: ${h.what}（${h.ids.length}件）${h.ids.length ? ` ${h.ids.slice(0, 20).join(", ")}${h.ids.length > 20 ? " …" : ""}` : ""}`);
  if (handoff.length) lines.push("");
  const notes = done.flatMap(a => a.notes.map(n => `${a.title}: ${n}`));
  if (notes.length) lines.push("## 点検の内訳", "", ...notes.map(n => `- ${n}`), "");

  const text = `${lines.join("\n")}\n`;
  await writeText(path.join(dir, "summary.md"), text);
  await writeText(path.join(PATHS.reports, `${today()}-weekly.md`), text);
  const totals = { high: 0, medium: 0, low: 0 };
  for (const a of done) for (const k of Object.keys(totals)) totals[k] += a.counts[k];
  await writeJson(path.join(dir, "weekly.json"), {
    createdAt: new Date().toISOString(),
    totals,
    areas: areas.map(a => (a.missing ? { key: a.key, title: a.title, missing: true, error: a.error } : { key: a.key, title: a.title, skill: a.skill, checked: a.checked, counts: a.counts, minutes: a.minutes, handoff: a.handoff })),
    handoff,
  });
  console.log(JSON.stringify({ dir, summary: path.join(dir, "summary.md"), totals, missing: failed.map(a => a.key) }));
  return failed.length;
}

async function run(args) {
  const dir = runDir(args, "weekly");
  const only = listArg(args.only);
  const skip = listArg(args.skip) ?? [];
  const selected = AREAS.filter(a => (!only || only.includes(a.key)) && !skip.includes(a.key));
  if (!selected.length) throw new Error(`点検の種類: ${AREAS.map(a => a.key).join(", ")}`);
  await mkdir(path.join(dir, "logs"), { recursive: true });
  console.error(`週次の見回り → ${dir}（${selected.map(a => a.title).join("・")}）`);
  const chains = Map.groupBy(selected, a => a.chain);
  const runs = (
    await Promise.all(
      [...chains.values()].map(async chain => {
        const out = [];
        for (const area of chain) out.push(await runCheck(area, dir, args));
        return out;
      }),
    )
  ).flat();
  if (await merge(dir, runs)) process.exitCode = 1;
}

async function summary(args) {
  if (!args.run || args.run === true) throw new Error("--run <作業ディレクトリ> を指定してください");
  await merge(args.run);
}

runCli(import.meta.url, { run, summary });
