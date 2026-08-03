#!/usr/bin/env node
/**
 * capture-sources.mjs
 *
 * ユーザー指定URL（ホワイトリスト）をPlaywrightで開き、料金抽出・監査の
 * 証拠として以下を保存する。
 *
 *   lift-ticket/{resort-id}/sources/{season-id}/
 *     ├── manifest.json
 *     ├── page-001/
 *     │   ├── visible-text.txt   … 表示テキスト（モデルが最初に読む主資料）
 *     │   ├── tables.md          … 表をTSV化（rowspan/colspan解決済み）
 *     │   ├── screens/full.jpg   … フルページ。人間が確認するための資料
 *     │   ├── screens/01.jpg…    … 1280x1400pxのタイル。モデルが見る用
 *     │   │                         （フルページは縮小されて判読できない）
 *     │   ├── metadata.json      … 指定URL/最終URL/タイトル/HTTP status/取得日時/ハッシュ等
 *     │   ├── page.html          … JavaScript実行後のHTML（原則読まない）
 *     │   ├── links.json         … ページ内リンク一覧（追加取得の候補確認用）
 *     │   └── network/           … 料金に関係しうる同一サイトのJSONレスポンス
 *     └── downloads/             … --download で指定した公式PDF・料金画像など
 *                                   （PDFはReadツールが直接読めるので変換しない）
 *
 * 使い方:
 *   node capture-sources.mjs --resort <id> --season <id> \
 *       [--source-dir <lift-ticket-sourceディレクトリ>] [--out <lift-ticketルートdir>] \
 *       [--url <追加URL>]... \
 *       [--download <PDF/画像URL>]... [--linked-from <URL>] [--headed]
 *       [--accept-season] [--follow-links] [--max-followed <件数>]
 *
 *   URL登録ファイルは <source-dir>/{resort-id}.json （既定は
 *   src/private/data/lift-ticket-source/）。スキー場IDはファイル名が正本で、
 *   URLはシーズンに紐づかない恒久的なリスト。
 *
 *   --season は「取得した資料をどのシーズンとして保存するか」の保存先指定
 *   （取得前の宣言）であり、URLの絞り込みではない。取得後に、資料が本当に
 *   そのシーズンの情報かを内容から自動判定する（seasonDetect.mjs）。
 *   一致しない・判定できない場合は警告して異常終了し、以降の処理を止める。
 *   人間が確認したうえで続行する場合のみ --accept-season を付ける。
 *
 *   --follow-links を付けると、**指定URLのページに貼られたリンクを1階層だけ辿る**。
 *   同じ公式ドメイン内で、料金・営業・割引に関係しそうなリンクだけを対象にし、
 *   シーズン券などの収集対象外は除外する。辿った先のリンクは辿らない
 *   （再帰するとサイト全巡回になる）。既定の上限は12件（--max-followed で変更）。
 *   追跡で取ったページは manifest に user_specified: false / linked_from 付きで記録され、
 *   抽出担当はそれを sources[].linked_from_source_id に写す。
 *
 * 方針:
 *   - 検索エンジンでの情報源探索は行わない。登録ファイル / --url / --download /
 *     --follow-links（指定URLからのリンク）で得たURLのみアクセスする。
 *   - Cookie同意・タブ・アコーディオンなど表示に必要な最低限の操作のみ行う。
 *     ログイン回避やアクセス制限の回避は行わない。
 *   - このスクリプトは証拠保存のみを行い、料金JSONは作成しない。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { SKILL_DIR } from "./_lib.mjs";
import {
  extractTablesInPage,
  jpegSize,
  renderTablesMarkdown,
  tileRanges,
} from "./pageAssets.mjs";
import { detectSeason, formatSeasonReport } from "./seasonDetect.mjs";

const REPO_ROOT = path.resolve(SKILL_DIR, "..", "..", "..");
// スキー場1件のデータは1ディレクトリにまとめる:
//   lift-ticket/{resort-id}/{sources,tickets,audits}/
const DEFAULT_OUT = path.join(
  REPO_ROOT,
  "src",
  "private",
  "data",
  "lift-ticket",
);
const DEFAULT_SOURCE_DIR = path.join(
  REPO_ROOT,
  "src",
  "private",
  "data",
  "lift-ticket-source",
);

// スクリーンショットのJPEG品質。実測で料金の数字・小さい注記とも判読可能
const JPEG_QUALITY = 80;
const MAX_NETWORK_RESPONSES_PER_PAGE = 50;
const MAX_NETWORK_BODY_BYTES = 2 * 1024 * 1024;
/** リンク追跡で取る件数の上限（既定）。無制限にすると保存資料が膨らむ */
const DEFAULT_MAX_FOLLOWED = 12;

