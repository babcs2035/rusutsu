#!/usr/bin/env node
// シーズン前の再調査の台帳と、公式サイトの見て回り（survey）の材料・監査・振り分け。
// 本番へは書かない。リポジトリのルートで実行する。
//
//   seasonal.mjs init [--season 2027-2028] [--all]        台帳を作る（あれば足りないスキー場だけ足す）
//   seasonal.mjs status                                    段階ごとの進み具合
//   seasonal.mjs next --stage <段階> [--size N]            次に手を付けるスキー場
//   seasonal.mjs prepare --ids a,b [--leads <leads.json>]  見て回りの材料（登録済みのURL・手がかり）を書く
//   seasonal.mjs audit-survey [--ids a,b]                  見て回りの結果を確かめ、台帳に記録する
//   seasonal.mjs plan [--ids a,b]                          見て回りの結果から、後の段階の要・不要を決める
//   seasonal.mjs mark --stage <段階> --ids a,b --status done|hold|skip|todo [--note "..."]
//
// 台帳:   src/private/data/maintenance/seasonal/<season>/run.json（Git管理）
// 結果:   src/private/data/maintenance/seasonal/<season>/survey/<resortId>.json（Git管理）
// 材料:   src/private/data/resorts-temporary/tmp/maintenance/<season>-seasonal/brief/<resortId>.json（Git管理外）
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { classify } from "../../check-ski-resort-link-health/scripts/link-health.mjs";
import { PATHS, httpProbe, listArg, mapLimit, readJson, runCli, today, writeJson } from "../../maintain-ski-data-weekly/scripts/lib.mjs";
import { loadTargets } from "../../watch-ski-official-pages/scripts/page-watch.mjs";

/** 段階。unit が resort のものはスキー場ごと、global は1回 */
export const STAGES = [
  { key: "baseline", unit: "global", title: "今の状態を点検する（週次の見回りを1回）", skill: "maintain-ski-data-weekly" },
  { key: "survey", unit: "resort", title: "公式サイトを見て回り、営業情報・料金・レンタル・マップのページを探し直す", skill: "resurvey-ski-data-seasonal", size: 3 },
  { key: "crawler", unit: "resort", title: "営業情報クローラーの取得先を見直す・無ければ作る", skill: "build-ski-resort-latest-crawler", size: 1, planned: true },
  { key: "tickets", unit: "resort", title: "今季のリフト券・レンタル料金を集め、料金計算できる形にする", skill: "collect-ski-lift-ticket-pricing", size: 2, planned: true },
  { key: "maps", unit: "resort", title: "ゲレンデマップを今季の図へ差し替える", skill: "maintain-ski-trail-maps", size: 10, planned: true },
  { key: "links", unit: "resort", title: "公式リンクを集め直す", skill: "collect-ski-resort-official-links", size: 3 },
  { key: "yukimaji", unit: "global", title: "雪マジの掲載を料金データへ反映する", skill: "maintain-ski-yukimaji" },
  { key: "listings", unit: "global", title: "ツアー・パスの掲載を取り直す。やめるサイト・足すサイトを決める", skill: "maintain-ski-external-listings" },
  { key: "link-health", unit: "global", title: "リンク切れ（動画を含む）を直す", skill: "check-ski-resort-link-health" },
  { key: "wrapup", unit: "global", title: "点検し直して、指紋の基準を取り直す", skill: "maintain-ski-data-weekly" },
];
const STATUSES = ["pending", "todo", "done", "hold", "skip"];
const TOPICS = ["status", "news", "tickets", "rental", "map"];
const VERDICTS = ["same", "changed", "new", "none", "unchecked"];
const ROOT = path.join(PATHS.data, "seasonal");
const STATUS_SOURCES = "src/private/data/resorts-temporary/latest_status_sources";

