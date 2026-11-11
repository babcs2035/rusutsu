#!/usr/bin/env node
// ゲレンデマップの点検・候補抽出・実画面測定・一覧画像・本番反映。
// 使い方は SKILL.md。リポジトリのルートで `node .claude/skills/maintain-ski-trail-maps/scripts/trail-map.mjs <command>`。
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  FRAMES,
  PATHS,
  PROXY_MAX_BYTES,
  SITE_BASE,
  api,
  assetStem,
  buildInventory,
  currentSeason,
  fitInFrames,
  inferSeason,
  isMain,
  LINKS_KEY,
  mapCandidates,
  mapLimit,
  parseArgs,
  pdfFirstPage,
  probeAsset,
  readCanonical,
  readJson,
  referenceOnPage,
  scanPage,
  seasonLabel,
  today,
  writeJson,
} from "./lib.mjs";

const SEVERITY = { high: 3, medium: 2, low: 1, info: 0 };
const isMapType = t => t?.startsWith("image/") || t === "application/pdf";
const short = url => {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.pathname.split("/").pop() || u.hostname).slice(0, 48);
  } catch {
    return url.slice(0, 48);
  }
};
const runDir = args => args.run ?? path.join(PATHS.runs, `${today()}-${args._[0] ?? "run"}`);
const idsArg = args => (args.ids ? String(args.ids).split(",").map(s => s.trim()).filter(Boolean) : null);

async function withBrowser(fn, { chrome = false } = {}) {
  const { chromium } = await import("playwright");
  // headless Chromium はPDFを描かない。PDFの見た目を撮るときは実際の Chrome を画面外で開く
  const browser = await chromium.launch(chrome ? { channel: "chrome", headless: false, args: ["--window-position=-2400,0"] } : { headless: true });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

/** 画像・フォント・動画を読まないページ（走査用） */
async function lightPage(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: "ja-JP", userAgent: undefined });
  await context.route("**/*", r => (["image", "font", "media"].includes(r.request().resourceType()) ? r.abort() : r.continue()));
  return context.newPage();
}

// ---------- check: 全件の機械点検 ----------