const OUT_OF_SCOPE_SOURCE_PATTERN =
  /シーズン券|season(?:[-_\s]?)(?:pass|ticket|price)/iu;

function isOutOfScopeSource(...values) {
  return OUT_OF_SCOPE_SOURCE_PATTERN.test(
    values.filter((value) => typeof value === "string").join(" "),
  );
}

/**
 * リンク追跡で拾う候補かどうか。
 *
 * ★**指定URLに貼られたリンクは辿ってよい**が、サイト全体を巡回してはいけない。
 * 料金・営業・割引に関係しそうなリンクだけに絞る（会社概要やSNSまで
 * 取ると保存資料が膨らみ、抽出担当が読む量だけ増える）。
 */
const FOLLOW_HINT_PATTERN =
  /料金|価格|리프트|lift|ticket|price|fee|営業|時間|hours|calendar|カレンダー|割引|クーポン|coupon|discount|キャンペーン|campaign|前売|web|オンライン|online|購入|shop|store|イベント|event|レッスン|スクール|school|セット|パック|pack|宿泊|stay|温泉|規約|terms|pdf/iu;

/** 追跡しないリンク（外部サイト・SNS・問い合わせ・画像以外のファイル） */
const FOLLOW_DENY_PATTERN =
  /twitter|x\.com|facebook|instagram|youtube|line\.me|tiktok|mailto:|tel:|\.(?:zip|docx?|xlsx?|pptx?|mp4|mov)$|privacy|プライバシー|会社概要|company|recruit|採用|sitemap|問い合わせ|contact/iu;

function parseArgs(argv) {
  const opts = { urls: [], downloads: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--from-registry":
        opts.fromRegistry = true;
        break;
      case "--source-dir":
        opts.sourceDir = argv[++i];
        opts.fromRegistry = true;
        break;
      case "--resort":
        opts.resort = argv[++i];
        break;
      case "--season":
        opts.season = argv[++i];
        break;
      case "--out":
        opts.out = argv[++i];
        break;
      case "--url":
        opts.urls.push(argv[++i]);
        break;
      case "--download":
        opts.downloads.push(argv[++i]);
        break;
      case "--linked-from":
        opts.linkedFrom = argv[++i];
        break;
      case "--headed":
        opts.headed = true;
        break;
      case "--accept-season":
        opts.acceptSeason = true;
        break;
      case "--follow-links":
        opts.followLinks = true;
        break;
      case "--max-followed":
        opts.maxFollowed = Number(argv[++i]);
        break;
      default:
        console.error(`不明な引数: ${arg}`);
        process.exit(2);
    }
  }
  return opts;
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * URL登録ファイルを読む。スキー場1件＝1ファイル
 * （<sourceDir>/{resort-id}.json）で、スキー場IDはファイル名が正本。
 * ファイル内にはスキー場IDもスキー場名も持たせない。
 *
 * URLはシーズンに紐づかない。同じURLをシーズンをまたいで再取得し、
 * 取得した料金がどのシーズンのものかはページの内容から判定する
 * （--season は絞り込み条件ではなく保存先の指定）。
 */
function loadRegistryUrls(sourceDir, resortId) {
  const registryPath = path.join(sourceDir, `${resortId}.json`);
  if (!fs.existsSync(registryPath)) {
    throw new Error(
      `URL登録ファイルがありません: ${registryPath}\n` +
        `templates/source-urls.template.json をコピーして作成してください。`,
    );
  }
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const urls = registry.urls;
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error(`${registryPath} に urls がありません`);
  }
  return urls.map((entry) => {
    const url = typeof entry === "string" ? entry : entry.url;
    const label = typeof entry === "string" ? "" : entry.label_ja;
    if (isOutOfScopeSource(url, label)) {
      throw new Error(
        `収集対象外のシーズン券URLです。${registryPath} から削除してください: ${url}`,
      );
    }
    return url;
  });
}

function loadManifest(manifestPath, resortId, seasonId) {
  if (fs.existsSync(manifestPath)) {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  }
  return {
    resort_id: resortId,
    season_id: seasonId,
    created_at: nowIso(),
    updated_at: null,
    pages: [],
    downloads: [],
  };
}

