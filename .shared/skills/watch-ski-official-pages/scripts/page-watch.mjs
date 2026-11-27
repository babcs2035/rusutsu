#!/usr/bin/env node
// 公式サイトの変化を、前回の指紋と比べて見つける。
//   1. 料金ページ（リフト券・レンタルの登録済みURL）の料金の行が変わった・ファイルが差し替わった・新しいシーズンの表記が出た
//   2. 公式サイトのトップと料金ページに、まだどこにも登録していない料金・レンタル・営業情報・マップのページへのリンクが増えた
// 本番へは読むだけ。リポジトリのルートで実行する。
//
//   node .claude/skills/watch-ski-official-pages/scripts/page-watch.mjs check \
//     --run <作業ディレクトリ> [--ids a,b] [--limit N] [--only tickets|pages] [--accept a,b|all] [--no-state] [--all]
//
// 出力: <run>/result.json、<run>/summary.md、<run>/tasks.json（変化のあったスキー場）、
//       <run>/leads.json（未登録のページの手がかり。シーズン前の再調査で使う）
// 前回の指紋: src/private/data/maintenance/page-watch/<resortId>.json（Git管理）
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  PATHS,
  batches,
  hostOf,
  httpProbe,
  lightContext,
  listArg,
  loadKnown,
  loadLinksDocument,
  loadResortLinkRows,
  loadResorts,
  mapLimit,
  markKnown,
  readJson,
  renderPage,
  runCli,
  runDir,
  sha,
  siteOf,
  urlKey,
  withBrowser,
  writeJson,
  writeResult,
} from "../../maintain-ski-data-weekly/scripts/lib.mjs";

const STATE_DIR = path.join(PATHS.data, "page-watch");
const TICKET_SKILL = "collect-ski-lift-ticket-pricing";
const CRAWLER_SKILL = "build-ski-resort-latest-crawler";
const MAP_SKILL = "maintain-ski-trail-maps";
const MAX_PRICE_LINES = 300;
/**
 * 料金データの出典に入っているが、料金ページとしては見張らないサイト。
 * 天気サイトは毎日変わり、雪マジ（じゃらん）は maintain-ski-yukimaji が見て、Webアーカイブは変わらない
 */
const NOT_WATCHED = /(?:^|\.)(?:tenki\.jp|weathernews\.jp|snow-forecast\.com|jalan\.net|majibu\.jp|archive\.org)$/u;

// ---------- シーズン ----------

/** 7月以降は その年に始まるシーズン（2026-11 → 2026 = 2026-27） */
const currentSeason = () => {
  const d = new Date();
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
};
const seasonLabel = y => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
/** ISO日時 → 日本時間の日付 */
const jstDate = iso => new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 10);

/** 本文にはっきり書かれたシーズンの表記（2026-27、2026/2027、26-27シーズン）から、始まりの年を拾う */
export function seasonsIn(text) {
  const found = new Set();
  for (const m of text.matchAll(/(20\d\d)\s*[-‐–—~〜／/]\s*(?:20)?(\d\d)(?!\d)/gu)) {
    const y = Number(m[1]);
    if (Number(m[2]) === (y + 1) % 100) found.add(y);
  }
  for (const m of text.matchAll(/(?<!\d)(\d\d)\s*[-‐–—~〜／/]\s*(\d\d)\s*(?:シーズン|season)/giu)) {
    const y = 2000 + Number(m[1]);
    if (Number(m[2]) === (y + 1) % 100) found.add(y);
  }
  return [...found].sort();
}

// ---------- 料金ページの指紋 ----------

const PRICE = /\d[\d,]*\s*円|¥\s*\d/u;
const normalizeLine = line => line.normalize("NFKC").replace(/\s+/gu, " ").trim();

export function fingerprint(text) {
  const lines = text.split("\n").map(normalizeLine).filter(Boolean);
  const priceLines = [...new Set(lines.filter(l => PRICE.test(l)).map(l => l.slice(0, 160)))].slice(0, MAX_PRICE_LINES);
  // 料金以外の文面（お知らせ・日付・天気の埋め込み）は1時間でも変わるので、指紋に入れない
  return { priceHash: sha(priceLines.join("\n")), priceLines, seasons: seasonsIn(lines.join("\n")) };
}