function judgeMaps(row, probes, baseline) {
  const flags = [];
  const flag = (code, severity, kind, message, url) => flags.push({ code, severity, kind, message, ...(url ? { url } : {}) });
  const seenSha = new Map();
  const seenStem = new Map();
  for (const p of probes) {
    const name = short(p.url);
    if (p.error || !p.status || p.status >= 400) {
      flag("map-error", "high", "display", `マップを取得できない（${p.error ?? `HTTP ${p.status}`}）: ${name}`, p.url);
      continue;
    }
    if (!isMapType(p.type)) {
      flag("map-not-image", "high", "display", `画像・PDFではない（${p.type || "不明"}${p.redirected ? ` / 転送先 ${p.finalUrl}` : ""}）: ${name}`, p.url);
      continue;
    }
    if (p.redirected && new URL(p.finalUrl).host !== new URL(p.url).host)
      flag("map-redirected", "medium", "fresh", `別ホストへ転送される（${p.finalUrl}）`, p.url);
    if (p.hotlinkBlocked) flag("map-hotlink-blocked", "medium", "display", `他サイトからの直接表示を拒否（中継表示に頼る）: ${name}`, p.url);
    if (!isMapType(p.headerType)) flag("map-proxy-type", "medium", "display", `Content-Type が ${p.headerType || "なし"}（中継が受け付けない）: ${name}`, p.url);
    if (p.url.startsWith("http://")) flag("map-http", "low", "display", `http のURL（https版があれば置き換える）: ${name}`, p.url);
    if (p.truncated || p.bytes > PROXY_MAX_BYTES) flag("map-too-large", "medium", "display", `${Math.round(p.bytes / 1e6)}MB（中継の上限40MB超）: ${name}`, p.url);
    else if (p.type.startsWith("image/") && p.bytes > 8e6) flag("map-heavy", "low", "display", `画像が${Math.round(p.bytes / 1e6)}MB（スマホで重い）: ${name}`, p.url);
    const fit = fitInFrames(p);
    p.fit = fit;
    if (!fit) {
      flag("map-size-unknown", "low", "display", `寸法を読めない（${p.type}）: ${name}`, p.url);
    } else if (p.type.startsWith("image/")) {
      const small = Object.values(fit).every(f => f.scale === 1 && f.fill < 0.5);
      if (small) flag("map-small", "medium", "display", `原寸 ${p.width}x${p.height} が枠より小さく、小さく表示される`, p.url);
      else if (Math.max(p.width, p.height) < 800) flag("map-low-res", "low", "display", `原寸 ${p.width}x${p.height}（拡大すると読めない）`, p.url);
      const thin = Object.entries(fit).filter(([, f]) => f.fill < 0.4);
      if (!small && thin.length) flag("map-low-fill", "low", "display", `縦横比 ${(p.width / p.height).toFixed(2)} で枠の${Math.round(Math.min(...thin.map(([, f]) => f.fill)) * 100)}%しか使わない（${thin.map(([k]) => k).join("/")}）`, p.url);
      if (p.frames > 1) flag("map-animated", "low", "display", "アニメーションGIF", p.url);
    }
    if (p.type === "application/pdf") flag("map-pdf", "low", "display", `PDF${p.pages > 1 ? `（${p.pages}ページ、枠には1ページ目だけ）` : ""}。スマホのブラウザは埋め込みPDFを出せないことがあるので、同じ掲載元に画像版があれば画像を優先する`, p.url);
    const season = inferSeason(p.url, p.lastModified);
    p.season = season;
    if (season.season != null && season.confidence !== "low" && season.season < currentSeason() - 1)
      flag("map-old-season", "low", "fresh", `URLから ${seasonLabel(season.season)} シーズンの図と推定（${season.source}）`, p.url);
    const before = baseline?.maps?.[p.url];
    if (before?.sha256 && p.sha256 && before.sha256 !== p.sha256)
      flag("map-content-changed", "info", "fresh", `同じURLのまま中身が変わった（${before.width}x${before.height} → ${p.width}x${p.height}、前回 ${before.acceptedAt?.slice(0, 10) ?? "?"}）`, p.url);
    if (p.sha256) {
      if (seenSha.has(p.sha256)) flag("map-duplicate", "low", "display", `同じ画像が2回登録されている（${short(seenSha.get(p.sha256))}）`, p.url);
      seenSha.set(p.sha256, p.url);
    }
    const stem = assetStem(p.finalUrl ?? p.url);
    if (seenStem.has(stem) && seenSha.get(p.sha256) !== seenStem.get(stem)) flag("map-duplicate", "low", "display", `形式・サイズ違いの同じ図かもしれない（${short(seenStem.get(stem))}）`, p.url);
    seenStem.set(stem, p.url);
  }
  if (row.mapUrls.length > 1) flag("map-multiple", "medium", "display", `マップが${row.mapUrls.length}枚登録されている（1スキー場1枚。見やすい1枚に絞る）`);
  if (!row.mapUrls.length) flag("no-map", row.active ? "high" : "low", "coverage", row.active ? "マップ未登録" : "マップ未登録（非アクティブ）");
  return flags;
}

function judgePages(row, probes, scans, baseline, flags) {
  const flag = (code, severity, kind, message, url) => flags.push({ code, severity, kind, message, ...(url ? { url } : {}) });
  if (row.mapUrls.length && !row.mapPageUrls.length) flag("page-missing", "medium", "coverage", "掲載元ページが未登録（更新を追えない）");
  const okScans = scans.filter(s => !s.error && (s.status ?? 200) < 400);
  for (const s of scans) {
    if (s.error || (s.status ?? 0) >= 400) flag("page-error", "high", "fresh", `掲載元を開けない（${s.error ?? `HTTP ${s.status}`}）`, s.url);
    else if (s.finalUrl && new URL(s.finalUrl).pathname !== new URL(s.url).pathname && /^\/?(\?.*)?$/.test(new URL(s.finalUrl).pathname))
      flag("page-redirected-top", "high", "fresh", `掲載元がトップページへ転送される（${s.finalUrl}）`, s.url);
  }
  if (!okScans.length) return { candidates: [] };
  const allAssets = okScans.flatMap(s => (s.assets ?? []).map(a => a.url));
  const html = okScans.map(s => s.html ?? "").join("\n");
  const refs = row.mapUrls.map(m => ({ url: m.url, ref: referenceOnPage(html, allAssets, m.url) }));
  const missing = refs.filter(r => r.ref === "no");
  if (refs.length && missing.length === refs.length) flag("map-not-on-page", "high", "fresh", "登録したマップが掲載元に見当たらない（差し替え・移転の疑い）");
  else for (const m of missing) flag("map-not-on-page", "medium", "fresh", `一部のマップが掲載元に見当たらない: ${short(m.url)}`, m.url);
  const registeredStems = new Set(row.mapUrls.flatMap(m => [assetStem(m.url)]));
  const candidates = okScans
    .flatMap(s => mapCandidates(s).map(c => ({ ...c, page: s.finalUrl ?? s.url })))
    .filter(c => !registeredStems.has(assetStem(c.url)));
  const regSeasons = probes.map(p => p.season?.confidence !== "none" ? p.season?.season : null).filter(s => s != null);
  const regSeason = regSeasons.length ? Math.max(...regSeasons) : null;
  const newer = candidates.filter(c => c.season != null && c.score >= 4 && (regSeason == null ? c.seasonConfidence !== "low" && c.season >= currentSeason() - 1 : c.season > regSeason));
  if (newer.length) flag("newer-candidate", "high", "fresh", `掲載元に新しい年度らしいマップ候補（${newer.slice(0, 3).map(c => `${short(c.url)}=${seasonLabel(c.season)}`).join(", ")}；登録は${seasonLabel(regSeason)}）`, newer[0].url);
  const strong = new Set(candidates.filter(c => c.score >= 4).map(c => assetStem(c.url)));
  const before = baseline?.pageCandidates;
  if (before) {
    const added = [...strong].filter(s => !before.includes(s));
    if (added.length) flag("page-candidates-changed", "medium", "fresh", `前回の点検以降、掲載元にマップらしい画像が増えた（${added.length}件）`);
  }
  return { candidates: candidates.slice(0, 8), candidateStems: [...strong], regSeason };
}