/**
 * 同じURLを取り直す場合は既存のpageディレクトリを使い回す。
 *
 * 追記のみにすると、シーズンを取り直すたびに page-005..008 が
 * page-001..004 と同じURLで積み上がり、抽出担当が同じページを2回読むことになる。
 * （例: gitに含まれない screens/ を再生成するために取り直すケース）
 * 追加取得したPDF等の別URLは新しい番号を取るので上書きされない。
 */
function pageIdFor(manifest, url) {
  const existing = manifest.pages.find((p) => p.requested_url === url);
  if (existing) return { pageId: existing.id, replaced: true };
  const nums = manifest.pages
    .map((p) => /^page-(\d+)$/.exec(p.id)?.[1])
    .filter(Boolean)
    .map(Number);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return { pageId: `page-${String(next).padStart(3, "0")}`, replaced: false };
}

function looksPriceRelated(text) {
  return /料金|価格|リフト券|チケット|ticket|price|円|yen|¥/i.test(text);
}

async function dismissCookieBanners(page, notes) {
  const patterns = [/同意/, /承諾/, /^OK$/i, /^Accept/i, /^閉じる$/, /^Close$/i];
  for (const pattern of patterns) {
    try {
      const button = page
        .locator("button, [role=button], a")
        .filter({ hasText: pattern })
        .first();
      if (await button.isVisible({ timeout: 500 })) {
        await button.click({ timeout: 2000, noWaitAfter: true });
        notes.push(`cookie/バナー操作: ${pattern} をクリック`);
        await page.waitForTimeout(500);
        return;
      }
    } catch {
      // クリック失敗は無視して次のパターンへ
    }
  }
}

async function expandCollapsedContent(page, notes) {
  try {
    const opened = await page.evaluate(() => {
      let n = 0;
      for (const d of document.querySelectorAll("details:not([open])")) {
        d.setAttribute("open", "");
        n++;
      }
      return n;
    });
    if (opened > 0) notes.push(`details要素を${opened}件展開`);
  } catch {
    // 無視
  }

  try {
    const toggles = page.locator(
      "summary[aria-expanded=false], button[aria-expanded=false]",
    );
    const count = Math.min(await toggles.count(), 15);
    for (let i = 0; i < count; i++) {
      try {
        await toggles.nth(i).click({ timeout: 1000, noWaitAfter: true });
      } catch {
        // 個別クリック失敗は無視
      }
    }
    if (count > 0) notes.push(`アコーディオン等を最大${count}件クリック`);
  } catch {
    // 無視
  }

  try {
    const tabs = page.locator("[role=tab]");
    const count = Math.min(await tabs.count(), 10);
    for (let i = 0; i < count; i++) {
      try {
        await tabs.nth(i).click({ timeout: 1000, noWaitAfter: true });
        await page.waitForTimeout(300);
      } catch {
        // 個別クリック失敗は無視
      }
    }
    if (count > 0) notes.push(`タブを${count}件順にクリック`);
  } catch {
    // 無視
  }
}

/**
 * 表をTSVとして保存する。innerText が復元不可能に壊す唯一の情報が
 * 表の行と列の対応なので、ここだけコードで確定させる。
 */
async function captureTables(page, pageDir, notes) {
  let tables;
  try {
    tables = await page.evaluate(extractTablesInPage);
  } catch (err) {
    notes.push(`表の抽出に失敗: ${err.message}`);
    return 0;
  }
  fs.writeFileSync(
    path.join(pageDir, "tables.md"),
    renderTablesMarkdown(path.basename(pageDir), tables),
  );
  if (tables.length > 0) {
    notes.push(
      `表を${tables.length}件TSV化（セル結合あり: ${tables.filter((t) => t.hasMergedCells).length}件）`,
    );
  }
  return tables.length;
}

/**
 * スクリーンショットを保存する。
 *
 * フルページ1枚は人間の確認用。モデルに渡すと長辺1568pxに縮小され
 * （実測 1280x7785 → 329x2000）数字が判読できないため、固定高さの
 * タイルも保存する。DOM構造を見ないので、表・箇条書き・バナー画像・
 * canvas に等しく効く。
 */