const defaultSeason = () => {
  const d = new Date();
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${y + 1}`;
};
function seasonOf(args) {
  if (args.season && args.season !== true) {
    assert(/^\d{4}-\d{4}$/u.test(args.season), "--season は 2027-2028 の形");
    return args.season;
  }
  const existing = existsSync(ROOT) ? readdirSync(ROOT).filter(d => /^\d{4}-\d{4}$/u.test(d)).sort() : [];
  return existing.includes(defaultSeason()) ? defaultSeason() : (existing.at(-1) ?? defaultSeason());
}
const ledgerFile = season => path.join(ROOT, season, "run.json");
const surveyFile = (season, id) => path.join(ROOT, season, "survey", `${id}.json`);
const briefDir = (args, season) => (args.run && args.run !== true ? args.run : path.join(PATHS.runs, `${season}-seasonal`, "brief"));

async function loadLedger(args) {
  const season = seasonOf(args);
  const ledger = await readJson(ledgerFile(season), null);
  assert(ledger, `台帳がありません。先に init を実行してください（${ledgerFile(season)}）`);
  return { season, ledger };
}
const stageOf = key => {
  const stage = STAGES.find(s => s.key === key);
  assert(stage, `段階: ${STAGES.map(s => s.key).join(", ")}`);
  return stage;
};
const set = (holder, key, status, note) => {
  holder[key] = { status, ...(note ? { note } : {}), at: today() };
};

// ---------- 台帳 ----------

async function init(args) {
  const season = seasonOf(args);
  const targets = await loadTargets({ all: Boolean(args.all) });
  const ledger = await readJson(ledgerFile(season), { season, createdAt: today(), global: {}, resorts: {} });
  for (const stage of STAGES.filter(s => s.unit === "global")) ledger.global[stage.key] ??= { status: "todo" };
  let added = 0;
  for (const t of targets) {
    if (ledger.resorts[t.id]) continue;
    added++;
    ledger.resorts[t.id] = { name: t.name, active: t.active, stages: Object.fromEntries(STAGES.filter(s => s.unit === "resort").map(s => [s.key, { status: s.planned ? "pending" : "todo" }])) };
  }
  await writeJson(ledgerFile(season), ledger);
  console.log(JSON.stringify({ ledger: ledgerFile(season), resorts: Object.keys(ledger.resorts).length, added }));
}

async function status(args) {
  const { season, ledger } = await loadLedger(args);
  const lines = [`# シーズン前の再調査 ${season}（${today()}）`, "", "| 段階 | 内容 | 担当スキル | これから | 済み | 保留 | 不要 | 未判定 |", "|---|---|---|---|---|---|---|---|"];
  for (const stage of STAGES) {
    if (stage.unit === "global") {
      const s = ledger.global[stage.key] ?? { status: "todo" };
      lines.push(`| ${stage.key} | ${stage.title} | ${stage.skill} | ${s.status === "todo" ? 1 : ""} | ${s.status === "done" ? 1 : ""} | ${s.status === "hold" ? 1 : ""} | ${s.status === "skip" ? 1 : ""} | |`);
      continue;
    }
    const count = Object.fromEntries(STATUSES.map(s => [s, 0]));
    for (const r of Object.values(ledger.resorts)) count[r.stages[stage.key]?.status ?? "pending"]++;
    lines.push(`| ${stage.key} | ${stage.title} | ${stage.skill} | ${count.todo} | ${count.done} | ${count.hold} | ${count.skip} | ${count.pending} |`);
  }
  const holds = Object.entries(ledger.resorts).flatMap(([id, r]) => Object.entries(r.stages).filter(([, s]) => s.status === "hold").map(([key, s]) => `- ${r.name}（${id}） ${key}: ${s.note ?? ""}`));
  if (holds.length) lines.push("", `## 保留（${holds.length}件）`, "", ...holds.slice(0, 80), ...(holds.length > 80 ? [`ほか ${holds.length - 80}件`] : []));
  console.log(lines.join("\n"));
}

async function next(args) {
  const { ledger } = await loadLedger(args);
  const stage = stageOf(args.stage);
  if (stage.unit === "global") {
    console.log(JSON.stringify({ stage: stage.key, skill: stage.skill, status: ledger.global[stage.key]?.status ?? "todo" }));
    return;
  }
  const size = Number(args.size ?? stage.size);
  const todo = Object.entries(ledger.resorts)
    .filter(([, r]) => r.stages[stage.key]?.status === "todo")
    .sort(([a, ra], [b, rb]) => Number(rb.active ?? false) - Number(ra.active ?? false) || a.localeCompare(b));
  console.log(JSON.stringify({ stage: stage.key, skill: stage.skill, remaining: todo.length, ids: todo.slice(0, size).map(([id]) => id), notes: Object.fromEntries(todo.slice(0, size).filter(([, r]) => r.stages[stage.key].note).map(([id, r]) => [id, r.stages[stage.key].note])) }));
}