function statusOf(flags) {
  const worst = kind => Math.max(-1, ...flags.filter(f => !kind || f.kind === kind).map(f => SEVERITY[f.severity]));
  if (flags.some(f => f.code === "no-map")) return "no-map";
  if (worst("display") >= 3) return "broken";
  if (worst("fresh") >= 2) return "stale-suspect";
  if (worst("coverage") >= 2) return "page-missing";
  if (worst("display") >= 2) return "display-warn";
  return "ok";
}

async function check(args) {
  const dir = runDir(args);
  const only = idsArg(args);
  const { document, links, resorts } = await readCanonical();
  let rows = buildInventory(links, resorts);
  if (only) rows = rows.filter(r => only.includes(r.id));
  if (args["active-only"]) rows = rows.filter(r => r.active);
  if (args.limit) rows = rows.slice(0, Number(args.limit));
  const state = await readJson(PATHS.state, { version: 1, resorts: {} });
  console.error(`点検 ${rows.length}件（正本 ${LINKS_KEY} v${document.version}）→ ${dir}`);

  const probes = await mapLimit(rows.flatMap(r => r.mapUrls.map(m => m.url)), Number(args.concurrency ?? 8), url => probeAsset(url));
  const probeOf = new Map(probes.map(p => [p.url, p]));

  const pageUrls = [...new Set(rows.flatMap(r => r.mapPageUrls.map(p => p.url)))];
  const scans = new Map();
  if (!args["no-pages"]) {
    await withBrowser(async browser => {
      const pages = await Promise.all(Array.from({ length: Number(args["page-concurrency"] ?? 4) }, () => lightPage(browser)));
      let next = 0;
      await Promise.all(pages.map(async page => {
        while (next < pageUrls.length) {
          const url = pageUrls[next++];
          scans.set(url, await scanPage(page, url));
          if (scans.size % 25 === 0) console.error(`  掲載元 ${scans.size}/${pageUrls.length}`);
        }
      }));
    });
  }

  const report = [];
  for (const row of rows) {
    const rowProbes = row.mapUrls.map(m => ({ ...probeOf.get(m.url) }));
    const baseline = state.resorts[row.id];
    const flags = judgeMaps(row, rowProbes, baseline);
    const rowScans = row.mapPageUrls.map(p => scans.get(p.url)).filter(Boolean);
    const page = args["no-pages"] ? { candidates: [] } : judgePages(row, rowProbes, rowScans, baseline, flags);
    flags.sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity]);
    report.push({
      id: row.id,
      name: row.name,
      prefecture: row.prefecture,
      active: row.active,
      status: statusOf(flags),
      flags,
      officialSiteUrls: row.officialSiteUrls.map(l => l.url),
      website: row.website,
      mapPageUrls: row.mapPageUrls.map(l => ({ url: l.url, owner: l.owner, status: scans.get(l.url)?.status ?? null, finalUrl: scans.get(l.url)?.finalUrl ?? null })),
      maps: rowProbes.map(p => ({
        url: p.url,
        owner: row.mapUrls.find(m => m.url === p.url)?.owner,
        status: p.status ?? null,
        type: p.type ?? null,
        bytes: p.bytes ?? null,
        width: p.width ?? null,
        height: p.height ?? null,
        pages: p.pages ?? null,
        sha256: p.sha256 ?? null,
        season: p.season?.season ?? null,
        seasonSource: p.season?.source ?? null,
        fit: p.fit ?? null,
        finalUrl: p.redirected ? p.finalUrl : undefined,
        error: p.error,
      })),
      candidates: page.candidates,
      _stems: page.candidateStems,
    });
  }

  // 有望な候補だけ寸法を測っておく（担当エージェントが画像を開かずに判断できるように）
  const needCandidateProbe = report.filter(r => ["stale-suspect", "broken", "display-warn"].includes(r.status) && r.candidates.length);
  await mapLimit(needCandidateProbe.flatMap(r => r.candidates.slice(0, 3)), 6, async c => {
    const p = await probeAsset(c.url);
    Object.assign(c, { type: p.type ?? null, width: p.width ?? null, height: p.height ?? null, bytes: p.bytes ?? null, status: p.status ?? null });
  });

  // 前回分（基準）の更新: 基準が無い・中以上の指摘が無い・--accept で指定、のどれか
  const accept = new Set(String(args.accept ?? "").split(",").filter(Boolean));
  const now = new Date().toISOString();
  for (const r of report) {
    const hasIssue = r.flags.some(f => SEVERITY[f.severity] >= 2 && f.kind !== "coverage");
    const base = state.resorts[r.id];
    if (!r.maps.length) {
      delete state.resorts[r.id];
      continue;
    }
    if (base && hasIssue && !accept.has(r.id) && !accept.has("all")) {
      base.lastCheckedAt = now;
      continue;
    }
    state.resorts[r.id] = {
      acceptedAt: now,
      lastCheckedAt: now,
      maps: Object.fromEntries(r.maps.filter(m => m.sha256).map(m => [m.url, { sha256: m.sha256, bytes: m.bytes, width: m.width, height: m.height, type: m.type, season: m.season, acceptedAt: now }])),
      pageCandidates: r._stems ?? base?.pageCandidates ?? [],
    };
  }
  for (const r of report) delete r._stems;
  if (!only && !args.limit && !args["no-pages"]) {
    // 全件点検のときだけ、正本から消えた施設の基準を捨てる
    const alive = new Set(report.map(r => r.id));
    for (const id of Object.keys(state.resorts)) if (!alive.has(id)) delete state.resorts[id];
  }
  state.updatedAt = now;
  state.canonicalVersion = document.version;
  if (!args["no-state"]) await writeJson(PATHS.state, state);

  const counts = Object.groupBy(report, r => r.status);
  const summary = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.length]));
  const codeCounts = {};
  for (const r of report) for (const f of r.flags) codeCounts[f.code] = (codeCounts[f.code] ?? 0) + 1;
  await writeJson(path.join(dir, "report.json"), { checkedAt: now, canonical: { key: LINKS_KEY, version: document.version, hash: document.hash }, season: seasonLabel(currentSeason()), frames: FRAMES, summary, codeCounts, resorts: report });
  await writeJson(path.join(dir, "tasks.json"), buildTasks(report, Number(args["batch-size"] ?? 10)));
  await writeFile(path.join(dir, "summary.md"), renderSummary(report, summary, codeCounts, document.version));
  console.log(JSON.stringify({ dir, total: report.length, summary, codeCounts }, null, 1));
}

