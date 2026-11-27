#!/usr/bin/env node
// 営業情報クローラー（crawl_latest）の本番の実行記録から、失敗・警告・止まっているスキー場を集計する。
// 本番へは読むだけ。リポジトリのルートで実行する。
//
//   node .claude/skills/triage-ski-crawler-health/scripts/crawler-health.mjs check \
//     --run <作業ディレクトリ> [--days 7] [--stale-days 2] [--ids a,b] [--no-warnings]
//
// 出力: <run>/result.json、<run>/summary.md、<run>/tasks.json（fix-ski-resort-latest-crawler に渡す仕事）
import { readdirSync } from "node:fs";
import path from "node:path";
import {
  PATHS,
  apiGet,
  batches,
  listArg,
  loadKnown,
  loadResorts,
  mapLimit,
  markKnown,
  runCli,
  runDir,
  writeJson,
  writeResult,
} from "../../maintain-ski-data-weekly/scripts/lib.mjs";

const PAGE_SIZE = 50;
const FIX_SKILL = "fix-ski-resort-latest-crawler";

async function fetchIssues(severity, since) {
  const query = page => `crawl-latest-monitor?view=issues&sourceModes=LIVE&severity=${severity}&since=${encodeURIComponent(since)}&pageSize=${PAGE_SIZE}&page=${page}`;
  const first = await apiGet(query(1), { token: "diagnostics" });
  const pages = Math.min(200, Math.ceil(first.total / PAGE_SIZE));
  const rest = await mapLimit(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2),
    4,
    async page => (await apiGet(query(page), { token: "diagnostics" })).issues,
  );
  return [...first.issues, ...rest.flat()];
}

/** スキー場ごとに、指摘コード別の件数・起きた日数・文面の例をまとめる */
function aggregate(issues) {
  const byResort = new Map();
  for (const issue of issues) {
    if (!byResort.has(issue.resortId)) byResort.set(issue.resortId, new Map());
    const codes = byResort.get(issue.resortId);
    const key = `${issue.severity}:${issue.code}`;
    if (!codes.has(key)) codes.set(key, { code: issue.code, severity: issue.severity, count: 0, days: new Set(), categories: new Set(), sample: issue.message, lastAt: issue.observedAt });
    const entry = codes.get(key);
    entry.count += issue.occurrences ?? 1;
    entry.days.add(issue.observedAt.slice(0, 10));
    if (issue.categoryKind) entry.categories.add(issue.categoryKind);
    if (issue.observedAt > entry.lastAt) {
      entry.lastAt = issue.observedAt;
      entry.sample = issue.message;
    }
  }
  return byResort;
}

const short = (text, n = 110) => (text.length > n ? `${text.slice(0, n)}…` : text);
const codeLine = c => `${c.code}×${c.count}（${c.days.size}日）`;