async function captureScreens(page, pageDir, notes) {
  const screensDir = path.join(pageDir, "screens");
  fs.mkdirSync(screensDir, { recursive: true });

  // JPEG品質80。実測でPNGの1/4以下になり、料金の数字も小さい注記も
  // 判読できることを確認済み（PNG 785KB → JPEG q80 181KB / 1タイル）
  const shot = { type: "jpeg", quality: JPEG_QUALITY, scale: "css" };

  // scale: "css" でCSSピクセル等倍に固定する
  const fullPath = path.join(screensDir, "full.jpg");
  await page.screenshot({ ...shot, path: fullPath, fullPage: true });

  // ページ高さは撮影済みフルページの実寸から読む。
  // scrollHeight はレイアウト次第でビューポート高しか返さないことがあり
  // （実測: めがひらは縦7785pxのページで900pxを返した）、
  // タイルが1枚しか作られず判読不能なままになる
  const { width: viewportWidth, height: pageHeight } = jpegSize(
    fs.readFileSync(fullPath),
  );
  const ranges = tileRanges(pageHeight);
  let saved = 0;
  for (const [i, range] of ranges.entries()) {
    const name = `${String(i + 1).padStart(2, "0")}.jpg`;
    try {
      // fullPage を付けないと clip がビューポートに制限され、
      // 1枚目より下のタイルが "Clipped area is outside" で失敗する
      await page.screenshot({
        ...shot,
        path: path.join(screensDir, name),
        fullPage: true,
        clip: { x: 0, y: range.y, width: viewportWidth, height: range.height },
      });
      saved++;
    } catch (err) {
      notes.push(`タイル${name}の保存に失敗: ${err.message}`);
    }
  }
  notes.push(`スクリーンショット: フルページ1枚＋タイル${saved}枚（縦${pageHeight}px）`);
  return saved;
}

async function capturePage(context, url, pageDir, resortId, seasonId) {
  fs.mkdirSync(path.join(pageDir, "network"), { recursive: true });
  const notes = [];
  const networkEntries = [];
  const page = await context.newPage();

  page.on("response", async (response) => {
    if (networkEntries.length >= MAX_NETWORK_RESPONSES_PER_PAGE) return;
    try {
      const ct = response.headers()["content-type"] ?? "";
      if (!/json/i.test(ct)) return;
      const respUrl = response.url();
      if (/google-analytics|googletagmanager|doubleclick|facebook|hotjar/i.test(respUrl)) {
        return;
      }
      const body = await response.body();
      if (body.length > MAX_NETWORK_BODY_BYTES) return;
      const text = body.toString("utf8");
      const priceRelated = looksPriceRelated(respUrl) || looksPriceRelated(text);
      const index = networkEntries.length + 1;
      const fileName = `response-${String(index).padStart(3, "0")}.json`;
      fs.writeFileSync(path.join(pageDir, "network", fileName), body);
      networkEntries.push({
        file: `network/${fileName}`,
        url: respUrl,
        status: response.status(),
        content_type: ct,
        bytes: body.length,
        price_related_guess: priceRelated,
        sha256: sha256(body),
      });
    } catch {
      // レスポンス保存失敗は無視（証跡はmetadataのnotesに残さない程度の欠落）
    }
  });

  const metadata = {
    requested_url: url,
    final_url: null,
    page_title: null,
    http_status: null,
    fetched_at: nowIso(),
    content_type: null,
    sha256_page_html: null,
    resort_id: resortId,
    season_id: seasonId,
    success: false,
    notes: notes,
  };

  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    metadata.http_status = response?.status() ?? null;
    metadata.content_type = response?.headers()["content-type"] ?? null;
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => notes.push("networkidle待機がタイムアウト（続行）"));

    await dismissCookieBanners(page, notes);
    await expandCollapsedContent(page, notes);
    await page
      .waitForLoadState("networkidle", { timeout: 5000 })
      .catch(() => {});

    const html = await page.content();
    fs.writeFileSync(path.join(pageDir, "page.html"), html);
    metadata.sha256_page_html = sha256(Buffer.from(html));

    const visibleText = await page.evaluate(() => document.body?.innerText ?? "");
    fs.writeFileSync(path.join(pageDir, "visible-text.txt"), visibleText);

    metadata.final_url = page.url();
    metadata.page_title = await page.title();
    metadata.tables_extracted = await captureTables(page, pageDir, notes);
    metadata.screen_tiles = await captureScreens(page, pageDir, notes);

    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]")).map((a) => ({
        href: a.href,
        text: (a.textContent ?? "").trim().slice(0, 200),
      })),
    );
    fs.writeFileSync(
      path.join(pageDir, "links.json"),
      JSON.stringify(links, null, 2),
    );

    metadata.success = true;
  } catch (err) {
    notes.push(`取得失敗: ${err.message}`);
  } finally {
    fs.writeFileSync(
      path.join(pageDir, "network", "index.json"),
      JSON.stringify(networkEntries, null, 2),
    );
    fs.writeFileSync(
      path.join(pageDir, "metadata.json"),
      JSON.stringify(metadata, null, 2),
    );
    await page.close();
  }

  return { metadata, networkCount: networkEntries.length };
}