/** サブエージェントに渡す仕事。小さな文脈だけ持たせる。 */
function buildTasks(report, size) {
  const compact = r => ({
    id: r.id,
    name: r.name,
    prefecture: r.prefecture,
    active: r.active,
    status: r.status,
    flags: r.flags.filter(f => f.severity !== "info").map(f => `${f.code}: ${f.message}`),
    officialSiteUrls: r.officialSiteUrls.length ? r.officialSiteUrls : [r.website].filter(Boolean),
    mapPageUrls: r.mapPageUrls.map(p => p.url),
    maps: r.maps.map(m => ({ url: m.url, type: m.type, size: m.width ? `${m.width}x${m.height}` : null, season: seasonLabel(m.season) })),
    candidates: r.candidates.slice(0, 6).map(c => ({ url: c.url, page: c.page, label: c.label?.slice(0, 50), season: seasonLabel(c.season), size: c.width ? `${c.width}x${c.height}` : undefined, type: c.type })),
  });
  const find = report.filter(r => ["no-map", "page-missing"].includes(r.status) || r.flags.some(f => ["page-error", "page-redirected-top"].includes(f.code)) || (r.status === "broken" && !r.mapPageUrls.length));
  const findIds = new Set(find.map(r => r.id));
  const review = report.filter(r => !findIds.has(r.id) && ["broken", "stale-suspect", "display-warn"].includes(r.status));
  const order = (a, b) => Number(b.active) - Number(a.active) || a.id.localeCompare(b.id);
  const batches = (kind, rows) => {
    const sorted = rows.sort(order).map(compact);
    return Array.from({ length: Math.ceil(sorted.length / size) }, (_, i) => ({ kind, batch: `${kind}-${String(i + 1).padStart(2, "0")}`, resorts: sorted.slice(i * size, (i + 1) * size) }));
  };
  return { createdAt: new Date().toISOString(), counts: { find: find.length, review: review.length }, batches: [...batches("review", review), ...batches("find", find)] };
}

