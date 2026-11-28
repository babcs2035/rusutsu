#!/usr/bin/env node
// スキー場に登録してあるリンク（resort_links と旧来のリンク文書）を全部開いて、
// 切れている・別のサイトへ転送される・トップへ戻される・「ページがありません」と出るリンクを見つける。
// 本番へは読むだけ。リポジトリのルートで実行する。
//
//   node .claude/skills/check-ski-resort-link-health/scripts/link-health.mjs check \
//     --run <作業ディレクトリ> [--scope official,external,legacy] [--ids a,b] [--all] [--limit N]
//     [--no-browser] [--no-state]
//
//   scope: official = resort_links の公式の行 / external = ツアー会社など外部サイトの行 /
//          legacy = リンク文書の公式サイト・スクール・お知らせ一覧 / video = リンク文書のYouTube動画
//   既定は official,external,legacy（動画は数が多いのでシーズン前の再調査で見る）
//
// 出力: <run>/result.json、<run>/summary.md、<run>/tasks.json
//
//   リンク文書（公式サイト・スクール・お知らせ一覧・動画）の直し:
//   node .../link-health.mjs apply --decisions <decisions.json> [--apply]
//     decisions: [{ "owner": "<リンク文書のキー>", "field": "officialSiteUrls", "from": "<今のURL>", "to": "<新しいURL>" | null, "reason": "..." }]
//     to が null ならその項目を外す。既定は差分の確認だけ。--apply で本番のリンク文書へ書く（版が変わっていたら書かない）
import assert from "node:assert/strict";
import path from "node:path";
import {
  LINKS_KEY,
  PATHS,
  batches,
  fetchUrl,
  hostOf,
  htmlText,
  htmlTitle,
  httpProbe,
  lightContext,
  listArg,
  loadKnown,
  loadLinksDocument,
  loadResortLinkRows,
  loadResorts,
  mapByHost,
  mapLimit,
  markKnown,
  readJson,
  renderPage,
  runCli,
  runDir,
  siteOf,
  today,
  withBrowser,
  writeJson,
  writeResult,
  writeText,
} from "../../maintain-ski-data-weekly/scripts/lib.mjs";

const STATE = path.join(PATHS.data, "link-health-state.json");
const LEGACY_FIELDS = ["officialSiteUrls", "skiSchoolUrls", "snowboardSchoolUrls", "skiResortInfoUrls", "newsUrls"];
const VIDEO_FIELDS = ["espeYukiUrls", "gelandePlusTubeUrls", "youtubeUrls"];
const OWNERS = {
  official: { skill: "collect-ski-resort-official-links", what: "公式リンクを集め直す（切れた種類だけ）" },
  external: { skill: "maintain-ski-external-listings", what: "外部サイトの一覧を取り直す" },
  legacy: { skill: "check-ski-resort-link-health", what: "公式サイト・スクール・お知らせ一覧の新しいURLを探して直す（SKILL.md の「直し方」）" },
  video: { skill: "check-ski-resort-link-health", what: "消えた動画のリンクを外す（SKILL.md の「直し方」）" },
};