function extFromContentType(ct, url) {
  if (/pdf/i.test(ct)) return ".pdf";
  if (/png/i.test(ct)) return ".png";
  if (/jpe?g/i.test(ct)) return ".jpg";
  if (/webp/i.test(ct)) return ".webp";
  if (/gif/i.test(ct)) return ".gif";
  if (/json/i.test(ct)) return ".json";
  if (/html/i.test(ct)) return ".html";
  const urlExt = path.extname(new URL(url).pathname);
  return urlExt || ".bin";
}

async function downloadAsset(context, url, downloadsDir, linkedFrom) {
  fs.mkdirSync(downloadsDir, { recursive: true });
  const entry = {
    url,
    linked_from: linkedFrom ?? null,
    fetched_at: nowIso(),
    http_status: null,
    content_type: null,
    file: null,
    sha256: null,
    bytes: null,
    success: false,
    notes: [],
  };
  try {
    const response = await context.request.get(url, { timeout: 45000 });
    entry.http_status = response.status();
    entry.content_type = response.headers()["content-type"] ?? null;
    if (!response.ok()) {
      entry.notes.push(`HTTPエラー: ${response.status()}`);
    } else {
      const body = await response.body();
      const base = path
        .basename(new URL(url).pathname)
        .replace(/[^A-Za-z0-9._-]/g, "_")
        .replace(/\.[^.]*$/, "")
        .slice(0, 60) || "download";
      const ext = extFromContentType(entry.content_type ?? "", url);
      const hash = sha256(body);
      const fileName = `${base}-${hash.slice(0, 8)}${ext}`;
      fs.writeFileSync(path.join(downloadsDir, fileName), body);
      entry.file = `downloads/${fileName}`;
      entry.sha256 = hash;
      entry.bytes = body.length;
      entry.success = true;
    }
  } catch (err) {
    entry.notes.push(`取得失敗: ${err.message}`);
  }
  return entry;
}

/**
 * ページとして開くのではなくファイルとして保存すべきURLか。
 * PDFや画像を page.goto で開こうとするとダウンロードが始まって失敗する
 * （リンク追跡の主目的が料金PDFなので、ここを間違えると意味がない）。
 */
function isFileAsset(url) {
  try {
    return /\.(?:pdf|png|jpe?g|gif|webp|svg)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** URLを比較用に正規化する（末尾スラッシュ・フラグメント・追跡パラメータを無視） */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^utm_|^fbclid$|^gclid$/i.test(key)) parsed.searchParams.delete(key);
    }
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/**
 * 保存済みページの links.json から、追加取得する候補を集める。
 *
 * ★**同じ公式ドメイン内のリンクを1階層だけ辿る。** 辿った先のリンクは辿らない
 * （「指定URLに貼られたリンク」までが範囲。再帰するとサイト全巡回になる）。
 * シーズン券などの収集対象外は除外する。
 */
