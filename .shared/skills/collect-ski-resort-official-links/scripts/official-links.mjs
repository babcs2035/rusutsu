// 公式リンク収集の道具。リポジトリのルートで実行する。
//   prepare --ids a,b --run <dir>   調査の材料（公式サイト・他で管理中のURL・前回の結果）を <dir>/brief/<id>.json に書く
//   audit   --ids a,b --run <dir> [--write]
//       収集ファイルの各リンクを実際に開き、開けるか・公式ページに載っているか・飛び先を確かめる。
//       --write で、決めた飛び先（jumpUrl）を収集ファイルへ書き戻す。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

if (!existsSync("package.json") || !existsSync("src/private")) {
  throw new Error("リポジトリのルート（rusutsu）で実行してください");
}
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const FILES_DIR = "src/private/data/resort-links";
const LINK_TYPES = JSON.parse(
  readFileSync("src/features/resort-links/linkTypes.json", "utf8"),
).groups.flatMap(group =>
  group.types.map(type => ({ ...type, group: group.label })),
);
const SKILL_TYPES = LINK_TYPES.filter(t => t.owners.includes("officialSkill"));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) out._.push(a);
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = true;
  }
  return out;
}

const readJson = async (file, fallback = null) =>
  existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : fallback;

async function api(pathAndQuery) {
  const base = process.env.DATA_API_BASE_URL?.trim().replace(/\/+$/, "");
  const token = process.env.INTERNAL_DATA_API_ADMIN_TOKEN?.trim();
  if (!base || !token)
    throw new Error(".env.local に DATA_API_BASE_URL と INTERNAL_DATA_API_ADMIN_TOKEN が必要です");
  const res = await fetch(`${base}/api/internal/v1/${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`データAPI ${pathAndQuery}: HTTP ${res.status}`);
  return res.json();
}

const urlsIn = text => [...new Set(text.match(/https?:\/\/[^\s"'`<>)\\]+/g) ?? [])];

// ---------------------------------------------------------------- prepare
async function prepare(ids, run) {
  const { resorts } = await api(`ski-resorts?view=names&ids=${ids.join(",")}`);
  const linksDoc = JSON.parse(
    (await api("data-documents?key=SkiResortLinks.json")).document.content,
  );
  await mkdir(path.join(run, "brief"), { recursive: true });
  for (const id of ids) {
    const resort = resorts.find(r => r.id === id);
    if (!resort) {
      console.log(`${id}: 本番にこのスキー場IDがありません`);
      continue;
    }
    const legacy = linksDoc[id] ?? {};
    const crawlerFile = `src/private/scripts/crawl_latest/resorts/${id}.ts`;
    const ticketDir = `src/private/data/lift-ticket/${id}`;
    const ticketFile = existsSync(ticketDir)
      ? readdirSync(ticketDir).filter(f => /^\d{4}-\d{4}\.json$/.test(f)).sort().at(-1)
      : null;
    const ticket = ticketFile ? await readJson(path.join(ticketDir, ticketFile)) : null;
    const brief = {
      resortId: id,
      nameJa: resort.nameJa,
      officialSites: (legacy.officialSiteUrls ?? []).map(l => l.url),
      // このスキルで集める種類。全部について found / none / unchecked のどれかを書く
      typesToCollect: SKILL_TYPES.map(t => ({ type: t.type, group: t.group, label: t.label })),
      // 別の場所で管理しているURL。集め直さない。公式サイトの入口を探す手がかりに使う
      ownedElsewhere: {
        legacyLinks: Object.fromEntries(
          Object.entries(legacy).filter(([, v]) => Array.isArray(v) && v.length > 0),
        ),
        statusCrawlerUrls: existsSync(crawlerFile)
          ? urlsIn(readFileSync(crawlerFile, "utf8")).filter(u => !/web\.archive\.org/.test(u))
          : [],
        liftTicketUrls: ticket
          ? [...(ticket.sources ?? []), ...(ticket.channels ?? [])].map(s => s.url).filter(Boolean)
          : [],
      },
      previous: await readJson(path.join(FILES_DIR, `${id}.json`)),
      output: path.join(FILES_DIR, `${id}.json`),
    };
    await writeFile(path.join(run, "brief", `${id}.json`), `${JSON.stringify(brief, null, 2)}\n`);
    console.log(
      `${id}: ${brief.nameJa} 公式 ${brief.officialSites.join(" ") || "（未登録）"}${brief.previous ? " ／前回の結果あり" : ""}`,
    );
  }
}