const NOT_FOUND = /ページが見つかりません|ページは見つかりません|お探しのページ|ページが存在しません|ページは存在しません|指定されたページ|アクセスしようとしたページ|404\s*not\s*found|page\s*not\s*found|404\s*error|not\s*found|公開を終了|公開は終了|掲載を終了|掲載は終了|このページは削除|閉鎖しました/iu;
const PARKED = /this domain (?:is|may be) for sale|ドメイン.{0,12}(?:販売|売却|取得できます|失効)|お名前\.com.{0,40}ドメイン|domain parking|buy this domain|sedo\.com|このドメインは.{0,20}(?:期限|停止)/iu;
const isYouTube = url => /(?:^|\.)youtube\.com$|^youtu\.be$/u.test(hostOf(url));
const isYouTubeVideo = url => isYouTube(url) && /watch\?|youtu\.be\/|\/shorts\/|\/live\/|\/embed\//u.test(url);
const isRoot = url => {
  try {
    return /^\/?(?:index\.(?:html?|php))?$/u.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

/** 取得結果から、リンクの状態を決める。問題なしは null */
export function classify(url, probe) {
  if (probe.error) {
    if (/ENOTFOUND|EAI_AGAIN/u.test(probe.error)) return { code: "dns-gone", severity: "high", message: "サイトのドメインが引けない（サイトが無くなった可能性）" };
    return { code: "unreachable", severity: "medium", retry: true, message: `つながらない（${probe.error}）` };
  }
  const s = probe.status;
  if (s === 404 || s === 410) return { code: "not-found", severity: "high", message: `ページが無い（HTTP ${s}）` };
  if ([401, 403, 405, 406, 429, 999].includes(s)) return { code: "blocked", severity: "low", retry: true, message: `自動アクセスを拒否された（HTTP ${s}）` };
  if (s >= 500) return { code: "server-error", severity: "medium", retry: true, message: `サイト側のエラー（HTTP ${s}）` };
  if (s >= 400) return { code: "http-error", severity: "medium", retry: true, message: `HTTP ${s}` };
  const title = probe.title ?? htmlTitle(probe.html);
  const text = probe.text ?? htmlText(probe.html);
  if (PARKED.test(`${title} ${text.slice(0, 1500)}`)) return { code: "parked", severity: "high", message: `ドメインが売りに出ている・失効している表示（${title}）` };
  if (NOT_FOUND.test(title) || (text.length < 1200 && NOT_FOUND.test(text))) return { code: "soft-404", severity: "medium", message: `開けるが「ページがありません」の表示（${title || text.slice(0, 40)}）` };
  const final = probe.finalUrl ?? url;
  if (siteOf(final) && siteOf(final) !== siteOf(url)) return { code: "moved-domain", severity: "medium", message: `別のサイトへ転送される → ${final}`, finalUrl: final };
  if (!isRoot(url) && isRoot(final) && hostOf(final).replace(/^www\./u, "") === hostOf(url).replace(/^www\./u, "")) return { code: "redirected-top", severity: "medium", message: `トップページへ戻される（元のページが無くなった可能性）→ ${final}`, finalUrl: final };
  return null;
}

/** YouTubeの動画は、公開されているかを oEmbed で確かめる（ページ本体は消えていても200を返すため） */
async function probeVideo(url) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(15_000) });
    await r.body?.cancel().catch(() => {});
    if (r.ok) return null;
    if (r.status === 404 || r.status === 400) return { code: "video-gone", severity: "medium", message: "動画が削除された・URLが正しくない" };
    if (r.status === 401 || r.status === 403) return { code: "video-private", severity: "low", message: "動画が非公開、または埋め込みが禁止されている" };
    return { code: "unreachable", severity: "low", message: `YouTubeの確認に失敗（HTTP ${r.status}）` };
  } catch (error) {
    return { code: "unreachable", severity: "low", message: `YouTubeの確認に失敗（${error.name}）` };
  }
}

