// スキー場データの定期点検（週次の見回り・シーズン前の再調査）の共通処理。
// リポジトリのルートで実行する前提。点検スクリプトはどれも「読むだけ」で、本番へは書かない。
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

if (!existsSync("package.json") || !existsSync("src/private")) {
  throw new Error("リポジトリのルート（rusutsu）で実行してください");
}
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

export const PATHS = {
  /** 継続して持つデータ（Git管理）: 前回の指紋・続けて失敗している回数・既知の問題・報告の履歴 */
  data: "src/private/data/maintenance",
  /** 1回の点検の作業領域（Git管理外） */
  runs: "src/private/data/resorts-temporary/tmp/maintenance",
  known: "src/private/data/maintenance/known-issues.json",
  reports: "src/private/data/maintenance/reports",
  liftTicket: "src/private/data/lift-ticket",
  liftTicketSource: "src/private/data/lift-ticket-source",
  crawlers: "src/private/scripts/crawl_latest/resorts",
  tourLinks: "src/private/data/tour-links",
};
export const LINKS_KEY = "SkiResortLinks.json";
export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** 日本時間の日付（YYYY-MM-DD） */
export const today = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const sha = text => createHash("sha256").update(text).digest("hex");

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const [k, v] = a.slice(2).split("=", 2);
    if (v !== undefined) out[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) out[k] = argv[++i];
    else out[k] = true;
  }
  return out;
}
export const listArg = value =>
  value && value !== true
    ? String(value).split(",").map(s => s.trim()).filter(Boolean)
    : null;

export const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (fallback !== undefined && error.code === "ENOENT") return fallback;
    throw error;
  }
};
export const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
};
export const writeText = async (file, text) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
};

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