// ---------------------------------------------------------------- audit
/** 同時に開くページ数（1サイトへ一度に集中しすぎない程度） */
const PAGE_CONCURRENCY = 3;
async function eachLimit(list, limit, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (next < list.length) await fn(list[next++]);
    }),
  );
}
const FOLD = 0.85; // 画面の高さの85%より上なら、開いた時点で見えているとみなす
const NO_JUMP_HOST =
  /(youtube\.com|youtu\.be|instagram\.com|facebook\.com|twitter\.com|x\.com|line\.me|lin\.ee|tiktok\.com|threads\.(net|com)|goo\.gl|google\.[a-z.]+)$/;
const baseOf = url => url.split("#")[0];
const pageKey = url => {
  const u = new URL(url);
  return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`;
};
/** 公式サイトと同じサイトか（サブドメイン違いは同じとみなす） */
const sameSite = (host, officialHosts) => {
  const h = host.replace(/^www\./, "");
  return officialHosts.some(o => h === o || h.endsWith(`.${o}`) || o.endsWith(`.${h}`));
};

/** ページの中で、手がかり（セレクタ・id・文字）の位置と、飛び先に使える id / 文字を調べる */
function measureInPage({ selector, quote, hash }) {
  const norm = s => (s || "").replace(/\s+/g, "");
  const CHROME =
    "header, nav, footer, aside, [role=navigation], [role=banner], [role=contentinfo], [class*=menu], [class*=Menu], [id*=menu], [class*=chat], [id*=chat]";
  const inChrome = n => !!n.closest(CHROME);
  const isFixed = n => {
    for (; n && n !== document.body; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === "fixed" || p === "sticky") return true;
    }
    return false;
  };
  const shown = n => {
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== "hidden";
  };
  const unique = id => document.querySelectorAll(`[id="${CSS.escape(id)}"]`).length === 1;
  const findText = q => {
    q = norm(q);
    if (!q) return null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let best = null;
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(n.tagName) || inChrome(n)) continue;
      if (norm(n.textContent).includes(q) && (!best || best.contains(n))) best = n;
      else if (best && !best.contains(n)) break;
    }
    return best;
  };
  let el = null;
  // 同じ id が何か所にもあるページでは、selector が意図と違う場所を指す
  if (selector && document.querySelectorAll(selector).length > 1) return { found: false, ambiguous: true };
  if (selector) el = document.querySelector(selector);
  else if (hash) el = document.getElementById(decodeURIComponent(hash));
  else if (quote) el = findText(quote);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  let id = null;
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.id && unique(n.id) && !inChrome(n) && !isFixed(n) && Math.abs(n.getBoundingClientRect().top - r.top) < 200) {
      id = n.id;
      break;
    }
  }
  if (!id) {
    const cands = [...document.querySelectorAll("h1[id],h2[id],h3[id],h4[id],section[id],[id] > h2,[id] > h3")]
      .map(n => (n.id ? n : n.parentElement))
      .filter(n => n.id && unique(n.id) && shown(n) && !inChrome(n) && !isFixed(n) && !n.contains(el)
        && n.getBoundingClientRect().top <= r.top + 5 && r.top - n.getBoundingClientRect().top < 300);
    cands.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
    if (cands[0]) id = cands[0].id;
  }
  // ブラウザの #:~:text= はページ全体で最初に見えている出現へ飛ぶ。それが該当箇所の中にある文字だけ使う
  const firstShown = q => {
    q = norm(q);
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let acc = "";
    const nodes = [];
    while (w.nextNode()) {
      const t = w.currentNode;
      const pe = t.parentElement;
      if (!pe || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(pe.tagName) || !shown(pe)) continue;
      acc += norm(t.data);
      nodes.push([acc.length, pe]);
      const at = acc.indexOf(q);
      if (at >= 0) return nodes.find(([end]) => end > at)[1];
    }
    return null;
  };
  let text = null;
  const heads = [...el.querySelectorAll("h1,h2,h3,h4,h5,h6,.title,[class*=title]")].filter(shown);
  const tries = [quote, ...heads.map(h => h.innerText), el.innerText]
    .filter(Boolean)
    .map(t => t.trim().split(/[\n\t]/).map(x => x.trim()).find(x => x.length >= 2) || "")
    .filter(Boolean)
    .map(t => t.slice(0, 40));
  for (const t of tries) {
    const f = firstShown(t);
    if (f && (el.contains(f) || f === el)) {
      text = t;
      break;
    }
  }
  return {
    found: true,
    visible: shown(el),
    top: Math.round(r.top + scrollY),
    viewTop: Math.round(r.top),
    id,
    text,
    vh: innerHeight,
  };
}

/**
 * 飛び先を開いた後、実際の着地点（#id の要素、または文字が最初に見えている場所）が画面のどこにあるかを測る。
 * 手がかりの要素ではなく着地点そのものを測るのは、同じ文字が隠れた場所（タブの中など）にもあるページで、
 * スクロールしていないのに合格としないため。
 */
function locateJumpInPage({ id, text }) {
  const norm = s => (s || "").replace(/\s+/g, "");
  const shown = n => {
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== "hidden";
  };
  let el = null;
  if (id) el = document.getElementById(id);
  else if (text) {
    const q = norm(text);
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let acc = "";
    const nodes = [];
    while (w.nextNode() && !el) {
      const t = w.currentNode;
      const pe = t.parentElement;
      if (!pe || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(pe.tagName) || !shown(pe)) continue;
      acc += norm(t.data);
      nodes.push([acc.length, pe]);
      const at = acc.indexOf(q);
      if (at >= 0) el = nodes.find(([end]) => end > at)[1];
    }
  }
  if (!el || !shown(el)) return { found: false };
  return { found: true, viewTop: Math.round(el.getBoundingClientRect().top), vh: innerHeight };
}

async function audit(ids, run, write) {
  const { chromium, devices } = await import("playwright");
  const browser = await chromium.launch();
  const contexts = {
    desktop: await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ja-JP" }),
    mobile: await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 375, height: 812 }, locale: "ja-JP" }),
  };
  /** ページを開いて fn を実行する。開けなければ { error } */
  const withPage = async (context, url, settleMs, fn) => {
    const page = await context.newPage();
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
      if (settleMs) await page.waitForTimeout(settleMs);
      return { status: response?.status() ?? 0, value: await fn(page) };
    } catch (e) {
      return { error: String(e.message || e).split("\n")[0].slice(0, 160) };
    } finally {
      await page.close();
    }
  };
  await mkdir(path.join(run, "audit"), { recursive: true });
  const linkCache = new Map(); // foundOn のページ → そこに載っているリンク

  for (const id of ids) {
    const filePath = path.join(FILES_DIR, `${id}.json`);
    const file = await readJson(filePath);
    if (!file) {
      console.log(`${id}: 収集ファイルがありません（${filePath}）`);
      continue;
    }
    const officialHosts = file.officialSites.map(u => new URL(u).hostname.replace(/^www\./, ""));
    const report = [];
    const found = file.items.map((item, index) => ({ item, index })).filter(x => x.item.status === "found");

    // 同じページの項目はまとめて1回で測る
    const byBase = new Map();
    for (const entry of found) {
      const base = baseOf(entry.item.url);
      byBase.set(base, [...(byBase.get(base) ?? []), entry]);
    }
    await eachLimit([...byBase], PAGE_CONCURRENCY, async ([base, entries]) => {
      const isPdf = /\.pdf($|[?#])/i.test(base);
      const host = new URL(base).hostname;
      const hints = entries.map(({ item }) => ({
        selector: item.selector ?? null,
        quote: item.quote ?? null,
        hash: item.selector ? null : new URL(item.url).hash.slice(1) || null,
      }));
      const measured = Object.fromEntries(
        await Promise.all(
          Object.entries(contexts).map(async ([name, context]) => {
            if (isPdf) {
              // PDFは開けるかだけ確かめる
              const res = await context.request.get(base, { timeout: 30_000 }).catch(e => ({ ok: () => false, status: () => 0, e }));
              return [name, res.ok() ? { status: res.status(), value: hints.map(() => ({ found: false })) } : { error: `HTTP ${res.status()}` }];
            }
            return [
              name,
              await withPage(context, base, 0, page =>
                Promise.all(hints.map(hint => page.evaluate(measureInPage, hint))),
              ),
            ];
          }),
        ),
      );
      for (const [i, { item, index }] of entries.entries()) {
        const row = { index, type: item.type, label: item.label ?? null, url: item.url, problems: [] };
        const d = measured.desktop;
        if (d.error) row.problems.push(`開けない: ${d.error}`);
        else if ([401, 403, 429].includes(d.status))
          row.problems.push(`自動アクセスを拒否された（HTTP ${d.status}）。人のブラウザで開けるか確かめる`);
        else if (d.status >= 400) row.problems.push(`開けない: HTTP ${d.status}`);

        // 公式サイトのページか、公式ページに載っているリンクか
        if (!sameSite(host, officialHosts)) {
          if (!item.foundOn) row.problems.push("公式サイト以外のURLなのに foundOn（載っていた公式ページ）が無い");
          else if (!sameSite(new URL(item.foundOn).hostname, officialHosts))
            row.problems.push("foundOn が公式サイトのページではない");
          else {
            if (!linkCache.has(item.foundOn)) {
              // 画面に描かれたリンクと、配信されたHTMLに書かれたリンクの両方を見る
              // （スクリプトがリンクを書き換えるページがあるため）
              const keyOf = h => { try { return [pageKey(new URL(h, item.foundOn).href)]; } catch { return []; } };
              const rendered = await withPage(contexts.desktop, item.foundOn, 0, page =>
                page.$$eval("a[href], area[href], iframe[src]", els => els.map(e => e.href || e.src)),
              );
              const raw = await contexts.desktop.request.get(item.foundOn, { timeout: 30_000 })
                .then(res => (res.ok() ? res.text() : ""))
                .catch(() => "");
              const rawLinks = [...raw.matchAll(/(?:href|src)=["']([^"']+)["']/g)].map(m => m[1].replace(/&amp;/g, "&"));
              linkCache.set(
                item.foundOn,
                rendered.error && !raw ? null : new Set([...(rendered.value ?? []), ...rawLinks].flatMap(keyOf)),
              );
            }
            const links = linkCache.get(item.foundOn);
            if (!links) row.problems.push("foundOn のページを開けない");
            else if (!links.has(pageKey(item.url))) row.problems.push("foundOn のページに、このURLへのリンクが見つからない");
          }
        }

        // 飛び先
        const hint = hints[i];
        const dm = d.value?.[i];
        const mm = measured.mobile.value?.[i];
        const original = new URL(item.url).hash;
        let jumpUrl = null;
        let landing = null; // 開き直して確かめる着地点
        if (isPdf || NO_JUMP_HOST.test(host) || !(hint.selector || hint.quote || hint.hash)) row.jump = "ページの先頭";
        else if (!dm?.found && !mm?.found) {
          row.jump = "ページの先頭";
          if (dm?.ambiguous || mm?.ambiguous)
            row.problems.push(`selector「${hint.selector}」がページ内の複数の場所に当たる。quote で指すか、飛び先なしにする`);
          else if (hint.quote) row.problems.push(`ページに「${hint.quote}」が見つからない`);
          else row.problems.push("手がかり（selector / #id）の場所が見つからない");
        } else if (original && !hint.selector) {
          jumpUrl = item.url;
          landing = { id: decodeURIComponent(hint.hash) };
          row.jump = "元のURLの#";
        } else {
          const best = dm?.found ? dm : mm;
          const fits = [dm, mm].every(x => x?.found && x.visible && x.top < x.vh * FOLD);
          if (fits) row.jump = "開いた画面で見えるので飛び先なし";
          else if (!best.visible) row.jump = "タブなどで隠れているので飛び先なし";
          else if (best.id) {
            jumpUrl = `${base}#${encodeURIComponent(best.id)}`;
            landing = { id: best.id };
          } else if (best.text) {
            jumpUrl = `${base}#:~:text=${encodeURIComponent(best.text).replace(/-/g, "%2D")}`;
            landing = { text: best.text };
          }
          else row.jump = "飛び先に使える id・文字がない";
        }
        if (jumpUrl) {
          // 決めた飛び先を開き直し、読み込みが落ち着いた後も該当箇所が画面内にあるか確かめる
          // 画像などが遅れて読み込まれて位置が動くページがあるので、2.5秒後と5秒後の2回測る
          const checks = (
            await Promise.all(
              Object.values(contexts).map(context =>
                withPage(context, jumpUrl, 2_500, async page => {
                  const first = await page.evaluate(locateJumpInPage, landing);
                  await page.waitForTimeout(2_500);
                  return [first, await page.evaluate(locateJumpInPage, landing)];
                }),
              ),
            )
          ).flatMap(res => res.value ?? [null]);
          const ok = checks.every(c => c?.found && c.viewTop >= -20 && c.viewTop < c.vh * 0.7);
          if (ok) row.jump = jumpUrl;
          else {
            row.jump = "開いた後に内容が読み込まれて位置がずれるので飛び先なし";
            jumpUrl = null;
          }
        }
        row.jumpUrl = jumpUrl;
        // 指摘を承知のうえで載せる項目（accept に理由がある）は、問題の件数に数えない
        if (item.accept && row.problems.length > 0) row.accepted = item.accept;
        report.push(row);
        // ページを開けなかったとき（通信の不調など）は、前に決めた飛び先を消さない
        if (write && !d.error) {
          if (jumpUrl && jumpUrl !== item.url) file.items[index].jumpUrl = jumpUrl;
          else delete file.items[index].jumpUrl;
        }
      }
    });
    report.sort((a, b) => a.index - b.index);
    await writeFile(path.join(run, "audit", `${id}.json`), `${JSON.stringify(report, null, 2)}\n`);
    if (write) await writeFile(filePath, `${JSON.stringify(file, null, 2)}\n`);
    const bad = report.filter(r => r.problems.length > 0 && !r.accepted);
    const accepted = report.filter(r => r.accepted);
    console.log(
      `${id}: ${report.length}件を確認、飛び先あり ${report.filter(r => r.jumpUrl).length}件、問題 ${bad.length}件${write ? "（jumpUrl を書き戻し済み）" : ""}`,
    );
    for (const r of bad) console.log(`  ! ${r.type}${r.label ? `（${r.label}）` : ""} ${r.url}\n    ${r.problems.join(" / ")}`);
    for (const r of accepted) console.log(`  ~ ${r.type}${r.label ? `（${r.label}）` : ""} ${r.url}\n    ${r.problems.join(" / ")}（承知: ${r.accepted}）`);
  }
  await browser.close();
}

// ---------------------------------------------------------------- main
const args = parseArgs(process.argv.slice(2));
const [command] = args._;
const ids = String(args.ids ?? "").split(",").filter(Boolean);
if (!["prepare", "audit"].includes(command) || ids.length === 0 || !args.run) {
  console.error("使い方: official-links.mjs prepare|audit --ids a,b --run <作業ディレクトリ> [--write]");
  process.exit(1);
}
if (command === "prepare") await prepare(ids, args.run);
else await audit(ids, args.run, Boolean(args.write));
