#!/usr/bin/env node
// 外部サイトの掲載（ツアー会社のスキー場別リンク、シーズン券・キッズパスの対象スキー場）を取り直し、
// 前回との違い（載った・載らなくなったスキー場）と、取れなくなったサイトを見つける。
// 手元のファイル（src/private/data/tour-links/）は取り直しで更新する。本番へは書かない。
//
//   node .claude/skills/maintain-ski-external-listings/scripts/listings.mjs check \
//     --run <作業ディレクトリ> [--sites a,b] [--no-crawl] [--no-pass] [--no-state]
//
// 出力: <run>/result.json、<run>/summary.md、<run>/before/<siteId>.json（取り直す前の控え）、
//       <run>/tour-crawl.log、<run>/pass-programs.log
// 続けて失敗している回数: src/private/data/maintenance/listings-state.json（Git管理）
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  PATHS,
  apiGet,
  httpProbe,
  listArg,
  loadKnown,
  markKnown,
  readJson,
  runCli,
  runDir,
  today,
  writeJson,
  writeResult,
  writeText,
} from "../../maintain-ski-data-weekly/scripts/lib.mjs";

const STATE = path.join(PATHS.data, "listings-state.json");
const SITES_DIR = "src/private/scripts/tour-links/sites";
/** この回数続けて取れなければ、掲載をやめる候補として出す */
const RETIRE_AFTER = 3;

function run(command, args, logFile, timeoutMs) {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const onData = chunk => {
      output += chunk;
      process.stderr.write(chunk);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("close", async code => {
      clearTimeout(timer);
      await writeText(logFile, output);
      resolve({ code, output });
    });
  });
}

const resortSet = file => {
  const map = new Map();
  for (const entry of file?.entries ?? []) for (const id of entry.resortIds ?? []) if (!map.has(id)) map.set(id, entry.name);
  return map;
};

async function checkTourSites(dir, args, state) {
  const wanted = listArg(args.sites);
  const siteIds = readdirSync(SITES_DIR)
    .filter(f => f.endsWith(".ts") && f !== "index.ts")
    .map(f => f.replace(/\.ts$/u, ""))
    .filter(id => !wanted || wanted.includes(id))
    .sort();
  const file = id => path.join(PATHS.tourLinks, `${id}.json`);
  await mkdir(path.join(dir, "before"), { recursive: true });
  const before = {};
  for (const id of siteIds) {
    before[id] = await readJson(file(id), null);
    if (before[id]) await copyFile(file(id), path.join(dir, "before", `${id}.json`));
  }

  let crawlLog = "";
  const crawled = !args["no-crawl"];
  if (crawled) {
    console.error(`ツアー会社 ${siteIds.length}サイトを取り直す（十数分かかる）`);
    const result = await run("pnpm", ["tsx", "src/private/scripts/tour-links/run.ts", ...(wanted ?? [])], path.join(dir, "tour-crawl.log"), 45 * 60_000);
    crawlLog = result.output;
    if (result.code !== 0) console.error(`取り直しが終了コード ${result.code} で終わった`);
  }

  const { summary } = await apiGet("resort-links");
  const production = new Map();
  for (const row of summary) production.set(row.source, (production.get(row.source) ?? 0) + row.links);

  const findings = [];
  const changedSites = [];
  for (const id of siteIds) {
    const prev = before[id];
    const next = await readJson(file(id), null);
    const base = { id, name: next?.siteName ?? prev?.siteName ?? id, url: next?.startUrl ?? prev?.startUrl };
    const entry = (state.sites[id] ??= { failStreak: 0 });
    const failure = crawlLog.split("\n").find(line => line.startsWith(`${id}: 失敗`));
    const refreshed = crawled && next && next.crawledAt !== prev?.crawledAt;
    const total = next?.counts?.total ?? 0;
    const prevTotal = prev?.counts?.total ?? 0;

    let problem = null;
    if (crawled && !refreshed) problem = { code: "crawl-failed", message: `取り直しに失敗（${failure?.replace(`${id}: 失敗 `, "").slice(0, 120) ?? "結果のファイルが更新されなかった"}）` };
    else if (refreshed && total === 0) problem = { code: "listing-empty", message: `一覧が0件（前回 ${prevTotal}件）` };
    else if (refreshed && prevTotal > 0 && total < prevTotal / 2) problem = { code: "listing-shrunk", message: `一覧が半分未満に減った（${prevTotal}件 → ${total}件）。サイト側の不調か、掲載の作りが変わった可能性` };

    if (problem) {
      const probe = base.url ? await httpProbe(base.url) : null;
      const gone = probe && ([404, 410].includes(probe.status) || /ENOTFOUND/u.test(probe.error ?? ""));
      const reach = !probe ? "" : gone ? "。入口のページが無い" : probe.error || probe.status >= 400 ? `。入口のページも開けない（${probe.error ?? `HTTP ${probe.status}`}）` : "。入口のページは開ける（ページの作りが変わった可能性）";
      if (crawled && !args["no-state"]) {
        entry.failStreak += entry.lastRunDate === today() ? 0 : 1;
        entry.firstFailedAt ??= today();
        entry.lastRunDate = today();
      }
      const streak = Math.max(entry.failStreak, 1);
      const retire = gone || streak >= RETIRE_AFTER;
      findings.push({ ...base, severity: retire ? "high" : "medium", code: retire ? "retire-candidate" : problem.code, message: `${problem.message}${reach}${streak > 1 ? `。${streak}回続けて（${entry.firstFailedAt}から）` : ""}${retire ? "。掲載をやめるか、取り方を直すかを決める" : ""}` });
      continue;
    }
    if (refreshed) {
      Object.assign(entry, { failStreak: 0, firstFailedAt: undefined, lastOkAt: today(), lastRunDate: today(), total });
      const was = resortSet(prev);
      const now = resortSet(next);
      const added = [...now.keys()].filter(r => !was.has(r));
      const removed = [...was.keys()].filter(r => !now.has(r));
      if (prev && (added.length || removed.length)) {
        changedSites.push(id);
        const names = (ids, map) => ids.slice(0, 8).map(r => `${map.get(r)}（${r}）`).join("、") + (ids.length > 8 ? ` ほか${ids.length - 8}件` : "");
        findings.push({ ...base, severity: "medium", code: "listing-changed", message: [added.length ? `載った ${added.length}件: ${names(added, now)}` : "", removed.length ? `載らなくなった ${removed.length}件: ${names(removed, was)}` : ""].filter(Boolean).join(" ／ "), added, removed });
      }
      const unmatched = (next.entries ?? []).filter(e => e.method === "none").map(e => e.name);
      if (unmatched.length) findings.push({ ...base, severity: "low", code: "unmatched-name", message: `スキー場へ対応づけられない名前 ${unmatched.length}件: ${unmatched.slice(0, 8).join("、")}（${PATHS.tourLinks}/aliases.json に別名を足す）` });
    }
    // 本番に行があるのに手元の一覧が空（反映が止まっている・古い行が残っている）
    if (next && total === 0 && (production.get(id) ?? 0) > 0) findings.push({ ...base, severity: "medium", code: "production-stale", message: `手元の一覧は0件だが、本番に ${production.get(id)}件残っている` });
  }
  for (const [source, count] of production) {
    if (source === "official" || siteIds.includes(source) || wanted) continue;
    if (!existsSync(file(source))) findings.push({ id: source, severity: "medium", code: "unknown-source", message: `本番に ${count}件あるが、クローラーに無い出どころ（やめたサイトの行が残っている可能性）` });
  }
  return { findings, siteIds, changedSites, crawled };
}