// ---------- 登録済みのURL ----------

function readTicketData(id) {
  const out = { urls: new Map(), season: null, capturedAt: null, hasRental: false };
  const sourceFile = path.join(PATHS.liftTicketSource, `${id}.json`);
  const watched = url => url && !NOT_WATCHED.test(hostOf(url));
  if (existsSync(sourceFile)) for (const u of JSON.parse(readFileSync(sourceFile, "utf8")).urls ?? []) if (watched(u.url)) out.urls.set(u.url, u.label_ja ?? "");
  const dir = path.join(PATHS.liftTicket, id);
  if (existsSync(dir)) {
    const latest = readdirSync(dir).filter(f => /^\d{4}-\d{4}\.json$/u.test(f)).sort().at(-1);
    if (latest) {
      const json = JSON.parse(readFileSync(path.join(dir, latest), "utf8"));
      out.season = Number(latest.slice(0, 4));
      out.hasRental = (json.rentals ?? []).length > 0;
      for (const s of json.sources ?? []) {
        if (watched(s.url) && s.capture_success !== false && !out.urls.has(s.url)) out.urls.set(s.url, s.page_title ?? "");
        if (s.captured_at && (!out.capturedAt || s.captured_at > out.capturedAt)) out.capturedAt = s.captured_at;
      }
    }
  }
  return out;
}