function renderSummary(report, summary, codeCounts, version) {
  const label = { broken: "表示できない", "stale-suspect": "古い・差し替えの疑い", "display-warn": "表示に注意", "page-missing": "掲載元なし", "no-map": "マップ未登録", ok: "問題なし" };
  const lines = [`# ゲレンデマップ点検（${today()}、正本 v${version}、${seasonLabel(currentSeason())}シーズン）`, "", "| 状態 | 件数 |", "|---|---|"];
  for (const k of Object.keys(label)) if (summary[k]) lines.push(`| ${label[k]}（${k}） | ${summary[k]} |`);
  lines.push("", "| 指摘 | 件数 |", "|---|---|", ...Object.entries(codeCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`), "");
  for (const k of ["broken", "stale-suspect", "display-warn", "page-missing"]) {
    const rows = report.filter(r => r.status === k);
    if (!rows.length) continue;
    lines.push(`## ${label[k]}`, "", "| スキー場 | 指摘 | マップ | 掲載元 |", "|---|---|---|---|");
    for (const r of rows) {
      const f = r.flags.filter(x => SEVERITY[x.severity] >= 1).map(x => x.message).join("<br>").replaceAll("|", "／");
      lines.push(`| ${r.name}（${r.id}） | ${f} | ${r.maps.map((m, i) => `[${i + 1}](${m.url})`).join(" ")} | ${r.mapPageUrls.map((p, i) => `[${i + 1}](${p.url})`).join(" ")} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

// ---------- scan: 1ページの候補抽出（担当エージェント用） ----------

async function scan(args) {
  const urls = args._.slice(1);
  assert(urls.length, "URLを指定してください");
  const withSize = Boolean(args.size);
  await withBrowser(async browser => {
    const page = await lightPage(browser);
    for (const url of urls) {
      const s = await scanPage(page, url);
      const candidates = s.error ? [] : mapCandidates(s).slice(0, Number(args.top ?? 12));
      if (withSize)
        await mapLimit(candidates.slice(0, 6), 4, async c => {
          const p = await probeAsset(c.url);
          Object.assign(c, { type: p.type, size: p.width ? `${p.width}x${p.height}` : null, status: p.status });
        });
      const links = s.error ? [] : [...new Map((s.assets ?? []).filter(a => a.tag === "a" && /ゲレンデ|コース|マップ|map|gelande|gerende|slope|trail|course|winter|ski|スキー/i.test(`${a.url} ${a.label}`)).map(a => [a.url, a.label.replace(/\s+/g, " ").slice(0, 40)])).entries()].slice(0, 15);
      const registered = args.check ? { url: args.check, onPage: referenceOnPage(s.html ?? "", (s.assets ?? []).map(a => a.url), args.check) } : undefined;
      console.log(JSON.stringify({ url, status: s.status, finalUrl: s.finalUrl, title: s.title, error: s.error, registered, candidates: candidates.map(c => ({ url: c.url, label: c.label?.replace(/\s+/g, " ").slice(0, 50), season: seasonLabel(c.season), score: c.score, ...(c.size !== undefined ? { size: c.size, type: c.type } : {}) })), pageLinks: links.map(([u, l]) => `${l} ${u}`) }, null, 1));
    }
  });
}

// ---------- render: 本番（またはローカル）の詳細画面で実際の見え方を測る ----------

async function render(args) {
  let ids = idsArg(args) ?? args._.slice(1);
  if (args.from) {
    const rep = await readJson(args.from);
    const statuses = String(args.status ?? "broken,stale-suspect,display-warn").split(",");
    ids = rep.resorts.filter(r => r.maps.length && statuses.includes(r.status)).map(r => r.id);
  }
  assert(ids.length, "--ids か --from report.json を指定してください");
  const base = String(args.base ?? SITE_BASE).replace(/\/$/, "");
  const dir = runDir({ ...args, _: ["render"] });
  const shotsDir = path.join(dir, "screens");
  await mkdir(shotsDir, { recursive: true });
  const viewports = { pc: { width: 1440, height: 900 }, sp: { width: 375, height: 812 } };
  const results = await withBrowser(async browser =>
    mapLimit(ids, Number(args.concurrency ?? 3), async id => {
      const out = { id, views: {} };
      for (const [vp, size] of Object.entries(viewports)) {
        const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
        const page = await context.newPage();
        const v = { flags: [] };
        try {
          await page.goto(`${base}/${id}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
          if (vp === "sp") {
            const tab = page.getByRole("tab", { name: "ゲレンデマップ" }).first();
            if (await tab.count()) await tab.click({ timeout: 8_000 });
            else v.flags.push("no-trail-map-tab");
          }
          await page.waitForTimeout(args.chrome ? 5_000 : 3_000);
          Object.assign(v, await page.evaluate(async () => {
            const box = el => {
              const r = el.getBoundingClientRect();
              return [Math.round(r.width), Math.round(r.height)];
            };
            const imgs = [...document.querySelectorAll('img[alt="ゲレンデマップ"]')];
            const frames = [...document.querySelectorAll('iframe[title="ゲレンデマップ"]')];
            const first = imgs[0] ?? frames[0];
            const scroller = first?.parentElement;
            const iframeInfo = await Promise.all(frames.map(async f => {
              const r = await fetch(f.src.split("#")[0]).catch(() => null);
              let text = "";
              try {
                text = f.contentDocument?.body?.innerText?.slice(0, 120) ?? "";
              } catch {}
              return { src: decodeURIComponent(f.src.split("url=")[1]?.split("#")[0] ?? f.src), status: r?.status ?? null, type: r?.headers.get("content-type") ?? null, text, box: box(f) };
            }));
            return {
              frame: scroller ? box(scroller) : null,
              scroll: scroller ? [scroller.scrollHeight, scroller.clientHeight] : null,
              imgs: imgs.map(i => ({ src: i.currentSrc, natural: [i.naturalWidth, i.naturalHeight], box: box(i), complete: i.complete })),
              iframes: iframeInfo,
            };
          }));
          if (!v.imgs.length && !v.iframes.length) v.flags.push("no-map-element");
          for (const i of v.imgs) {
            if (i.complete && i.natural[0] === 0) v.flags.push("img-broken");
            else if (v.frame && (i.box[0] * i.box[1]) / (v.frame[0] * v.frame[1]) < 0.45) v.flags.push(`img-small(${i.box.join("x")} in ${v.frame.join("x")})`);
          }
          for (const f of v.iframes) {
            if (f.status !== 200 || /bad gateway|unsupported|not allowed|too large|unavailable/i.test(f.text)) v.flags.push(`iframe-error(${f.status} ${f.text.slice(0, 40)})`);
            else if (!/pdf/i.test(f.type ?? "")) v.flags.push("image-fell-back-to-iframe");
          }
          if (v.scroll && v.scroll[0] > v.scroll[1] + 4) v.flags.push(`stacked(${v.scroll[0]}/${v.scroll[1]}px)`);
          if (v.flags.length || args.shots) {
            v.screenshot = path.join(shotsDir, `${id}-${vp}.png`);
            await page.screenshot({ path: v.screenshot });
          }
        } catch (error) {
          v.flags.push(`page-error(${String(error.message).split("\n")[0].slice(0, 60)})`);
        }
        out.views[vp] = v;
        await context.close();
      }
      out.ok = Object.values(out.views).every(v => !v.flags.length);
      console.error(`${out.ok ? "OK " : "NG "} ${id} ${Object.entries(out.views).map(([k, v]) => `${k}:${v.flags.join(",") || "ok"}`).join(" ")}`);
      return out;
    }),
  { chrome: Boolean(args.chrome) });
  const file = path.join(dir, "render.json");
  await writeJson(file, { base, checkedAt: new Date().toISOString(), note: args.chrome ? "実際の Chrome で撮影" : "headless Chromium はPDFを描かないので、PDFは中継の応答（200・application/pdf）で判定する。見た目は --chrome で撮る", results });
  console.log(JSON.stringify({ file, total: results.length, ng: results.filter(r => !r.ok).map(r => r.id) }));
}