async function mark(args) {
  const { season, ledger } = await loadLedger(args);
  const stage = stageOf(args.stage);
  assert(STATUSES.includes(args.status) && args.status !== "pending", "--status は done | hold | skip | todo");
  const note = args.note && args.note !== true ? String(args.note) : undefined;
  assert(args.status !== "hold" || note, "保留には --note で理由を書く");
  if (stage.unit === "global") set(ledger.global, stage.key, args.status, note);
  else {
    const ids = listArg(args.ids);
    assert(ids?.length, "--ids を指定してください");
    for (const id of ids) {
      assert(ledger.resorts[id], `台帳に無いスキー場: ${id}`);
      set(ledger.resorts[id].stages, stage.key, args.status, note);
    }
  }
  await writeJson(ledgerFile(season), ledger);
  console.log(JSON.stringify({ stage: stage.key, status: args.status, ids: listArg(args.ids) ?? "global" }));
}

// ---------- 見て回り（survey） ----------

async function prepare(args) {
  const { season, ledger } = await loadLedger(args);
  const ids = listArg(args.ids);
  assert(ids?.length, "--ids を指定してください（next --stage survey で得る）");
  const leads = args.leads && args.leads !== true ? await readJson(args.leads) : {};
  const targets = new Map((await loadTargets({ all: true })).map(t => [t.id, t]));
  const dir = briefDir(args, season);
  for (const id of ids) {
    const t = targets.get(id);
    assert(t && ledger.resorts[id], `台帳に無いスキー場: ${id}`);
    await writeJson(path.join(dir, `${id}.json`), {
      resortId: id,
      name: t.name,
      prefecture: t.prefecture,
      season,
      officialSite: t.top,
      known: {
        // 前回の営業情報URLの調査記録があれば、そのパス（build-ski-resort-latest-crawler の url-discovery.md の形）
        status: { hasCrawler: t.hasCrawler, urls: t.crawlerUrls, previousResearch: existsSync(path.join(STATUS_SOURCES, `${id}.json`)) ? path.join(STATUS_SOURCES, `${id}.json`) : null },
        news: t.newsUrls,
        tickets: { dataSeason: t.ticket.season ? `${t.ticket.season}-${t.ticket.season + 1}` : null, urls: [...t.ticket.urls].map(([url, label]) => ({ url, label: label.slice(0, 80) })) },
        rental: { hasData: t.ticket.hasRental, urls: t.official.filter(o => /rental/iu.test(o.type)).map(o => o.url) },
        map: { pages: t.mapPageUrls, images: t.mapUrls },
      },
      // 週次の点検が機械的に拾った、未登録のページの手がかり（正しいとは限らない。必ず開いて確かめる）
      leads: leads[id]?.leads ?? [],
      output: surveyFile(season, id),
    });
  }
  console.log(JSON.stringify({ dir, ids }));
}

function shapeProblems(survey, id) {
  const problems = [];
  if (survey.resortId !== id) problems.push("resortId がファイル名と違う");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(survey.surveyedAt ?? "")) problems.push("surveyedAt は YYYY-MM-DD");
  if (!["same", "moved", "gone"].includes(survey.officialSite?.status)) problems.push("officialSite.status は same | moved | gone");
  for (const topic of TOPICS) {
    const t = survey[topic];
    if (!t || !VERDICTS.includes(t.verdict)) {
      problems.push(`${topic}.verdict は ${VERDICTS.join(" | ")}`);
      continue;
    }
    const pages = t.pages ?? [];
    if (["changed", "new"].includes(t.verdict) && !pages.length) problems.push(`${topic}: ${t.verdict} なのに pages が無い`);
    if (["unchecked", "changed"].includes(t.verdict) && !t.note) problems.push(`${topic}: ${t.verdict} の理由を note に書く`);
    for (const p of pages) if (!/^https?:\/\//u.test(p.url ?? "") || !p.what || !p.evidence) problems.push(`${topic}: pages は url・what・evidence が要る（${p.url ?? "URLなし"}）`);
  }
  if (survey.tickets && !(survey.tickets.season === null || /^\d{4}-\d{4}$/u.test(survey.tickets.season ?? ""))) problems.push("tickets.season は公式に書かれているシーズン（2027-2028）か null");
  return problems;
}