/** クローラーのコード（と、そこから読む共通コード）に書かれているURL */
function crawlerUrls(id) {
  const file = path.join(PATHS.crawlers, `${id}.ts`);
  if (!existsSync(file)) return null;
  const urls = new Set();
  const seen = new Set();
  const read = (f, depth) => {
    if (seen.has(f) || !existsSync(f)) return;
    seen.add(f);
    const code = readFileSync(f, "utf8");
    for (const m of code.matchAll(/https?:\/\/[^\s"'`<>)\\]+/gu)) urls.add(m[0]);
    if (depth > 0) for (const m of code.matchAll(/from\s+"(\.\.?\/[^"]+)"/gu)) if (!/utils|diagnostics|navigation|latest-result-store/u.test(m[1])) read(path.resolve(path.dirname(f), `${m[1]}.ts`), depth - 1);
  };
  read(file, 1);
  return [...urls];
}

// ---------- 未登録のページ探し ----------

const CATEGORY = [
  ["skip", /スクール|school|レッスン|lesson|駐車|parking|宿泊|ホテル|hotel|stay|採用|recruit|求人|シーズン券|season.?pass|ふるさと納税|グリーンシーズン|green|summer|夏|キャンプ|camp|ゴルフ|golf|特定商取引|利用規約|利用条件|注意事項|プライバシー|個人情報|よくある|terms|regulations|privacy|policy|faq|ログイン|login|マイページ|mypage|\/member\/|購入済み|カート|cart/iu],
  ["rental", /レンタル|rental/iu],
  ["map", /ゲレンデマップ|コースマップ|トレイルマップ|コース紹介|コースガイド|コース案内|trail.?map|course.?map|gelande.?map|slope.?map/iu],
  ["status", /営業状況|運行状況|運行情報|ゲレンデ情報|ゲレンデ状況|ゲレンデコンディション|オープン状況|積雪情報|本日のゲレンデ|今日のゲレンデ|リフト.{0,4}(?:運行|状況)|コース.{0,4}(?:状況|オープン)|snow.?report|lift.?status|snow.?conditions?|\/conditions?\/?$/iu],
  ["ticket", /リフト券|リフト料金|料金|チケット|前売|早割|ticket|price|ryokin|web券|eチケ/iu],
];
const CATEGORY_LABEL = { ticket: "料金", rental: "レンタル", status: "営業情報", map: "マップ" };
/** お知らせの記事など、毎週増えるページ（案内のメニューではないもの） */
/** 日本語のページと同じ内容の外国語版 */
const OTHER_LANGUAGE = /^\/(?:en|eng|english|zh|zh-?(?:tw|cn|hk|hant|hans)|tw|cn|hk|ko|kr|th|id|vi|ms|fr|de|es|global|foreign)(?:\/|$)|[?&](?:lang|locale|language|stt_lang|hl)=(?!ja)/iu;
const LANGUAGE_NAME = /^(?:english|en|简体中文|繁體中文|繁体中文|简体字|繁體字|繁体字|中文|中国語.*|한국어|韓国語|ไทย|タイ語|chinese|korean|thai|indonesian|tiếng việt|language|日本語|japanese)$/iu;
const ARTICLE = /\/(?:news|info|information|topics|blog|archives?|event|events|press|category|tag|page)\/|[?&](?:p|id|page|paged|cat)=\d|\/20\d\d[/-]?\d\d|\/\d{3,}(?:\/|\.html?)?$/iu;

function categorize(link) {
  const text = link.text.replace(/Toggle submenu/giu, "").trim();
  if (text.length > 24 || text.length < 2 || LANGUAGE_NAME.test(text)) return null;
  let decoded = link.url;
  let host = "";
  try {
    const u = new URL(link.url);
    host = u.hostname;
    decoded = decodeURIComponent(u.pathname);
    if (OTHER_LANGUAGE.test(`${u.pathname}${u.search}`) || /^(?:en|english)\./iu.test(u.hostname)) return null;
  } catch {}
  if (ARTICLE.test(link.url)) return null;
  // ホスト名は「拾わない」の判定にだけ使う（rental.example.com のリンクを全部レンタル扱いにしないため）
  if (CATEGORY[0][1].test(`${text} ${host}${decoded}`)) return null;
  const haystack = `${text} ${decoded}`;
  for (const [cat, pattern] of CATEGORY.slice(1)) if (pattern.test(haystack)) return cat;
  return null;
}

// ---------- 点検 ----------

async function checkResort(context, target, state, opts) {
  const now = new Date().toISOString();
  const flags = [];
  const changes = [];
  const collected = [];
  const tickets = state.tickets ?? {};
  const accept = opts.accept.has(target.id) || opts.accept.has("all");

  if (opts.tickets) {
    for (const [url, label] of target.ticket.urls) {
      const probe = await httpProbe(url, { binary: true });
      const prev = tickets[url];
      let current;
      if (probe.sha256) {
        current = { type: probe.type, fileHash: probe.sha256, bytes: probe.bytes };
      } else {
        // 素の取得で失敗しても、販売サイトはクッキーが要るだけのことがあるので、ブラウザで開けるかで決める
        const page = /ENOTFOUND/u.test(probe.error ?? "") ? { error: probe.error, status: 0 } : await renderPage(context, url, { links: opts.pages });
        if (page.error || page.status >= 400) {
          const gone = [404, 410].includes(page.status) || /ENOTFOUND|ERR_NAME_NOT_RESOLVED/u.test(page.error ?? "");
          const blocked = [401, 403, 429].includes(page.status);
          flags.push({ severity: gone ? "high" : "low", code: gone ? "ticket-page-gone" : blocked ? "ticket-page-blocked" : "ticket-page-error", message: `料金ページを開けない（${page.error ?? `HTTP ${page.status}`}）${label ? ` ${label.slice(0, 40)}` : ""}`, url });
          continue;
        }
        current = { type: "text/html", ...fingerprint(page.text) };
        // 初めて開けた料金ページにあるリンクは「増えた」のではないので、基準として覚えるだけにする
        for (const link of page.links ?? []) if (urlKey(link.url) !== urlKey(url)) collected.push({ ...link, foundOn: url, baseline: !prev });
      }
      // 料金データが無いスキー場で、今季の表記が料金ページにある（発表待ちだったものが出た）
      const newest = current.seasons?.at(-1);
      if (newest !== undefined && target.ticket.season === null && newest >= currentSeason())
        flags.push({ severity: "high", code: "season-published", message: `料金データが未作成で、料金ページに ${seasonLabel(newest)} の表記がある（今季料金が発表された可能性）`, url });

      const next = { ...current, acceptedAt: now };
      if (!prev || accept) {
        tickets[url] = next;
        continue;
      }
      const sameSeasons = (current.seasons ?? []).join() === (prev.seasons ?? []).join();
      if (!prev.pendingSince && (current.fileHash ? current.fileHash === prev.fileHash : current.priceHash === prev.priceHash && sameSeasons)) continue;
      // データを集め直した後なら、今の内容を新しい基準にする
      const recollected = prev.pendingSince && target.ticket.capturedAt && target.ticket.capturedAt > prev.pendingSince;
      let change = null;
      // データより新しいシーズンの表記が、前回は無かったのに出た。「来季から年齢区分が変わります」のような
      // 前からある予告は基準に入っているので、指摘にならない
      const seasonAdded = newest !== undefined && target.ticket.season !== null && newest > target.ticket.season && !(prev.seasons ?? []).includes(newest);
      if (current.fileHash || prev.fileHash) {
        if (current.fileHash !== prev.fileHash) change = { code: "file-changed", message: `料金の資料（${current.type}）が差し替わった` };
      } else if (current.priceHash !== prev.priceHash || seasonAdded) {
        const before = new Set(prev.priceLines ?? []);
        const after = new Set(current.priceLines);
        const added = current.priceLines.filter(l => !before.has(l));
        const removed = (prev.priceLines ?? []).filter(l => !after.has(l));
        const lines = `増えた${added.length}行・消えた${removed.length}行${added[0] ? ` 例: ${added[0].slice(0, 60)}` : removed[0] ? ` 消えた例: ${removed[0].slice(0, 60)}` : ""}`;
        change = seasonAdded
          ? { code: "newer-season", severity: "high", message: `料金ページに ${seasonLabel(newest)} の表記が新しく出た（手元のデータは ${seasonLabel(target.ticket.season)}。料金の行は${lines}）` }
          : { code: "price-changed", message: `料金の行が変わった（${lines}）` };
        Object.assign(change, { added: added.slice(0, 40), removed: removed.slice(0, 40) });
      }
      if (!change || recollected) {
        tickets[url] = next;
        continue;
      }
      // 料金の変化は、集め直す（または --accept する）まで前回の基準を保ち、毎回出す
      prev.pendingSince ??= now;
      flags.push({ severity: change.severity ?? "medium", code: change.code, message: `${change.message}（${jstDate(prev.pendingSince)}に検知）`, url });
      changes.push({ url, label, code: change.code, added: change.added, removed: change.removed, since: prev.pendingSince });
    }
    for (const url of Object.keys(tickets)) if (!target.ticket.urls.has(url)) delete tickets[url];
    state.tickets = tickets;
  }

  const newPages = [];
  const leads = [];
  if (opts.pages && target.top) {
    const top = await renderPage(context, target.top, { links: true });
    if (top.error || top.status >= 400) {
      flags.push({ severity: "low", code: "top-page-error", message: `公式サイトのトップを開けない（${top.error ?? `HTTP ${top.status}`}）`, url: target.top });
    } else {
      for (const link of top.links ?? []) collected.push({ ...link, foundOn: target.top });
      // 同じサイトとみなすのは、公式サイトと、料金ページとして登録済みのサイト（公式の販売ページなど）だけ
      const sites = new Set([target.top, top.finalUrl, ...target.ticket.urls.keys()].map(siteOf).filter(Boolean));
      const firstRun = !state.pagesBaselineAt;
      const pages = state.pages ?? {};
      const seen = new Set();
      for (const link of collected) {
        const key = urlKey(link.url);
        if (seen.has(key) || key === urlKey(target.top) || !hostOf(link.url)) continue;
        const cat = categorize(link);
        if (!cat) continue;
        const sameSite = sites.has(siteOf(link.url));
        if (!sameSite && !(["ticket", "rental"].includes(cat) && /リフト券|チケット|レンタル|購入/u.test(link.text))) continue;
        seen.add(key);
        const known = target.known.has(key);
        const entry = pages[key];
        if (known) {
          if (entry) delete entry.pending;
          else pages[key] = { url: link.url, cat, text: link.text, firstSeenAt: now };
          continue;
        }
        leads.push({ cat, url: link.url, text: link.text, foundOn: link.foundOn });
        if (!entry) pages[key] = { url: link.url, cat, text: link.text, firstSeenAt: now, ...(firstRun || link.baseline ? {} : { pending: true }) };
        if (accept) delete pages[key].pending;
        if (pages[key].pending) newPages.push({ cat, url: link.url, text: link.text, foundOn: link.foundOn, since: pages[key].firstSeenAt });
      }
      // 指摘中（未確認）のまま今回は見当たらないリンクは捨てる。また現れたら、増えたものとして改めて出る
      for (const [key, entry] of Object.entries(pages)) if (entry.pending && !seen.has(key)) delete pages[key];
      state.pages = pages;
      state.pagesBaselineAt ??= now;
      for (const page of newPages)
        flags.push({ severity: page.cat === "map" ? "low" : "medium", code: `new-page-${page.cat}`, message: `未登録の${CATEGORY_LABEL[page.cat]}のページへのリンクが増えた「${page.text}」（${jstDate(page.since)}に検知）`, url: page.url });
    }
  }
  return { flags, changes, newPages, leads };
}

/**
 * 点検の対象（スキー場ごとの、登録済みの料金ページ・公式サイトのトップ・どこかに登録済みのURL）。
 * 営業中のスキー場と、料金のURLやデータがあるスキー場が対象
 */
export async function loadTargets({ all = false } = {}) {
  const [{ resorts, canonicalId }, { links }, rows] = await Promise.all([loadResorts(), loadLinksDocument(), loadResortLinkRows()]);
  const resortOf = new Map(resorts.map(r => [r.id, r]));
  const ticketIds = new Set([
    ...readdirSync(PATHS.liftTicketSource).filter(f => f.endsWith(".json")).map(f => f.replace(/\.json$/u, "")),
    ...readdirSync(PATHS.liftTicket, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name),
  ]);
  const officialByResort = Map.groupBy(rows.filter(r => r.source === "official"), r => canonicalId(r.resortId));
  return [...new Set([...resorts.filter(r => r.active || all).map(r => r.id), ...ticketIds])].sort().map(id => {
    const resort = resortOf.get(id);
    const ticket = readTicketData(id);
    const legacy = (resort?.ids ?? [id]).map(owner => links[owner] ?? {});
    const field = k => legacy.flatMap(l => (l[k] ?? []).map(i => i.url)).filter(Boolean);
    const top = field("officialSiteUrls")[0] ?? resort?.website ?? null;
    const crawler = crawlerUrls(id);
    const official = (officialByResort.get(id) ?? []).map(r => ({ type: r.type, url: r.url }));
    const known = new Set([...ticket.urls.keys(), ...(crawler ?? []), ...field("officialSiteUrls"), ...field("mapPageUrls"), ...field("mapUrls"), ...field("newsUrls"), ...official.map(r => r.url)].map(urlKey));
    return { id, name: resort?.name ?? id, prefecture: resort?.prefecture ?? null, active: resort?.active ?? null, top, ticket, hasCrawler: crawler !== null, crawlerUrls: crawler ?? [], newsUrls: field("newsUrls"), mapPageUrls: field("mapPageUrls"), mapUrls: field("mapUrls"), official, known };
  });
}

async function check(args) {
  const dir = runDir(args, "pages");
  const only = listArg(args.ids);
  const part = args.only && args.only !== true ? String(args.only) : null;
  const opts = { tickets: part !== "pages", pages: part !== "tickets", accept: new Set(listArg(args.accept) ?? []) };

  let targets = await loadTargets({ all: Boolean(args.all) });
  if (only) targets = targets.filter(t => only.includes(t.id));
  if (args.limit) targets = targets.slice(0, Number(args.limit));
  const urlCount = targets.reduce((n, t) => n + t.ticket.urls.size, 0);
  console.error(`スキー場 ${targets.length}件・料金ページ ${urlCount}件を確かめる → ${dir}`);

  const findings = [];
  const tasks = [];
  const leads = {};
  let done = 0;
  await withBrowser(async browser => {
    const context = await lightContext(browser);
    await mapLimit(targets, Number(args.concurrency ?? 8), async target => {
      const file = path.join(STATE_DIR, `${target.id}.json`);
      const state = await readJson(file, {});
      const before = JSON.stringify(state);
      let result;
      try {
        result = await checkResort(context, target, state, opts);
      } catch (error) {
        findings.push({ id: target.id, name: target.name, severity: "low", code: "check-failed", message: `点検中に失敗（${error.message.split("\n")[0].slice(0, 100)}）` });
        return;
      }
      if (!args["no-state"] && JSON.stringify(state) !== before) await writeJson(file, state);
      for (const f of result.flags) findings.push({ id: target.id, name: target.name, ...f });
      if (result.leads.length) leads[target.id] = { name: target.name, hasCrawler: target.hasCrawler, ticketSeason: target.ticket.season, hasRental: target.ticket.hasRental, leads: result.leads };
      if (result.flags.some(f => f.severity !== "low")) {
        tasks.push({
          id: target.id,
          name: target.name,
          ticketSeason: target.ticket.season ? seasonLabel(target.ticket.season) : null,
          hasRental: target.ticket.hasRental,
          hasCrawler: target.hasCrawler,
          flags: result.flags.filter(f => f.severity !== "low").map(f => `${f.code}: ${f.message} ${f.url ?? ""}`),
          changes: result.changes,
          newPages: result.newPages,
        });
      }
      if (++done % 50 === 0) console.error(`  ${done}/${targets.length}`);
    });
    await context.close();
  });

  markKnown(findings, await loadKnown("pages"));
  const open = findings.filter(f => !f.known && f.severity !== "low");
  const idsOf = test => [...new Set(open.filter(f => test(f.code)).map(f => f.id))].sort();
  const handoff = [
    { skill: TICKET_SKILL, what: "料金・レンタルを公式ページから確かめ直し、変わっていれば更新する（tasks.json に変わった行）", ids: idsOf(c => ["price-changed", "file-changed", "newer-season", "season-published", "ticket-page-gone", "new-page-ticket", "new-page-rental"].includes(c)) },
    { skill: CRAWLER_SKILL, what: "増えた営業情報のページを確かめ、クローラーの取得先を見直す", ids: idsOf(c => c === "new-page-status") },
    { skill: MAP_SKILL, what: "増えたマップのページを確かめる", ids: [...new Set(findings.filter(f => !f.known && f.code === "new-page-map").map(f => f.id))].sort() },
  ].filter(h => h.ids.length);
  tasks.sort((a, b) => a.id.localeCompare(b.id));
  await writeJson(path.join(dir, "tasks.json"), { createdAt: new Date().toISOString(), batches: batches(tasks, 5).map((rs, i) => ({ batch: `pages-${String(i + 1).padStart(2, "0")}`, resorts: rs })) });
  await writeJson(path.join(dir, "leads.json"), leads);
  const leadCount = Object.values(leads).reduce((n, l) => n + l.leads.length, 0);
  await writeResult(dir, {
    area: "pages",
    title: "料金ページの変化と、未登録のページの点検",
    checked: targets.length,
    findings,
    notes: [
      `料金ページ ${urlCount}件の指紋を前回と比べた（初めて見るページは基準として記録するだけ）。`,
      `未登録の料金・レンタル・営業情報・マップのページの手がかり: ${leadCount}件（leads.json。新しく増えたものだけを指摘に出す）`,
    ],
    handoff,
  });
}

runCli(import.meta.url, { check });
