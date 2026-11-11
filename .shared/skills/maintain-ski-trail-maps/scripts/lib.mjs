// ゲレンデマップ点検の共通処理。リポジトリのルートで実行する前提。
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import dotenv from "dotenv";

const run = promisify(execFile);

if (!existsSync("package.json") || !existsSync("src/private")) {
  throw new Error("リポジトリのルート（rusutsu）で実行してください");
}
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

export const PATHS = {
  /** 前回確かめたマップ画像・掲載ページの指紋（Git管理・継続データ） */
  state: "src/private/data/trail-map-watch/state.json",
  /** 1回の点検の作業領域（Git管理外） */
  runs: "src/private/data/resorts-temporary/tmp/trail-map-audit",
  /** 反映記録（Git管理） */
  records: "src/private/data/resort-map-audit",
};
export const LINKS_KEY = "SkiResortLinks.json";
export const SITE_BASE = "https://ktak.dev/rusutsu";
/**
 * 詳細画面でマップが入る枠（2026-11-11 に本番で実測）。
 * PC: 1440x900 のサイドパネル、SP: 375x812 の「ゲレンデマップ」タブ。
 * レイアウトを変えたら `render` で測り直してここを更新する。
 */
export const FRAMES = { pc: { w: 452, h: 303 }, sp: { w: 375, h: 249 } };
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_BYTES = 45 * 1024 * 1024;
/** 本番の中継（/api/trail-map）が受け付ける上限 */
export const PROXY_MAX_BYTES = 40 * 1024 * 1024;

export const today = () => new Date().toISOString().slice(0, 10);

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

// ---------- 正本（本番の DataDocument API） ----------

function apiBase() {
  const raw = process.env.DATA_API_BASE_URL?.trim();
  if (!raw) throw new Error("DATA_API_BASE_URL が未設定です（.env.local）");
  const base = raw.replace(/\/+$/u, "");
  const u = new URL(base);
  if (u.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(u.hostname))
    throw new Error("DATA_API_BASE_URL は https のみ");
  return base;
}