// ---------- sheet: 候補画像の一覧画像（親が1枚で目視する） ----------

async function sheet(args) {
  const sharp = (await import("sharp")).default;
  let items = [];
  if (args.decisions) {
    const d = await readJson(args.decisions);
    items = d.decisions.flatMap(x => (x.mapUrls ?? []).map(m => ({ label: x.id, url: m.url })));
  }
  for (const u of args._.slice(1)) items.push({ label: "", url: u });
  assert(items.length, "--decisions か URL を指定してください");
  const W = 420, H = 300, LABEL = 34, COLS = Math.min(Number(args.cols ?? 3), items.length);
  const tiles = await mapLimit(items, 4, async item => {
    const p = await probeAsset(item.url, { keepBody: true });
    let img = null;
    try {
      const src = p.type === "application/pdf" ? await pdfFirstPage(p.body) : p.body;
      if (src) img = await sharp(src, { limitInputPixels: false }).resize(W, H, { fit: "contain", background: "#f1f5f9" }).png().toBuffer();
    } catch {}
    const text = `${item.label} ${short(item.url)} ${p.width ? `${p.width}x${p.height}${p.type === "application/pdf" ? "pt" : "px"}` : p.error ?? p.status} ${p.type ?? ""}`.replace(/[<&>]/g, "");
    const label = Buffer.from(`<svg width="${W}" height="${LABEL}"><rect width="100%" height="100%" fill="#0f172a"/><text x="6" y="22" font-size="14" fill="#fff" font-family="sans-serif">${text.slice(0, 60)}</text></svg>`);
    return { img, label };
  });
  const rows = Math.ceil(tiles.length / COLS);
  const composites = tiles.flatMap((t, i) => {
    const x = (i % COLS) * W, y = Math.floor(i / COLS) * (H + LABEL);
    return [{ input: t.label, left: x, top: y }, ...(t.img ? [{ input: t.img, left: x, top: y + LABEL }] : [])];
  });
  const out = args.out ?? path.join(runDir({ ...args, _: ["sheet"] }), `sheet-${Date.now()}.jpg`);
  await mkdir(path.dirname(out), { recursive: true });
  await sharp({ create: { width: W * COLS, height: rows * (H + LABEL), channels: 3, background: "#e2e8f0" } }).composite(composites).jpeg({ quality: 70 }).toFile(out);
  console.log(JSON.stringify({ out, tiles: tiles.length }));
}