async function auditSurvey(args) {
  const { season, ledger } = await loadLedger(args);
  const dir = path.join(ROOT, season, "survey");
  const ids = listArg(args.ids) ?? (existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith(".json")).map(f => f.replace(/\.json$/u, "")) : []);
  const report = [];
  for (const id of ids) {
    assert(ledger.resorts[id], `台帳に無いスキー場: ${id}`);
    const survey = await readJson(surveyFile(season, id), null);
    if (!survey) {
      report.push({ id, problems: ["結果のファイルが無い"] });
      continue;
    }
    const problems = shapeProblems(survey, id);
    // 報告されたページが実際に開けること（自動アクセスを拒否するサイトは確かめられないので通す）
    const urls = [...new Set([survey.officialSite?.url, ...TOPICS.flatMap(t => (survey[t]?.pages ?? []).map(p => p.url))].filter(u => /^https?:\/\//u.test(u ?? "")))];
    await mapLimit(urls, 3, async url => {
      const issue = classify(url, await httpProbe(url));
      if (issue && !["blocked", "moved-domain"].includes(issue.code)) problems.push(`開けない・無くなっている（${issue.code}）${url}`);
    });
    report.push({ id, problems });
    const done = ledger.resorts[id].stages.survey?.status === "done";
    if (!problems.length) set(ledger.resorts[id].stages, "survey", "done");
    else if (done) set(ledger.resorts[id].stages, "survey", "todo", "監査で問題が出た");
  }
  await writeJson(ledgerFile(season), ledger);
  const bad = report.filter(r => r.problems.length);
  console.log(JSON.stringify({ audited: report.length, ok: report.length - bad.length, problems: bad }, null, 1));
  if (bad.length) process.exitCode = 1;
}

async function plan(args) {
  const { season, ledger } = await loadLedger(args);
  const startYear = Number(season.slice(0, 4));
  const targets = new Map((await loadTargets({ all: true })).map(t => [t.id, t]));
  const ids = listArg(args.ids) ?? Object.keys(ledger.resorts);
  const moved = v => ["changed", "new"].includes(v);
  const decided = { crawler: {}, tickets: {}, maps: {} };
  const decide = (id, key, status, note) => {
    const current = ledger.resorts[id].stages[key]?.status ?? "pending";
    // 手で決めた・済んだ段階は上書きしない
    if (!["pending", "hold"].includes(current)) return;
    set(ledger.resorts[id].stages, key, status, note);
    decided[key][status] = (decided[key][status] ?? 0) + 1;
  };
  for (const id of ids) {
    const entry = ledger.resorts[id];
    if (!entry || entry.stages.survey?.status !== "done") continue;
    const survey = await readJson(surveyFile(season, id));
    const t = targets.get(id);
    const pagesOf = topic => (survey[topic].pages ?? []).map(p => p.url).join(" ");

    if (moved(survey.status.verdict) || moved(survey.news.verdict)) decide(id, "crawler", "todo", `${survey.status.verdict === "new" ? "営業情報のページができた" : "取得先を見直す"}: ${pagesOf("status")} ${pagesOf("news")}`.trim());
    else if (survey.status.verdict === "unchecked") decide(id, "crawler", "hold", survey.status.note);
    else decide(id, "crawler", "skip", "取得先に変化なし");

    const dataYear = t?.ticket.season ?? null;
    const published = survey.tickets.season ? Number(survey.tickets.season.slice(0, 4)) >= startYear : false;
    if (survey.tickets.verdict === "none" && survey.rental.verdict === "none") decide(id, "tickets", "skip", "公式に料金の掲載が無い");
    else if (survey.tickets.verdict === "unchecked") decide(id, "tickets", "hold", survey.tickets.note);
    else if (!published && (dataYear === null || dataYear < startYear)) decide(id, "tickets", "hold", `今季（${season}）の料金が未発表。週次の見回り（watch-ski-official-pages）が発表を拾う`);
    else if (dataYear === null || dataYear < startYear) decide(id, "tickets", "todo", `今季料金が発表済み: ${pagesOf("tickets")}`.trim());
    else if (moved(survey.tickets.verdict) || moved(survey.rental.verdict)) decide(id, "tickets", "todo", `料金・レンタルのページが変わった: ${pagesOf("tickets")} ${pagesOf("rental")}`.trim());
    else decide(id, "tickets", "skip", "今季のデータがあり、ページに変化なし");

    if (moved(survey.map.verdict)) decide(id, "maps", "todo", `マップのページが変わった: ${pagesOf("map")}`);
    else if (survey.map.verdict === "unchecked") decide(id, "maps", "hold", survey.map.note);
    else decide(id, "maps", "skip", "マップのページに変化なし（図の古さは maintain-ski-trail-maps の点検が見る）");
  }
  await writeJson(ledgerFile(season), ledger);
  console.log(JSON.stringify({ planned: decided }));
}

runCli(import.meta.url, { init, status, next, prepare, "audit-survey": auditSurvey, plan, mark });