async function collect(scopes, { resorts, canonicalId }, only, includeInactive) {
  const resortOf = new Map(resorts.map(r => [r.id, r]));
  const targets = new Map();
  const add = (rawId, url, scope, where, owner) => {
    const id = canonicalId(rawId);
    const resort = resortOf.get(id);
    if (!resort || (!includeInactive && !resort.active) || (only && !only.includes(id))) return;
    if (!/^https?:\/\//u.test(url ?? "")) return;
    const key = fetchUrl(url);
    if (!targets.has(key)) targets.set(key, { url: key, refs: [] });
    targets.get(key).refs.push({ id, name: resort.name, scope, where, ...(owner ? { owner, registered: url } : {}) });
  };
  if (scopes.includes("official") || scopes.includes("external")) {
    for (const row of await loadResortLinkRows()) {
      const scope = row.source === "official" ? "official" : "external";
      if (scopes.includes(scope)) add(row.resortId, row.url, scope, scope === "official" ? row.type : `${row.source}/${row.type}`);
    }
  }
  if (scopes.includes("legacy") || scopes.includes("video")) {
    const { links } = await loadLinksDocument();
    for (const [resortId, fields] of Object.entries(links)) {
      if (scopes.includes("legacy")) for (const field of LEGACY_FIELDS) for (const item of fields[field] ?? []) add(resortId, item.url, "legacy", field, resortId);
      if (scopes.includes("video")) for (const field of VIDEO_FIELDS) for (const item of fields[field] ?? []) add(resortId, item.url, "video", field, resortId);
    }
  }
  return [...targets.values()];
}

async function check(args) {
  const dir = runDir(args, "links");
  const scopes = listArg(args.scope) ?? ["official", "external", "legacy"];
  const only = listArg(args.ids);
  let targets = await collect(scopes, await loadResorts(), only, Boolean(args.all));
  if (args.limit) targets = targets.slice(0, Number(args.limit));
  console.error(`リンク ${targets.length}件（${scopes.join(",")}）を確かめる → ${dir}`);

  const outcome = new Map();
  let done = 0;
  await mapByHost(
    targets.map(t => t.url),
    async url => {
      outcome.set(url, isYouTubeVideo(url) ? await probeVideo(url) : classify(url, await httpProbe(url)));
      if (++done % 500 === 0) console.error(`  ${done}/${targets.length}`);
    },
    { hosts: Number(args.concurrency ?? 20) },
  );

  // つながらない・拒否されたものは、少し待ってから実際のブラウザで開き直す（一時的な不調と自動アクセス拒否を分ける）
  const retry = targets.filter(t => outcome.get(t.url)?.retry);
  if (retry.length && !args["no-browser"]) {
    console.error(`ブラウザで開き直す ${retry.length}件`);
    await withBrowser(async browser => {
      const context = await lightContext(browser);
      await mapLimit(retry, 4, async t => {
        const page = await renderPage(context, t.url, { settle: 1500 });
        const again = classify(t.url, page);
        if (again?.retry && page.error) again.message = `ブラウザでも開けない（${page.error}）`;
        outcome.set(t.url, again);
      });
      await context.close();
    });
  }

  // 続けて失敗している回数（一時的な不調は1回目は低く、続いたら上げる）
  const state = await readJson(STATE, { failing: {} });
  const findings = [];
  for (const t of targets) {
    const result = outcome.get(t.url);
    if (!result) {
      delete state.failing[t.url];
      continue;
    }
    const prev = state.failing[t.url];
    const runs = (prev?.runs ?? 0) + (prev?.lastDate === today() ? 0 : 1);
    state.failing[t.url] = { code: result.code, since: prev?.since ?? today(), lastDate: today(), runs: Math.max(runs, 1) };
    let severity = result.severity;
    if (["unreachable", "server-error", "http-error"].includes(result.code)) severity = runs >= 3 ? "high" : runs === 2 ? "medium" : "low";
    const scopesOf = [...new Set(t.refs.map(r => r.scope))];
    const where = [...new Set(t.refs.map(r => `${r.scope}:${r.where}`))].slice(0, 4).join("、");
    const others = [...new Set(t.refs.map(r => r.id))].slice(1);
    findings.push({
      id: t.refs[0].id,
      name: t.refs[0].name,
      severity,
      code: result.code,
      message: `${result.message}${runs > 1 ? `（${runs}回続けて。${state.failing[t.url].since}から）` : ""} ［${where}］${others.length ? ` ほか${others.length}スキー場` : ""}`,
      url: t.url,
      finalUrl: result.finalUrl,
      scopes: scopesOf,
      resortIds: [...new Set(t.refs.map(r => r.id))],
      refs: t.refs.map(r => ({ id: r.id, scope: r.scope, where: r.where, ...(r.owner ? { owner: r.owner, registered: r.registered } : {}) })),
    });
  }
  state.updatedAt = new Date().toISOString();
  if (!args["no-state"]) await writeJson(STATE, state);
  markKnown(findings, await loadKnown("links"));

  const actionable = findings.filter(f => !f.known && f.severity !== "low");
  const handoff = [];
  const tasks = {};
  for (const scope of Object.keys(OWNERS)) {
    const rows = actionable.filter(f => f.scopes.includes(scope));
    if (!rows.length) continue;
    const ids = [...new Set(rows.flatMap(f => f.refs.filter(r => r.scope === scope).map(r => (scope === "external" ? r.where.split("/")[0] : r.id))))].sort();
    handoff.push({ ...OWNERS[scope], ids });
    tasks[scope] = batches(
      rows.map(f => ({ url: f.url, code: f.code, message: f.message, finalUrl: f.finalUrl, refs: f.refs.filter(r => r.scope === scope) })),
      20,
    );
  }
  await writeJson(path.join(dir, "tasks.json"), { createdAt: new Date().toISOString(), tasks });
  const blocked = findings.filter(f => f.code === "blocked").length;
  await writeResult(dir, {
    area: "links",
    title: "リンク切れの点検",
    checked: targets.length,
    findings,
    notes: [
      `対象: ${scopes.join("・")}（SNS・Googleマップ・天気サイトは自動で確かめられないので対象外。ゲレンデマップは maintain-ski-trail-maps、リフト券の料金ページは watch-ski-official-pages が見る）`,
      ...(blocked ? [`自動アクセスを拒否するサイトが ${blocked}件あり、切れているかは分からない（低）。`] : []),
    ],
    handoff,
  });
}

// ---------- apply: リンク文書の項目を直す ----------

async function apiWrite(p, init) {
  const base = process.env.API_BASE_URL?.trim().replace(/\/+$/u, "");
  const token = process.env.API_BEARER_TOKEN?.trim();
  assert(base && token, "API_BASE_URL と API_BEARER_TOKEN が必要です（.env.local）");
  const r = await fetch(`${base}/api/admin/${p}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`データAPI HTTP ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return r.json();
}

async function apply(args) {
  assert(args.decisions && args.decisions !== true, "--decisions <file> を指定してください");
  const decisions = await readJson(args.decisions);
  const fields = new Set([...LEGACY_FIELDS, ...VIDEO_FIELDS]);
  const { document } = await apiWrite(`documents?key=${LINKS_KEY}`, { method: "GET" });
  const links = JSON.parse(document.content);
  const applied = [];
  const problems = [];
  const added = [];
  for (const d of decisions) {
    const label = `${d.owner}.${d.field}`;
    if (!fields.has(d.field)) {
      problems.push(`${label}: この項目は直せない（${[...fields].join("・")} だけ）`);
      continue;
    }
    const list = links[d.owner]?.[d.field];
    const index = list?.findIndex(item => item.url === d.from) ?? -1;
    if (index < 0) {
      problems.push(`${label}: 今のURLが見つからない ${d.from}`);
      continue;
    }
    if (d.to === null) list.splice(index, 1);
    else if (/^https?:\/\//u.test(d.to ?? "")) {
      if (list.some((item, i) => i !== index && item.url === d.to)) list.splice(index, 1);
      else list[index] = { ...list[index], url: d.to };
      added.push({ label, url: d.to });
    } else {
      problems.push(`${label}: to は URL か null`);
      continue;
    }
    applied.push({ owner: d.owner, field: d.field, from: d.from, to: d.to, reason: d.reason ?? null });
  }
  // 新しいURLが実際に開けることを確かめる
  await mapLimit(added, 6, async a => {
    const issue = isYouTubeVideo(a.url) ? await probeVideo(a.url) : classify(a.url, await httpProbe(a.url));
    if (issue && issue.code !== "blocked") problems.push(`${a.label}: 新しいURLに問題がある（${issue.code}: ${issue.message}）${a.url}`);
  });
  const write = Boolean(args.apply);
  console.log(JSON.stringify({ canonicalVersion: document.version, write, applied, problems }, null, 1));
  if (!write) return;
  assert(!problems.length, "問題があるので反映しない（決定を直して再実行）");
  if (!applied.length) return;
  const content = `${JSON.stringify(Object.fromEntries(Object.entries(links).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`;
  const backup = path.join(PATHS.runs, "backups", new Date().toISOString().replace(/[:.]/gu, "-"));
  await writeText(path.join(backup, "before.json"), document.content);
  await writeText(path.join(backup, "after.json"), content);
  await apiWrite("documents", { method: "PUT", body: JSON.stringify({ documents: [{ key: LINKS_KEY, content, mediaType: document.mediaType, expectedHash: document.hash }] }) });
  const saved = (await apiWrite(`documents?key=${LINKS_KEY}`, { method: "GET" })).document;
  assert.equal(saved.content, content, "読み戻しが一致しない");
  const record = path.join(PATHS.data, "link-fixes", `${today()}.json`);
  const prev = await readJson(record, { applied: [] });
  prev.applied.push({ appliedAt: new Date().toISOString(), fromVersion: document.version, toVersion: saved.version, backup, items: applied });
  await writeJson(record, prev);
  console.log(JSON.stringify({ verified: true, version: saved.version, record, backup }));
}

runCli(import.meta.url, { check, apply });