function collectFollowCandidates(seasonDir, manifest, alreadyCaptured, limit) {
  const candidates = new Map();
  for (const page of manifest.pages) {
    if (!page.success) continue;
    const linksPath = path.join(seasonDir, page.dir, "links.json");
    if (!fs.existsSync(linksPath)) continue;
    let links;
    try {
      links = JSON.parse(fs.readFileSync(linksPath, "utf8"));
    } catch {
      continue;
    }
    const parentUrl = page.final_url ?? page.requested_url;
    let parentHost;
    try {
      parentHost = new URL(parentUrl).host;
    } catch {
      continue;
    }
    for (const link of Array.isArray(links) ? links : []) {
      const href = link?.href;
      if (typeof href !== "string" || !/^https?:/i.test(href)) continue;
      let host;
      try {
        host = new URL(href).host;
      } catch {
        continue;
      }
      // 公式サイトの外へは出ない
      if (host !== parentHost) continue;
      const key = normalizeUrl(href);
      if (alreadyCaptured.has(key) || candidates.has(key)) continue;
      const text = typeof link.text === "string" ? link.text : "";
      if (FOLLOW_DENY_PATTERN.test(`${href} ${text}`)) continue;
      if (isOutOfScopeSource(href, text)) continue;
      if (!FOLLOW_HINT_PATTERN.test(`${href} ${text}`)) continue;
      candidates.set(key, { url: href, text, linkedFrom: parentUrl });
    }
  }
  return [...candidates.values()].slice(0, limit);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.resort || !opts.season) {
    console.error(
      "使い方: node capture-sources.mjs --resort <id> --season <id> --from-registry [--source-dir dir] [--out dir] [--url URL]... [--download URL]... [--follow-links] [--max-followed N]",
    );
    process.exit(2);
  }

  const urls = [...opts.urls];
  if (opts.fromRegistry) {
    urls.unshift(
      ...loadRegistryUrls(opts.sourceDir ?? DEFAULT_SOURCE_DIR, opts.resort),
    );
  }
  for (const url of [...urls, ...opts.downloads]) {
    if (isOutOfScopeSource(url)) {
      console.error(`収集対象外のシーズン券URLです: ${url}`);
      process.exit(2);
    }
  }
  if (urls.length === 0 && opts.downloads.length === 0) {
    console.error(
      "取得対象URLがありません。URL登録ファイル（lift-ticket-source/{resort-id}.json）にURLを登録して --from-registry を付けるか、--url / --download で指定してください。",
    );
    process.exit(2);
  }

  const outRoot = opts.out ?? DEFAULT_OUT;
  const seasonDir = path.join(outRoot, opts.resort, "sources", opts.season);
  fs.mkdirSync(seasonDir, { recursive: true });
  const manifestPath = path.join(seasonDir, "manifest.json");
  const manifest = loadManifest(manifestPath, opts.resort, opts.season);

  const browser = await chromium.launch({ headless: !opts.headed });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ja-JP",
  });

  /**
   * URLを順に取得して manifest に記録する。
   * リンク追跡でも同じ手順を使うので関数にしてある。
   */
  const capturePages = async (targets) => {
    let failed = 0;
    for (const target of targets) {
      const url = typeof target === "string" ? target : target.url;
      const linkedFrom = typeof target === "string" ? null : target.linkedFrom;
      const { pageId, replaced } = pageIdFor(manifest, url);
      const pageDir = path.join(seasonDir, pageId);
      if (replaced) {
        // 古い資料（前回のスクショ・表・テキスト）を残さず入れ替える
        fs.rmSync(pageDir, { recursive: true, force: true });
      }
      console.log(
        `[capture] ${pageId}${replaced ? "（取り直し）" : ""}${linkedFrom ? "（リンク追跡）" : ""}: ${url}`,
      );
      const { metadata, networkCount } = await capturePage(
        context,
        url,
        pageDir,
        opts.resort,
        opts.season,
      );
      if (
        isOutOfScopeSource(
          metadata.requested_url,
          metadata.final_url,
          metadata.page_title,
        )
      ) {
        fs.rmSync(pageDir, { recursive: true, force: true });
        console.error(
          `[capture] 収集対象外のシーズン券ページを破棄しました: ${url}`,
        );
        // リンク追跡で拾ったものは失敗ではない（除外できたのは正常）
        if (linkedFrom == null) failed++;
        continue;
      }
      const pageEntry = {
        id: pageId,
        dir: pageId,
        requested_url: url,
        final_url: metadata.final_url,
        page_title: metadata.page_title,
        http_status: metadata.http_status,
        fetched_at: metadata.fetched_at,
        sha256_page_html: metadata.sha256_page_html,
        success: metadata.success,
        network_responses_saved: networkCount,
        tables_extracted: metadata.tables_extracted ?? 0,
        screen_tiles: metadata.screen_tiles ?? 0,
        // ユーザー指定URLか、そこから辿ったリンクかを区別する。
        // 抽出担当が sources[].user_specified / linked_from_source_id を書くのに使う
        user_specified: linkedFrom == null,
        linked_from: linkedFrom,
      };
      const existingIndex = manifest.pages.findIndex((p) => p.id === pageId);
      if (existingIndex >= 0) {
        manifest.pages[existingIndex] = pageEntry;
      } else {
        manifest.pages.push(pageEntry);
      }
      if (!metadata.success) {
        failed++;
        console.error(`[capture] 失敗: ${url} (${metadata.notes.join(" / ")})`);
      }
    }
    return failed;
  };

  let failures = 0;
  try {
    failures += await capturePages(urls);

    // ★指定URLに貼られたリンクを1階層だけ辿る。
    // 料金PDFやキャンペーンページが別ページに分かれているサイトが多い
    if (opts.followLinks) {
      const captured = new Set(
        manifest.pages.flatMap((page) =>
          [page.requested_url, page.final_url]
            .filter(Boolean)
            .map((value) => normalizeUrl(value)),
        ),
      );
      const limit = Number.isFinite(opts.maxFollowed)
        ? Math.max(0, opts.maxFollowed)
        : DEFAULT_MAX_FOLLOWED;
      const candidates = collectFollowCandidates(
        seasonDir,
        manifest,
        captured,
        limit,
      );
      console.log("");
      console.log(
        `[follow] 指定URLから辿る候補: ${candidates.length}件（上限 ${limit}）`,
      );
      for (const candidate of candidates) {
        console.log(
          `  - ${candidate.url}${candidate.text ? ` … ${candidate.text}` : ""}`,
        );
      }
      // PDF・画像はページとして開けないのでファイルとして保存する
      const followPages = candidates.filter(
        (candidate) => !isFileAsset(candidate.url),
      );
      const followAssets = candidates.filter((candidate) =>
        isFileAsset(candidate.url),
      );
      failures += await capturePages(followPages);
      for (const candidate of followAssets) {
        console.log(`[download]（リンク追跡） ${candidate.url}`);
        const entry = await downloadAsset(
          context,
          candidate.url,
          path.join(seasonDir, "downloads"),
          candidate.linkedFrom,
        );
        manifest.downloads.push(entry);
        if (!entry.success) {
          console.error(
            `[download] 失敗: ${candidate.url} (${entry.notes.join(" / ")})`,
          );
        }
      }
    }

    for (const url of opts.downloads) {
      console.log(`[download] ${url}`);
      const entry = await downloadAsset(
        context,
        url,
        path.join(seasonDir, "downloads"),
        opts.linkedFrom,
      );
      manifest.downloads.push(entry);
      if (!entry.success) {
        failures++;
        console.error(`[download] 失敗: ${url} (${entry.notes.join(" / ")})`);
      }
    }
  } finally {
    // シーズン判定は保存済みの全ページのテキスト・表を根拠にする。
    // --season は人間の宣言なので、内容と照合しないと前シーズンの料金を
    // 新シーズンとして確定してしまう（11月時点では未更新のサイトが普通にある）
    manifest.season_check = checkSeason(seasonDir, manifest, opts);
    manifest.updated_at = nowIso();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    await context.close();
    await browser.close();
  }

  console.log(
    `完了: pages=${manifest.pages.length}, downloads=${manifest.downloads.length}, 失敗=${failures}`,
  );
  console.log(`manifest: ${manifestPath}`);

  const check = manifest.season_check;
  console.log("");
  console.log(formatSeasonReport(check));
  if (check.verdict !== "match") {
    if (opts.acceptSeason) {
      console.log("");
      console.log(
        "  ※ --accept-season が指定されているため続行します（人間の確認済みとして扱う）",
      );
    } else {
      // 抽出以降の処理を確実に止めるため異常終了する
      process.exit(3);
    }
  }
  process.exit(failures > 0 ? 1 : 0);
}

/** 保存済み資料のテキストからシーズンを判定する */
function checkSeason(seasonDir, manifest, opts) {
  const pages = manifest.pages.map((page) => {
    const readIfExists = (name) => {
      const filePath = path.join(seasonDir, page.dir, name);
      return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
    };
    return {
      pageId: page.id,
      title: page.page_title,
      // 表のTSVにも「12/26（金）」のような日付が入るので両方を根拠にする
      text: `${readIfExists("visible-text.txt")}\n${readIfExists("tables.md")}`,
    };
  });
  const referenceYear = new Date().getUTCFullYear();
  const check = detectSeason(pages, opts.season, referenceYear);
  check.accepted_by_human = Boolean(opts.acceptSeason);
  check.checked_at = nowIso();
  return check;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
