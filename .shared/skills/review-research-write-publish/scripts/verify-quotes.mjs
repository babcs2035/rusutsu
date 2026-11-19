// detail.json（または調査担当の部分JSON）に書かれた review の quote が、
// 元ページの本文に実在するかを機械的に照合する。
//
//   node verify-quotes.mjs <json> [--out <report.json>]
//
// 判定:
//   ok       引用が本文にそのまま見つかった
//   partial  句読点で区切った断片の一部だけ見つかった（言い換え・継ぎはぎの疑い）
//   missing  本文に見つからない
//   unread   取得できない、または本文がスクリプト描画でHTMLに無い（人がブラウザで確かめる）
//   noquote  review なのに quote が空（照合対象なし）
import { promises as fs } from "node:fs";
import process from "node:process";

const args = process.argv.slice(2);
const input = args.find(arg => !arg.startsWith("--"));
const outIndex = args.indexOf("--out");
const outPath = outIndex >= 0 ? args[outIndex + 1] : null;
if (!input) {
  console.error("usage: node verify-quotes.mjs <json> [--out <report.json>]");
  process.exit(2);
}

const collect = (node, trail, found) => {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collect(item, `${trail}[${index}]`, found));
  } else if (node && typeof node === "object") {
    if (typeof node.url === "string" && "quote" in node && "type" in node) {
      found.push({ at: trail, ...node });
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      collect(value, trail ? `${trail}.${key}` : key, found);
    }
  }
  return found;
};

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodeEntities = text =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name] ?? whole);

// 表記ゆれ（全角半角・空白・波ダッシュ・引用符）だけを吸収する。語句の違いは吸収しない。
const normalize = text =>
  text
    .normalize("NFKC")
    .replace(/[\s​　]+/g, "")
    .replace(/[〜~∼]/g, "~")
    .replace(/[“”„‟"'‘’`]/g, "'")
    .replace(/[‐‑‒–—―ー－-]/g, "-")
    .toLowerCase();

const pageText = html =>
  decodeEntities(
    html
      .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, (block, tag) =>
        // JSON埋め込み（JSON-LD・Next.jsなど）は本文を含むことがあるので残す
        tag.toLowerCase() === "script" && /application\/(ld\+)?json/i.test(block)
          ? block.replace(/\\n/g, " ").replace(/\\"/g, '"')
          : " ",
      )
      .replace(/<[^>]+>/g, " "),
  );

const decodeBody = (buffer, contentType) => {
  const head = new TextDecoder("latin1").decode(buffer.slice(0, 4096));
  const charset = (
    /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ??
    "utf-8"
  ).toLowerCase();
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
};

const pages = new Map();
const fetchPage = async url => {
  if (pages.has(url)) return pages.get(url);
  const result = (async () => {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          "accept-language": "ja,en;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const buffer = new Uint8Array(await response.arrayBuffer());
      const text = pageText(
        decodeBody(buffer, response.headers.get("content-type")),
      );
      return { text: normalize(text), length: text.length };
    } catch (error) {
      return { error: error?.cause?.code ?? error?.name ?? "fetch failed" };
    }
  })();
  pages.set(url, result);
  return result;
};

const judge = (quote, page) => {
  const target = normalize(quote);
  if (page.text.includes(target)) return { status: "ok" };
  const fragments = quote
    .split(/[。、.,!！?？\n「」『』（）()…]+/)
    .map(normalize)
    .filter(fragment => fragment.length >= 6);
  const hit = fragments.filter(fragment => page.text.includes(fragment));
  if (fragments.length > 0 && hit.length > 0) {
    return { status: "partial", note: `${hit.length}/${fragments.length}断片` };
  }
  // 本文がほぼ無いページは、スクリプト描画で読めていない可能性が高い
  if (page.length < 1500) return { status: "unread", note: "本文が取得できない" };
  return { status: "missing" };
};

const sources = collect(JSON.parse(await fs.readFile(input, "utf8")), "", []);
const reviews = sources.filter(source => source.type === "review");
const queue = [...reviews];
const rows = [];
const worker = async () => {
  for (let source = queue.shift(); source; source = queue.shift()) {
    const quote = (source.quote ?? "").trim();
    if (!quote) {
      rows.push({ status: "noquote", at: source.at, url: source.url });
      continue;
    }
    const page = await fetchPage(source.url);
    const verdict = page.error
      ? { status: "unread", note: page.error }
      : judge(quote, page);
    rows.push({ ...verdict, at: source.at, url: source.url, quote });
  }
};
await Promise.all(Array.from({ length: 5 }, worker));

const order = ["missing", "partial", "unread", "noquote", "ok"];
rows.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
const count = Object.fromEntries(
  order.map(status => [status, rows.filter(r => r.status === status).length]),
);
for (const row of rows.filter(row => row.status !== "ok")) {
  console.log(
    `[${row.status}] ${row.at}${row.note ? ` (${row.note})` : ""}\n  ${row.url}${row.quote ? `\n  「${row.quote.slice(0, 80)}」` : ""}`,
  );
}
const urls = new Set(reviews.map(source => source.url));
console.log(
  `\nreview出典 ${reviews.length}件 / URL ${urls.size}件（official ${sources.length - reviews.length}件は対象外）: ` +
    order.map(status => `${status} ${count[status]}`).join(", "),
);
if (outPath) {
  await fs.writeFile(outPath, `${JSON.stringify({ count, rows }, null, 2)}\n`);
}
process.exit(count.missing + count.partial > 0 ? 1 : 0);