/** 直接実行されたか（.claude/skills のシンボリックリンク経由でも判定できるよう実パスで比べる） */
export function isMain(metaUrl) {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

export function runCli(metaUrl, commands) {
  if (!isMain(metaUrl)) return;
  const args = parseArgs(process.argv.slice(2));
  const command = commands[args._[0]];
  if (!command) {
    console.error(`commands: ${Object.keys(commands).join(" | ")}（詳しくは SKILL.md）`);
    process.exit(2);
  }
  command(args).catch(error => {
    // 使い方の誤り（assert）は文面だけ、それ以外は場所も出す
    console.error(error?.code === "ERR_ASSERTION" ? error.message : error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  });
}

// ---------- 本番のデータAPI（読むだけ） ----------

function apiBase() {
  const raw = process.env.API_BASE_URL?.trim();
  if (!raw) throw new Error("API_BASE_URL が未設定です（.env.local）");
  const base = raw.replace(/\/+$/u, "");
  const u = new URL(base);
  if (u.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(u.hostname))
    throw new Error("API_BASE_URL は https のみ");
  return base;
}

/** GET だけ。書き込みは各スキルの反映コマンド（publish・apply）に任せる */
export async function apiGet(p) {
  const token = process.env.API_BEARER_TOKEN?.trim();
  if (!token) throw new Error("API_BEARER_TOKEN が未設定です（.env.local）");
  const r = await fetch(`${apiBase()}/api/admin/${p}`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`データAPI HTTP ${r.status} ${p.split("?")[0]} ${body.slice(0, 200)}`);
  }
  return r.json();
}

/** 名寄せ後のスキー場（統合元は sourceIds にまとめる） */
export async function loadResorts() {
  const { resorts } = await apiGet("resorts?view=admin");
  const canonical = resorts.filter(r => !r.mergedIntoId);
  const mergedInto = new Map(resorts.filter(r => r.mergedIntoId).map(r => [r.id, r.mergedIntoId]));
  return {
    resorts: canonical
      .map(r => ({
        id: r.id,
        name: r.nameJa,
        prefecture: r.prefecture,
        active: Boolean(r.isActive),
        website: r.website ?? null,
        ids: [...new Set([r.id, ...(r.sourceResortIds ?? [])])],
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    /** 統合元ID → 統合先ID（統合されていなければそのまま） */
    canonicalId: id => mergedInto.get(id) ?? id,
  };
}

/** 旧来のリンク文書（公式サイト・スクール・SNS・マップ・動画など） */
export async function loadLinksDocument() {
  const { document } = await apiGet(`documents?key=${LINKS_KEY}`);
  if (!document) throw new Error(`${LINKS_KEY} が見つかりません`);
  return { version: document.version, links: JSON.parse(document.content) };
}

/** resort_links の全行（出どころごとに読む） */
export async function loadResortLinkRows() {
  const { summary } = await apiGet("resort-links");
  const sources = [...new Set(summary.map(s => s.source))];
  const lists = await mapLimit(sources, 4, async source => (await apiGet(`resort-links?source=${encodeURIComponent(source)}`)).links);
  return lists.flat();
}

// ---------- URL ----------

const SECOND_LEVEL = /^(?:co|ne|or|ac|go|lg|ed|gr|ad)\.jp$|^(?:hokkaido|aomori|iwate|miyagi|akita|yamagata|fukushima|niigata|nagano|gunma|tochigi|toyama|ishikawa|fukui|gifu|hyogo|hiroshima|tottori|shimane|okayama|shiga|kyoto|nara|yamanashi)\.jp$/u;

/** 持ち主が同じかを比べるためのドメイン（www や下位のホスト名を落とす） */
export function siteOf(url) {
  try {
    const labels = new URL(url).hostname.toLowerCase().split(".");
    const n = SECOND_LEVEL.test(labels.slice(-2).join(".")) ? 3 : 2;
    return labels.slice(-n).join(".");
  } catch {
    return "";
  }
}
export const hostOf = url => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

const TRACKING = /^(?:utm_.+|fbclid|gclid|yclid|_ga|_gl|stkn|igshid|mc_cid|mc_eid)$/iu;

/** 同じページかを比べるための鍵（http/https・www・末尾のスラッシュ・追跡パラメータ・# 以降の違いを無視） */
export function urlKey(url) {
  try {
    const u = new URL(url);
    // 追跡パラメータと、開くたびに変わる時刻だけのパラメータ（?20261126073704）は同じページとみなす
    const query = [...u.searchParams.entries()].filter(([k, v]) => !TRACKING.test(k) && !(v === "" && /^\d{8,}$/u.test(k))).sort(([a], [b]) => a.localeCompare(b));
    const search = query.length ? `?${new URLSearchParams(query)}` : "";
    const p = decodeURIComponent(u.pathname).replace(/\/(?:index\.(?:html?|php))?$/u, "") || "";
    return `${u.hostname.toLowerCase().replace(/^www\./u, "")}${p}${search}`;
  } catch {
    return url;
  }
}
/** 取得に使うURL（# 以降と、ページ内の位置を示す :~:text= を落とす） */
export const fetchUrl = url => {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return url;
  }
};

// ---------- HTTP ----------

const errorCode = error => {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return "timeout";
  const cause = error?.cause;
  return cause?.code ?? cause?.message?.slice(0, 80) ?? error?.message?.slice(0, 80) ?? "error";
};

async function readBytes(res, maxBytes) {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size >= maxBytes) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return Buffer.concat(chunks);
}

function decodeHtml(buf, contentType) {
  const head = buf.subarray(0, 2048).toString("latin1");
  const charset = (/charset=["']?([\w-]+)/iu.exec(contentType ?? "") ?? /charset=["']?([\w-]+)/iu.exec(head))?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset.toLowerCase()).decode(buf);
  } catch {
    return buf.toString("utf8");
  }
}

/**
 * URLを取得して、転送の経路・最後のURL・状態・種類・（HTMLなら）本文の先頭を返す。
 * 例外は投げず、つながらないときは status 0 と error を返す。
 * @param {{ timeout?: number, maxBytes?: number, binary?: boolean }} options binary: HTML以外も中身を読んで sha256 を付ける
 */
export async function httpProbe(url, { timeout = 20_000, maxBytes = 400_000, binary = false } = {}) {
  const hops = [];
  let current = fetchUrl(url);
  try {
    for (let i = 0; i < 7; i++) {
      const res = await fetch(current, {
        redirect: "manual",
        headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml,application/pdf,image/*,*/*;q=0.8", "Accept-Language": "ja,en;q=0.8" },
        signal: AbortSignal.timeout(timeout),
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel().catch(() => {});
        current = new URL(location, current).href;
        hops.push(current);
        continue;
      }
      const contentType = res.headers.get("content-type") ?? "";
      const type = contentType.split(";")[0].trim().toLowerCase();
      const out = { url, status: res.status, finalUrl: current, type, hops };
      if (res.ok && /html|xml|text\/plain/u.test(type)) {
        out.html = decodeHtml(await readBytes(res, maxBytes), contentType);
      } else if (res.ok && binary) {
        const buf = await readBytes(res, 40 * 1024 * 1024);
        out.bytes = buf.length;
        out.sha256 = createHash("sha256").update(buf).digest("hex");
      } else {
        await res.body?.cancel().catch(() => {});
      }
      return out;
    }
    return { url, status: 0, finalUrl: current, error: "redirect-loop", hops };
  } catch (error) {
    return { url, status: 0, finalUrl: current, error: errorCode(error), hops };
  }
}

/** ホストごとにまとめ、同じホストへは perHost 本ずつ、間を空けて順に取りに行く */
export async function mapByHost(urls, fn, { hosts = 20, perHost = 2, gapMs = 250 } = {}) {
  const groups = new Map();
  for (const url of urls) {
    const host = hostOf(url);
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host).push(url);
  }
  const out = new Map();
  await mapLimit([...groups.values()], hosts, group =>
    mapLimit(group, perHost, async url => {
      out.set(url, await fn(url));
      if (group.length > 1) await sleep(gapMs);
    }),
  );
  return out;
}

export const htmlTitle = html => (/<title[^>]*>([\s\S]*?)<\/title>/iu.exec(html ?? "")?.[1] ?? "").replace(/\s+/gu, " ").trim().slice(0, 120);
export const htmlText = html =>
  (html ?? "")
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;|&#160;/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

// ---------- ブラウザ ----------

export async function withBrowser(fn) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

/** 画像・フォント・動画を読まないコンテキスト（本文とリンクだけ欲しいとき） */
export async function lightContext(browser) {
  const context = await browser.newContext({ userAgent: BROWSER_UA, locale: "ja-JP", viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
  await context.route("**/*", route => (["image", "media", "font"].includes(route.request().resourceType()) ? route.abort() : route.continue()));
  return context;
}

/** ページを開いて、状態・最後のURL・題・本文（innerText）・リンクを返す。例外は投げない */
export async function renderPage(context, url, { timeout = 30_000, settle = 2_500, links = false } = {}) {
  const page = await context.newPage();
  try {
    const response = await page.goto(fetchUrl(url), { waitUntil: "domcontentloaded", timeout });
    await page.waitForLoadState("networkidle", { timeout: settle }).catch(() => {});
    const data = await page.evaluate(withLinks => {
      const text = document.body?.innerText ?? "";
      const anchors = withLinks
        ? [...document.querySelectorAll("a[href]")].map(a => ({ url: a.href, text: (a.innerText || a.getAttribute("aria-label") || a.querySelector("img")?.alt || a.title || "").replace(/\s+/g, " ").trim().slice(0, 80) }))
        : [];
      return { title: document.title, text, anchors };
    }, links);
    return { url, status: response?.status() ?? 0, finalUrl: page.url(), title: data.title, text: data.text, links: data.anchors.filter(a => /^https?:/u.test(a.url)) };
  } catch (error) {
    return { url, status: 0, finalUrl: url, error: (error?.message ?? "error").split("\n")[0].slice(0, 120) };
  } finally {
    await page.close().catch(() => {});
  }
}

// ---------- 既知の問題・結果の書き出し ----------

/**
 * 既知の問題（分かっていて今は直せないもの）。毎週の報告で「要対応」に数えず、「既知」の欄へ分けて出す。
 * 形: { issues: [{ area, id, code?, url?, reason, addedAt, until? }] }。until（YYYY-MM-DD）を過ぎたら再び要対応に戻る
 */
export async function loadKnown(area) {
  const { issues = [] } = await readJson(PATHS.known, { issues: [] });
  const now = today();
  return issues.filter(i => i.area === area && (!i.until || i.until >= now));
}
export function markKnown(findings, known) {
  for (const f of findings) {
    const hit = known.find(k => k.id === f.id && (!k.code || k.code === f.code) && (!k.url || k.url === f.url));
    if (hit) f.known = hit.reason;
  }
  return findings;
}

export const SEVERITY = { high: 3, medium: 2, low: 1, info: 0 };
const SEVERITY_LABEL = { high: "高", medium: "中", low: "低", info: "参考" };
const cell = value => String(value ?? "").replaceAll("|", "／").replace(/\n+/gu, "<br>");

/**
 * 点検1種類の結果を <dir>/result.json と <dir>/summary.md に書く。
 * finding: { id, name?, severity, code, message, url?, known? }
 * handoff: [{ skill, what, ids }]（どのスキルへ何を回すか）
 */
export async function writeResult(dir, { area, title, checked, findings, handoff = [], notes = [], extra = {} }) {
  const open = findings.filter(f => !f.known);
  const counts = { checked, high: 0, medium: 0, low: 0, info: 0, known: findings.length - open.length };
  for (const f of open) counts[f.severity]++;
  const codeCounts = {};
  for (const f of open) codeCounts[f.code] = (codeCounts[f.code] ?? 0) + 1;
  const sorted = [...findings].sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity] || String(a.id).localeCompare(String(b.id)));
  const result = { area, title, checkedAt: new Date().toISOString(), counts, codeCounts, handoff, notes, findings: sorted, ...extra };
  await writeJson(path.join(dir, "result.json"), result);

  const lines = [`# ${title}（${today()}）`, "", `点検 ${checked}件: 高 ${counts.high}・中 ${counts.medium}・低 ${counts.low}・既知 ${counts.known}`, ""];
  for (const note of notes) lines.push(`- ${note}`);
  if (notes.length) lines.push("");
  if (Object.keys(codeCounts).length) {
    lines.push("| 指摘 | 件数 |", "|---|---|", ...Object.entries(codeCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`), "");
  }
  for (const level of ["high", "medium", "low"]) {
    const rows = sorted.filter(f => !f.known && f.severity === level);
    if (!rows.length) continue;
    const shown = level === "low" ? rows.slice(0, 40) : rows;
    lines.push(`## ${SEVERITY_LABEL[level]}（${rows.length}件）`, "", "| 対象 | 指摘 | 内容 | URL |", "|---|---|---|---|");
    for (const f of shown) lines.push(`| ${cell(f.name ? `${f.name}（${f.id}）` : f.id)} | ${f.code} | ${cell(f.message)} | ${f.url ? `<${f.url}>` : ""} |`);
    if (shown.length < rows.length) lines.push("", `ほか ${rows.length - shown.length}件は result.json にあります。`);
    lines.push("");
  }
  const knownRows = sorted.filter(f => f.known);
  if (knownRows.length) {
    lines.push(`## 既知（${knownRows.length}件。known-issues.json に理由あり）`, "");
    for (const f of knownRows) lines.push(`- ${f.name ?? f.id}: ${f.code} — ${f.known}`);
    lines.push("");
  }
  if (handoff.length) {
    lines.push("## 次に回す先", "");
    for (const h of handoff) lines.push(`- ${h.skill}: ${h.what}（${h.ids.length}件）${h.ids.length ? ` ${h.ids.slice(0, 30).join(", ")}${h.ids.length > 30 ? " …" : ""}` : ""}`);
    lines.push("");
  }
  await writeText(path.join(dir, "summary.md"), `${lines.join("\n")}\n`);
  console.log(JSON.stringify({ area, dir, counts, codeCounts }));
  return result;
}

export const runDir = (args, name) => (args.run && args.run !== true ? args.run : path.join(PATHS.runs, `${today()}-${name}`));
export const batches = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