async function check(args) {
  const dir = runDir(args, "crawlers");
  const days = Number(args.days ?? 7);
  const staleDays = Number(args["stale-days"] ?? 2);
  const only = listArg(args.ids);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [{ rows }, { resorts }, errors, warnings, known] = await Promise.all([
    apiGet("crawl-latest-monitor?view=overview", { token: "diagnostics" }),
    loadResorts(),
    fetchIssues("ERROR", since),
    args["no-warnings"] ? [] : fetchIssues("WARNING", since),
    loadKnown("crawlers"),
  ]);
  const resortOf = new Map(resorts.map(r => [r.id, r]));
  const crawlerIds = new Set(readdirSync(PATHS.crawlers).filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts")).map(f => f.replace(/\.ts$/u, "")));
  const errorsBy = aggregate(errors);
  const warningsBy = aggregate(warnings);
  const newest = rows.reduce((max, r) => (r.latestRun && r.latestRun.observedAt > max ? r.latestRun.observedAt : max), "");
  const staleBefore = new Date(new Date(newest || Date.now()).getTime() - staleDays * 86_400_000).toISOString();

  const findings = [];
  const tasks = [];
  let checked = 0;
  for (const row of rows) {
    if (only && !only.includes(row.resortId)) continue;
    const hasCrawler = crawlerIds.has(row.resortId);
    const run = row.latestRun;
    if (!hasCrawler && !run) continue;
    checked++;
    const base = { id: row.resortId, name: row.resortName };
    const errorCodes = [...(errorsBy.get(row.resortId)?.values() ?? [])].sort((a, b) => b.count - a.count);
    const warningCodes = [...(warningsBy.get(row.resortId)?.values() ?? [])].sort((a, b) => b.count - a.count);
    const errorDays = new Set(errorCodes.flatMap(c => [...c.days])).size;
    const before = findings.length;

    if (!run) {
      findings.push({ ...base, severity: "medium", code: "no-run", message: "クローラーはあるが、本番の実行記録が無い（定時実行の対象に入っているか確かめる）" });
    } else {
      const badCategories = run.categories.filter(c => !c.eligibleForCurrent || !["VALID", "WARNING"].includes(c.validationState));
      const detail = errorCodes.length ? `${errorCodes.slice(0, 3).map(codeLine).join("、")}。例: ${short(errorCodes[0].sample)}` : "";
      if (run.observedAt < staleBefore) {
        findings.push({ ...base, severity: "medium", code: "stale", message: `最後の実行が ${run.observedAt.slice(0, 10)} で止まっている（他は ${newest.slice(0, 10)} まで動いている）` });
      } else if (run.outcome === "FAILED") {
        const streak = errorDays >= 3;
        findings.push({ ...base, severity: streak ? "high" : "medium", code: streak ? "failing" : "failed-latest", message: `${streak ? `この${days}日で${errorDays}日失敗` : "直近の実行が失敗"}。${detail}` });
      } else if (run.outcome === "PARTIAL" && (run.issueCounts.error > 0 || badCategories.length)) {
        findings.push({ ...base, severity: "medium", code: "partial-error", message: `一部を保存できていない（${badCategories.map(c => `${c.kind}:${c.state}/${c.validationState}`).join("、") || `エラー${run.issueCounts.error}件`}）。${detail}` });
      } else if (run.outcome === "PARTIAL") {
        findings.push({ ...base, severity: "low", code: "warning", message: `警告付きで保存（${warningCodes.slice(0, 3).map(codeLine).join("、") || `警告${run.issueCounts.warning}件`}）${warningCodes[0] ? `。例: ${short(warningCodes[0].sample)}` : ""}` });
      } else if (errorDays >= 3) {
        findings.push({ ...base, severity: "low", code: "flaky", message: `直近は成功だが、この${days}日で${errorDays}日失敗している。${detail}` });
      }
    }
    const gaps = (row.mappingGaps ?? []).filter(g => g.missing.length || g.unexpected.length);
    if (run && gaps.length) {
      findings.push({ ...base, severity: "low", code: "mapping-gap", message: gaps.map(g => `${g.kind}: 地図にあって取れていない${g.missing.length}件・地図に無い名前${g.unexpected.length}件`).join("、") });
    }
    const added = findings.slice(before);
    if (added.some(f => ["failing", "failed-latest", "partial-error", "stale", "no-run"].includes(f.code))) {
      tasks.push({
        id: row.resortId,
        name: row.resortName,
        active: resortOf.get(row.resortId)?.active ?? null,
        flags: added.map(f => `${f.code}: ${f.message}`),
        runId: run?.id ?? null,
        observedAt: run?.observedAt ?? null,
        outcome: run?.outcome ?? null,
        crawlerFile: run?.crawlerFile ?? (hasCrawler ? `${PATHS.crawlers}/${row.resortId}.ts` : null),
        errors: errorCodes.slice(0, 5).map(c => ({ code: c.code, count: c.count, days: c.days.size, categories: [...c.categories], sample: c.sample })),
      });
    }
  }
  markKnown(findings, known);
  const knownIds = new Set(findings.filter(f => f.known).map(f => f.id));
  const order = { failing: 0, stale: 1, "no-run": 2, "failed-latest": 3, "partial-error": 4 };
  const openTasks = tasks
    .filter(t => !knownIds.has(t.id))
    .sort((a, b) => Math.min(...a.flags.map(f => order[f.split(":")[0]] ?? 9)) - Math.min(...b.flags.map(f => order[f.split(":")[0]] ?? 9)) || a.id.localeCompare(b.id));
  await writeJson(path.join(dir, "tasks.json"), { createdAt: new Date().toISOString(), skill: FIX_SKILL, batches: batches(openTasks, 5).map((rs, i) => ({ batch: `fix-${String(i + 1).padStart(2, "0")}`, resorts: rs })) });

  const outcomes = {};
  for (const row of rows) if (row.latestRun) outcomes[row.latestRun.outcome] = (outcomes[row.latestRun.outcome] ?? 0) + 1;
  /** クローラーの無い営業中のスキー場（シーズン前の再調査で、営業情報のページができていないか見る対象） */
  const noCrawler = resorts.filter(r => r.active && !crawlerIds.has(r.id)).map(r => r.id);
  await writeResult(dir, {
    area: "crawlers",
    title: "営業情報クローラーの点検",
    checked,
    findings,
    notes: [
      `直近の実行結果: 成功 ${outcomes.SUCCESS ?? 0}・警告付き ${outcomes.PARTIAL ?? 0}・失敗 ${outcomes.FAILED ?? 0}（最新の実行 ${newest.slice(0, 16)}Z）`,
      `この${days}日の記録: エラー ${errors.length}件・警告 ${warnings.length}件`,
      `クローラーの無い営業中のスキー場: ${noCrawler.length}件`,
    ],
    handoff: openTasks.length ? [{ skill: FIX_SKILL, what: "失敗・保存できていない・止まっているクローラーを直す（tasks.json）", ids: openTasks.map(t => t.id) }] : [],
    extra: { days, outcomes, noCrawler },
  });
}

runCli(import.meta.url, { check });