/** crawl:pass-programs の出力（プログラムごとのまとまり）を読む */
export function parsePassOutput(output) {
  const programs = [];
  let current = null;
  for (const line of output.split("\n")) {
    const head = /^(\w+): (\d+)件 → (\d+)件/u.exec(line);
    const failed = /^❌ (\w+): (.*)$/u.exec(line);
    if (head) programs.push((current = { id: head[1], before: Number(head[2]), total: Number(head[3]), added: [], removed: [], rematched: [], unmatched: [], shrink: false, error: null }));
    else if (failed) programs.push((current = { id: failed[1], before: null, total: null, added: [], removed: [], rematched: [], unmatched: [], shrink: false, error: failed[2] }));
    else if (current && /^\s+＋ 追加: /u.test(line)) current.added = line.replace(/^\s+＋ 追加: /u, "").split("、");
    else if (current && /^\s+− 掲載終了: /u.test(line)) current.removed = line.replace(/^\s+− 掲載終了: /u, "").split("、");
    else if (current && /^\s+↻ /u.test(line)) current.rematched.push(line.replace(/^\s+↻ 名寄せ先の変更: /u, ""));
    else if (current && /名寄せできない: /u.test(line)) current.unmatched.push(/名寄せできない: (.*?)（候補/u.exec(line)?.[1] ?? line.trim());
    else if (current && /件数が半分未満/u.test(line)) current.shrink = true;
  }
  return programs;
}