// ---------- apply: 決定を正本へ反映（既定は確認だけ） ----------

const LINK_FIELDS = ["mapUrls", "mapPageUrls"];

async function apply(args) {
  assert(args.decisions, "--decisions <file> を指定してください");
  const input = await readJson(args.decisions);
  const write = Boolean(args.apply);
  const { document, links, resorts } = await readCanonical();
  const byId = new Map(resorts.map(r => [r.id, r]));
  const after = structuredClone(links);
  const template = Object.keys(Object.values(links)[0] ?? {});
  const applied = [];
  const skipped = [];
  const toCheck = [];
  const touched = new Set();

  for (const d of input.decisions) {
    if (["no-change", "not-found", "needs-human"].includes(d.action)) continue;
    if (d.mapUrls && d.mapUrls.length !== 1) {
      skipped.push({ id: d.id, reason: `mapUrls は1枚にする（${d.mapUrls.length}枚）。1枚に決められないなら needs-human で人に聞く` });
      continue;
    }
    const resort = byId.get(d.id);
    if (!resort || resort.mergedIntoId) {
      skipped.push({ id: d.id, reason: "統合済み・存在しない施設" });
      continue;
    }
    const owners = [...new Set([d.id, ...(resort.sourceResortIds ?? [])])];
    for (const o of owners.slice(1)) assert.equal(byId.get(o)?.mergedIntoId ?? d.id, d.id, `${o} は ${d.id} の統合元ではない`);
    const current = f => owners.flatMap(o => (links[o]?.[f] ?? []).map(l => l.url));
    const conflict = LINK_FIELDS.find(f => d.expect?.[f] && JSON.stringify([...d.expect[f]].sort()) !== JSON.stringify(current(f).sort()));
    if (conflict) {
      skipped.push({ id: d.id, reason: `${conflict} が調査時と違う（現在: ${current(conflict).join(", ") || "なし"}）` });
      continue;
    }
    const change = {};
    for (const f of LINK_FIELDS) {
      if (!d[f]) continue;
      const next = d[f].map(l => ({ url: String(l.url).trim(), ...(l.description ? { description: l.description } : {}) }));
      for (const l of next) assert(/^https?:\/\//.test(l.url), `${d.id}: URLが不正 ${l.url}`);
      assert.equal(new Set(next.map(l => l.url)).size, next.length, `${d.id}: ${f} に重複`);
      if (JSON.stringify(next.map(l => l.url)) === JSON.stringify(current(f))) continue;
      change[f] = { before: current(f), after: next.map(l => l.url) };
      after[d.id] ??= Object.fromEntries(template.map(k => [k, []]));
      after[d.id][f] = next;
      for (const o of owners.slice(1)) if (after[o]?.[f]?.length) after[o][f] = [];
    }
    if (!Object.keys(change).length) continue;
    for (const o of owners) touched.add(o);
    applied.push({ id: d.id, name: resort.nameJa, action: d.action, reason: d.reason, evidence: d.evidence, change });
    toCheck.push({ id: d.id, maps: (d.mapUrls ?? []).map(l => l.url), pages: (d.mapPageUrls ?? owners.flatMap(o => links[o]?.mapPageUrls ?? [])).map(l => l.url ?? l), allowUnreferenced: d.allowUnreferenced });
  }

  // 機械監査: 新しいマップは取得でき、画像かPDFで、掲載元ページに載っていること
  const problems = [];
  const probes = await mapLimit(toCheck.flatMap(t => t.maps), 6, u => probeAsset(u));
  const probeOf = new Map(probes.map(p => [p.url, p]));
  await withBrowser(async browser => {
    const page = await lightPage(browser);
    for (const t of toCheck) {
      for (const u of t.maps) {
        const p = probeOf.get(u);
        if (!p?.status || p.status >= 400 || !isMapType(p.type)) problems.push(`${t.id}: マップを取得できないか画像・PDFでない ${u}（${p?.error ?? p?.status} ${p?.type ?? ""}）`);
        else if (!isMapType(p.headerType)) problems.push(`${t.id}: Content-Type が ${p.headerType}（中継が受け付けない） ${u}`);
      }
      if (!t.maps.length) continue;
      if (!t.pages.length) {
        problems.push(`${t.id}: 掲載元ページ（mapPageUrls）がない`);
        continue;
      }
      const scans = [];
      for (const pu of t.pages) scans.push(await scanPage(page, pu));
      const html = scans.map(s => s.html ?? "").join("\n");
      const assets = scans.flatMap(s => (s.assets ?? []).map(a => a.url));
      for (const s of scans) if (s.error || (s.status ?? 0) >= 400) problems.push(`${t.id}: 掲載元を開けない ${s.url}（${s.error ?? s.status}）`);
      for (const u of t.maps) {
        const ref = referenceOnPage(html, assets, u);
        if (ref === "no" && !t.allowUnreferenced) problems.push(`${t.id}: 掲載元にこのマップが見当たらない ${u}（ページ外の直リンクなら allowUnreferenced と理由を書く）`);
      }
    }
  });

  // 対象外の施設・対象施設の他の項目が変わっていないこと
  for (const id of new Set([...Object.keys(links), ...Object.keys(after)]))
    for (const f of new Set([...Object.keys(links[id] ?? {}), ...Object.keys(after[id] ?? {})]))
      if (!(touched.has(id) && LINK_FIELDS.includes(f))) assert.deepEqual(after[id]?.[f], links[id]?.[f], `${id}.${f} が意図せず変わった`);

  const preview = { canonicalVersion: document.version, write, applied, skipped, problems };
  console.log(JSON.stringify(preview, null, 1));
  if (!write) return;
  assert(!problems.length, "機械監査で問題があるので反映しない（決定を直して再実行）");
  if (!applied.length) return;

  const content = `${JSON.stringify(Object.fromEntries(Object.entries(after).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(PATHS.runs, "backups", stamp);
  await mkdir(backup, { recursive: true });
  await writeFile(path.join(backup, "before.json"), document.content);
  await writeFile(path.join(backup, "after.json"), content);
  await api("data-documents", { method: "PUT", body: JSON.stringify({ documents: [{ key: LINKS_KEY, content, mediaType: document.mediaType, expectedHash: document.hash }] }) });
  const saved = await readCanonical();
  assert.equal(saved.document.content, content, "読み戻しが一致しない");
  const record = path.join(PATHS.records, `${today()}-trail-maps`, "applied.json");
  const prev = await readJson(record, { applied: [] });
  prev.applied.push({ appliedAt: new Date().toISOString(), fromVersion: document.version, toVersion: saved.document.version, sha256: createHash("sha256").update(content).digest("hex"), backup, items: applied });
  await writeJson(record, prev);
  console.log(JSON.stringify({ verified: true, version: saved.document.version, record, backup, next: `check --ids ${applied.map(a => a.id).join(",")} と render --ids で確かめる` }));
}

const COMMANDS = { check, scan, render, sheet, apply };

if (await isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const cmd = COMMANDS[args._[0]];
  if (!cmd) {
    console.error(`commands: ${Object.keys(COMMANDS).join(" | ")}（詳しくは SKILL.md）`);
    process.exit(2);
  }
  cmd(args).catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