export async function api(p, init = {}) {
  const token = process.env.INTERNAL_DATA_API_ADMIN_TOKEN?.trim();
  if (!token) throw new Error("INTERNAL_DATA_API_ADMIN_TOKEN が未設定です");
  const r = await fetch(`${apiBase()}/api/internal/v1/${p}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`正本API HTTP ${r.status} ${body.slice(0, 200)}`);
  }
  return r.json();
}

export async function readCanonical() {
  const [doc, admin] = await Promise.all([
    api(`data-documents?key=${LINKS_KEY}`),
    api("ski-resorts?view=admin"),
  ]);
  if (!doc.document) throw new Error(`${LINKS_KEY} が見つかりません`);
  return {
    document: doc.document,
    links: JSON.parse(doc.document.content),
    resorts: admin.resorts,
  };
}

/** 名寄せ後の1施設＝1行。詳細画面と同じく統合元IDのリンクもまとめる。 */
export function buildInventory(links, resorts) {
  return resorts
    .filter(r => !r.mergedIntoId)
    .map(r => {
      const ids = [...new Set([r.id, ...(r.sourceResortIds ?? [])])];
      const field = k =>
        ids.flatMap(owner =>
          (links[owner]?.[k] ?? []).map(l => ({ ...l, owner })),
        );
      return {
        id: r.id,
        name: r.nameJa,
        prefecture: r.prefecture,
        active: r.isActive,
        website: r.website ?? null,
        ids,
        mapUrls: field("mapUrls"),
        mapPageUrls: field("mapPageUrls"),
        officialSiteUrls: field("officialSiteUrls"),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ---------- シーズン推定 ----------

/** 7月以降は その年のシーズン（2026-11 → 2026 = 2026-27シーズン） */
export const seasonOf = date => {
  const d = new Date(date);
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
};
export const currentSeason = () => seasonOf(new Date());
export const seasonLabel = s =>
  s == null ? "不明" : `${s}-${String((s + 1) % 100).padStart(2, "0")}`;

/**
 * URL・ファイル名からシーズンを推定する。根拠の強い順に見る。
 * confidence: high=「2025-26」型、mid=WordPressのアップロード年月、low=年だけ・更新日時
 */
export function inferSeason(url, lastModified) {
  let s = url;
  try {
    s = decodeURIComponent(url);
  } catch {}
  const pair = s.match(/(?<!\d)(20\d{2})\s*[-_~〜/年]\s*(?:20)?(\d{2})(?!\d)/);
  if (pair && (Number(pair[1]) + 1) % 100 === Number(pair[2]))
    return { season: Number(pair[1]), source: pair[0], confidence: "high" };
  const short = s.match(/(?<![\dx])(\d{2})[-_](\d{2})(?![\dx])/i);
  if (short && Number(short[1]) >= 15 && Number(short[1]) <= 40 && Number(short[1]) + 1 === Number(short[2]))
    return { season: 2000 + Number(short[1]), source: short[0], confidence: "high" };
  const compact = s.match(/(?<!\d)(\d{2})(\d{2})(?:season|シーズン|_?map|-?map)/i);
  if (compact && Number(compact[1]) >= 15 && Number(compact[1]) + 1 === Number(compact[2]))
    return { season: 2000 + Number(compact[1]), source: compact[0], confidence: "high" };
  // 20200107162127 のような日付入りファイル名（CMSの保存日時）
  const stamp = s.match(/(?<!\d)(20[12]\d)(0[1-9]|1[0-2])([0-3]\d)(?:\d{6})?(?!\d)/);
  if (stamp) {
    const y = Number(stamp[1]);
    return { season: Number(stamp[2]) >= 7 ? y : y - 1, source: stamp[0], confidence: "mid" };
  }
  // map2627 / 2526map のような4桁の続き年
  const glued = s.match(/(?<!\d)(\d{2})(\d{2})(?!\d)/);
  if (glued && Number(glued[1]) >= 15 && Number(glued[1]) <= 40 && Number(glued[1]) + 1 === Number(glued[2]))
    return { season: 2000 + Number(glued[1]), source: glued[0], confidence: "mid" };
  const wp = s.match(/\/uploads\/(20\d{2})\/(\d{2})\//);
  if (wp) {
    const y = Number(wp[1]);
    const m = Number(wp[2]);
    return { season: m >= 7 ? y : y - 1, source: wp[0], confidence: "mid" };
  }
  const year = s.match(/(?<!\d)(20[12]\d)(?!\d)/);
  if (year) return { season: Number(year[1]), source: year[0], confidence: "low" };
  if (lastModified && !Number.isNaN(Date.parse(lastModified)))
    return {
      season: seasonOf(lastModified),
      source: `Last-Modified ${lastModified}`,
      confidence: "low",
    };
  return { season: null, source: null, confidence: "none" };
}

// ---------- マップ画像・PDFの取得 ----------

const sniff = buf => {
  const h = buf.subarray(0, 16);
  if (h.subarray(0, 4).toString() === "%PDF") return "application/pdf";
  if (h[0] === 0x89 && h.subarray(1, 4).toString() === "PNG") return "image/png";
  if (h[0] === 0xff && h[1] === 0xd8) return "image/jpeg";
  if (h.subarray(0, 3).toString() === "GIF") return "image/gif";
  if (h.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (h.subarray(4, 12).toString().includes("ftypavi")) return "image/avif";
  if (/<svg[\s>]/i.test(buf.subarray(0, 2048).toString())) return "image/svg+xml";
  if (/<(!doctype|html)/i.test(buf.subarray(0, 512).toString())) return "text/html";
  return null;
};

async function readBody(res) {
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_BYTES) return { buf: Buffer.concat(chunks), truncated: true, size };
    chunks.push(chunk);
  }
  return { buf: Buffer.concat(chunks), truncated: false, size };
}

async function pdfInfo(buf) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trailmap-"));
  const file = path.join(dir, "a.pdf");
  try {
    await writeFile(file, buf);
    const { stdout } = await run("pdfinfo", [file], { timeout: 20_000 });
    const pages = Number(stdout.match(/Pages:\s+(\d+)/)?.[1] ?? 0) || null;
    const size = stdout.match(/Page size:\s+([\d.]+) x ([\d.]+)/);
    return {
      pages,
      width: size ? Math.round(Number(size[1])) : null,
      height: size ? Math.round(Number(size[2])) : null,
    };
  } catch {
    const text = buf.toString("latin1");
    const box = text.match(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/);
    return {
      pages: (text.match(/\/Type\s*\/Page(?!s)/g) ?? []).length || null,
      width: box ? Math.round(Number(box[1])) : null,
      height: box ? Math.round(Number(box[2])) : null,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** PDFの1ページ目をPNGにする（poppler の pdftoppm が要る） */
export async function pdfFirstPage(buf, dpi = 40) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trailmap-"));
  try {
    await writeFile(path.join(dir, "a.pdf"), buf);
    await run("pdftoppm", ["-png", "-r", String(dpi), "-f", "1", "-l", "1", "-singlefile", path.join(dir, "a.pdf"), path.join(dir, "p")], { timeout: 60_000 });
    return await readFile(path.join(dir, "p.png"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function get(url, referer) {
  return fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "image/avif,image/webp,image/*,application/pdf,*/*;q=0.8",
      ...(referer ? { Referer: referer } : {}),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
  });
}

/**
 * ブラウザが詳細画面で読むのと同じ条件（本番からの Referer）で取得し、
 * 種類・寸法・指紋を返す。keepBody=true なら本文も返す。
 */
export async function probeAsset(url, { keepBody = false } = {}) {
  const out = { url, checkedAt: new Date().toISOString() };
  try {
    let res = await get(url, `${SITE_BASE}/`);
    if (!res.ok) {
      const plain = await get(url, null).catch(() => null);
      if (plain?.ok) {
        out.hotlinkBlocked = true;
        res = plain;
      }
    }
    out.status = res.status;
    out.finalUrl = res.url;
    out.redirected = res.url !== url;
    out.headerType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    out.etag = res.headers.get("etag");
    out.lastModified = res.headers.get("last-modified");
    if (!res.ok || !res.body) return out;
    const { buf, truncated, size } = await readBody(res);
    out.bytes = size;
    out.truncated = truncated;
    out.sha256 = createHash("sha256").update(buf).digest("hex");
    out.type = sniff(buf) ?? out.headerType;
    if (out.type.startsWith("image/")) {
      const sharp = (await import("sharp")).default;
      const meta = await sharp(buf, { limitInputPixels: false }).metadata().catch(() => null);
      if (meta) {
        out.width = meta.width ?? null;
        out.height = meta.height ?? null;
        out.frames = meta.pages ?? 1;
      }
    } else if (out.type === "application/pdf" && !truncated) {
      Object.assign(out, await pdfInfo(buf));
    }
    if (keepBody) out.body = buf;
  } catch (error) {
    out.error = String(error?.cause?.code ?? error?.name ?? error).slice(0, 120);
  }
  return out;
}

/**
 * 枠に入れたときの見え方。<img> は object-contain で拡大しない（max-w/max-h）、
 * PDF は view=Fit で枠に合わせて拡大縮小する。
 * scale: 原寸に対する倍率、fill: 枠の面積に対して絵が占める割合。
 */
export function fitInFrames(probe) {
  const { width: w, height: h, type } = probe;
  if (!w || !h) return null;
  const isPdf = type === "application/pdf";
  const result = {};
  for (const [name, f] of Object.entries(FRAMES)) {
    const fit = Math.min(f.w / w, f.h / h);
    const scale = isPdf ? fit : Math.min(1, fit);
    const dw = Math.round(w * scale);
    const dh = Math.round(h * scale);
    result[name] = {
      shown: [dw, dh],
      scale: Number(scale.toFixed(3)),
      fill: Number(((dw * dh) / (f.w * f.h)).toFixed(2)),
    };
  }
  return result;
}

// ---------- 掲載ページの走査 ----------

const ASSET_RE = /\.(pdf|png|jpe?g|webp|gif|svg|avif)(?:[?#]|$)|image\.jsp\?|\/media-download\//i;
const MAP_WORD_RE = /ゲレンデ|コース|マップ|全体図|案内図|場内図|滑走|gelande|gerende|gelände|slope|trail|course|piste|map|gmap/i;
const NOISE_RE = /logo|icon|favicon|banner|bnr|sns|instagram|facebook|twitter|youtube|line_|btn|button|arrow|ttl_|title_|qr|weather|tenki|price|ticket|lift-?ticket|recruit|access_map|accessmap|google|parking|駐車|料金|チケット|求人|アクセス/i;

const variants = url => {
  const set = new Set();
  try {
    const u = new URL(url);
    const add = s => {
      if (!s) return;
      set.add(s);
      try {
        set.add(decodeURIComponent(s));
      } catch {}
    };
    add(u.href);
    add(u.pathname + u.search);
    if (!u.search || /^\?(ver|v|t|\d)/i.test(u.search)) add(u.pathname);
  } catch {}
  return [...set].filter(s => s.length > 6);
};

/** WordPress のサイズ違い（-1024x892）や拡張子違いを同じ絵の候補とみなすための語幹 */
export const assetStem = url => {
  try {
    const p = decodeURIComponent(new URL(url).pathname);
    return p
      .replace(/\.(pdf|png|jpe?g|webp|gif|svg|avif)$/i, "")
      .replace(/-\d{2,4}x\d{2,4}$/i, "")
      .replace(/-scaled$/i, "")
      .toLowerCase();
  } catch {
    return url;
  }
};

/** 掲載ページの HTML にその URL が出てくるか（exact / variant / no） */
export function referenceOnPage(html, assetUrls, url) {
  if (variants(url).some(v => html.includes(v))) return "exact";
  const stem = assetStem(url);
  if (assetUrls.some(a => assetStem(a) === stem)) return "variant";
  return "no";
}

/**
 * Playwright のページでURLを開き、マップらしい画像・PDFの候補を集める。
 * 画像そのものは読まない（速さのため）。
 */
export async function scanPage(page, url) {
  const out = { url, checkedAt: new Date().toISOString() };
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
    out.status = res?.status() ?? null;
    out.finalUrl = page.url();
    const d = await page.evaluate(() => {
      const abs = u => {
        try {
          return new URL(u, location.href).href;
        } catch {
          return null;
        }
      };
      const items = [];
      const near = el => {
        const box = el.closest("figure,section,article,li,div");
        const head = box?.querySelector("h1,h2,h3,h4,figcaption,.title,.ttl");
        return (head?.textContent ?? "").trim().slice(0, 60);
      };
      for (const img of document.querySelectorAll("img")) {
        const srcs = [img.getAttribute("src"), img.dataset.src, img.dataset.lazySrc, img.dataset.original];
        for (const part of (img.getAttribute("srcset") ?? img.dataset.srcset ?? "").split(",")) srcs.push(part.trim().split(/\s+/)[0]);
        const label = [img.alt, img.title, img.closest("a")?.textContent, near(img)].filter(Boolean).join(" ").trim().slice(0, 120);
        for (const s of srcs) if (s) items.push({ url: abs(s), label, tag: "img", w: img.naturalWidth || Number(img.getAttribute("width")) || null });
      }
      for (const src of document.querySelectorAll("picture source[srcset]"))
        for (const part of src.getAttribute("srcset").split(",")) items.push({ url: abs(part.trim().split(/\s+/)[0]), label: near(src), tag: "source" });
      for (const a of document.querySelectorAll("a[href]"))
        items.push({ url: abs(a.getAttribute("href")), label: `${a.textContent ?? ""} ${a.title ?? ""}`.trim().slice(0, 120), tag: "a" });
      for (const el of document.querySelectorAll("[style*='url(']")) {
        const m = el.getAttribute("style").match(/url\(['"]?([^'")]+)/);
        if (m) items.push({ url: abs(m[1]), label: near(el), tag: "bg" });
      }
      return { title: document.title, html: document.documentElement.outerHTML, items: items.filter(i => i.url) };
    });
    out.title = d.title;
    out.html = d.html;
    out.assets = d.items;
  } catch (error) {
    out.error = String(error.message).split("\n")[0].slice(0, 160);
  }
  return out;
}

/** 走査結果からマップらしい候補を点数順に並べる */
export function mapCandidates(scan) {
  const byUrl = new Map();
  for (const item of scan.assets ?? []) {
    if (!ASSET_RE.test(item.url)) continue;
    const name = (() => {
      try {
        return decodeURIComponent(new URL(item.url).pathname);
      } catch {
        return item.url;
      }
    })();
    const text = `${name} ${item.label}`;
    let score = 0;
    if (MAP_WORD_RE.test(name)) score += 3;
    if (MAP_WORD_RE.test(item.label)) score += 2;
    if (/\.pdf/i.test(name) && /マップ|map|コース|ゲレンデ/i.test(item.label)) score += 1;
    if (NOISE_RE.test(name)) score -= 4;
    if (/ゲレンデ|gelande|gerende|slope|trail|course|piste/i.test(text) && /map|マップ|図/i.test(text)) score += 2;
    const season = inferSeason(item.url);
    if (score < 2) continue;
    const prev = byUrl.get(item.url);
    if (!prev || prev.score < score)
      byUrl.set(item.url, { url: item.url, label: item.label, tag: item.tag, score, season: season.season, seasonConfidence: season.confidence });
  }
  return [...byUrl.values()].sort((a, b) => b.score - a.score || (b.season ?? 0) - (a.season ?? 0));
}

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
export async function isMain(metaUrl) {
  const { realpathSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}