async function checkPassPrograms(dir, args, state) {
  console.error("シーズン券・キッズパスの対象一覧を取り直して、本番と比べる");
  const { code, output } = await run("pnpm", ["tsx", "src/private/scripts/crawlPassPrograms.ts"], path.join(dir, "pass-programs.log"), 10 * 60_000);
  const body = output.split("\n").filter(line => line.trim() && !/^\s*(?:>|\$|Progress|WARN)/u.test(line)).join("\n").trim();
  const programs = parsePassOutput(output);
  const findings = [];
  if (!programs.length) findings.push({ id: "pass-programs", name: "シーズン券・キッズパス", severity: "medium", code: "pass-failed", message: `取り直しに失敗（終了コード ${code}）。${body.split("\n").at(-1)?.slice(0, 160) ?? ""}` });
  for (const p of programs) {
    const base = { id: p.id, name: `パス ${p.id}` };
    const entry = ((state.passes ??= {})[p.id] ??= { failStreak: 0 });
    if (p.error || p.shrink) {
      if (!args["no-state"]) {
        entry.failStreak += entry.lastRunDate === today() ? 0 : 1;
        entry.firstFailedAt ??= today();
        entry.lastRunDate = today();
      }
      const streak = Math.max(entry.failStreak, 1);
      const gone = /HTTP (?:404|410)|ENOTFOUND/u.test(p.error ?? "");
      const retire = gone || streak >= RETIRE_AFTER;
      findings.push({ ...base, severity: retire ? "high" : "medium", code: retire ? "retire-candidate" : p.error ? "pass-failed" : "pass-shrunk", message: `${p.error ? `取り直しに失敗（${p.error.slice(0, 140)}）` : `対象が半分未満に減った（${p.before}件 → ${p.total}件）`}${streak > 1 ? `。${streak}回続けて（${entry.firstFailedAt}から）` : ""}${retire ? "。絞り込みをやめるか、取り方を直すかを決める" : ""}` });
      continue;
    }
    Object.assign(entry, { failStreak: 0, firstFailedAt: undefined, lastOkAt: today(), lastRunDate: today(), total: p.total });
    if (p.added.length || p.removed.length || p.rematched.length)
      findings.push({ ...base, severity: "medium", code: "pass-changed", message: [p.added.length ? `載った ${p.added.length}件: ${p.added.slice(0, 8).join("、")}` : "", p.removed.length ? `載らなくなった ${p.removed.length}件: ${p.removed.slice(0, 8).join("、")}` : "", p.rematched.length ? `名寄せ先が変わった ${p.rematched.length}件: ${p.rematched.slice(0, 4).join("、")}` : ""].filter(Boolean).join(" ／ "), added: p.added, removed: p.removed });
    if (p.unmatched.length) findings.push({ ...base, severity: "medium", code: "pass-unmatched", message: `スキー場へ対応づけられない名前 ${p.unmatched.length}件: ${p.unmatched.slice(0, 8).join("、")}（src/private/data/pass-programs/aliases.json に別名を足す）` });
  }
  return { findings, output: body, changed: programs.filter(p => p.added.length || p.removed.length || p.rematched.length).map(p => p.id), ids: programs.map(p => p.id) };
}

async function check(args) {
  const dir = runDir(args, "listings");
  await mkdir(dir, { recursive: true });
  const state = await readJson(STATE, { sites: {} });
  const tour = await checkTourSites(dir, args, state);
  const pass = args["no-pass"] ? { findings: [], output: "", changed: [], ids: [] } : await checkPassPrograms(dir, args, state);
  state.updatedAt = new Date().toISOString();
  if (!args["no-state"]) await writeJson(STATE, state);

  // パスの対象一覧が resort_links に入れる行（NSDキッズ）は、ツアーリンクの出どころではない
  const findings = markKnown([...tour.findings.filter(f => !(f.code === "unknown-source" && pass.ids.includes(f.id))), ...pass.findings], await loadKnown("listings"));
  const notes = [`ツアー会社 ${tour.siteIds.length}サイト${tour.crawled ? "を取り直した" : "（取り直さず、手元のファイルだけを見た）"}。`];
  if (tour.changedSites.length) notes.push(`掲載が変わったサイトの反映: \`mise run resort-links:publish -- --source ${tour.changedSites.join(" ")}\`（差分を見てから \`--apply\`）`);
  if (pass.changed.length) notes.push(`パスの反映: \`mise run crawl:pass-programs -- ${pass.changed.join(" ")} --apply\`（下の「パスの差分」を確かめてから）`);
  const result = await writeResult(dir, {
    area: "listings",
    title: "外部サイトの掲載（ツアー・パス）の点検",
    checked: tour.siteIds.length + pass.ids.length,
    findings,
    notes,
    handoff: (ids => (ids.length ? [{ skill: "maintain-ski-external-listings", what: "掲載の変化を反映する・取れないサイトの扱いを決める", ids }] : []))([...new Set(findings.filter(f => !f.known && f.severity !== "low").map(f => f.id))]),
    extra: { changedSites: tour.changedSites, passChanged: pass.changed },
  });
  if (pass.output) {
    const summary = path.join(dir, "summary.md");
    await writeText(summary, `${(await readFile(summary, "utf8")).trimEnd()}\n\n## パスの差分\n\n\`\`\`\n${pass.output}\n\`\`\`\n`);
  }
  return result;
}

runCli(import.meta.url, { check });
