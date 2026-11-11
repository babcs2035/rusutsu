#!/usr/bin/env node
// Wayback Machine の CDX API から、営業期間（既定 12〜3月）のスナップショットを探す。
//
// 1ページの冬季スナップショット:
//   node .shared/skills/build-ski-resort-latest-crawler/scripts/find-winter-snapshots.mjs \
//     --url 'https://example.com/gelande/' [--limit 10]
//
// 公式ドメイン内で冬だけ存在したページの候補（URL一覧）:
//   node .../find-winter-snapshots.mjs --prefix 'https://example.com/' \
//     --grep 'lift|course|gelande|snow|condition|info' [--limit 50]
//
// 出力は JSON。replay は人が開くURL、raw はクローラーの再生と同じ id_ 形式。
// 候補を見つける道具であり、採用判断は実際に開いた本文で行う。
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    prefix: { type: "string" },
    grep: { type: "string" },
    months: { type: "string", default: "12,1,2,3" },
    from: { type: "string" },
    limit: { type: "string", default: "10" },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(
    "Usage: find-winter-snapshots.mjs (--url <url> | --prefix <url> [--grep <regex>]) [--months 12,1,2,3] [--from YYYY] [--limit 10]",
  );
  process.exit(0);
}
const target = values.url ?? values.prefix;
if (!target || (values.url && values.prefix)) {
  console.error("Use exactly one of --url or --prefix");
  process.exit(2);
}
const months = new Set(values.months.split(",").map(m => Number(m.trim())));
const limit = Number(values.limit);
const from = values.from ?? String(new Date().getFullYear() - 3);
const pattern = values.grep ? new RegExp(values.grep, "i") : null;

const params = new URLSearchParams({
  url: target.replace(/^https?:\/\//, "").replace(/#.*$/, ""),
  output: "json",
  from,
  fl: "timestamp,original,statuscode,mimetype",
  filter: "statuscode:200",
});
if (values.prefix) {
  params.set("matchType", "prefix");
  params.set("collapse", "urlkey");
  params.set("limit", "20000");
} else {
  params.set("collapse", "timestamp:8");
}
params.append("filter", "mimetype:text/html");

async function fetchCdx() {
  const endpoint = `https://web.archive.org/cdx/search/cdx?${params}`;
  let lastError;
  // Wayback は連続アクセスで拒否しやすいので、間隔を広げて最大3回まで。
  for (const wait of [0, 5000, 15000]) {
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`CDX HTTP ${response.status}`);
      const text = await response.text();
      return text.trim() ? JSON.parse(text) : [];
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const rows = (await fetchCdx()).slice(1);
const inSeason = ts => months.has(Number(ts.slice(4, 6)));
const snapshot = (ts, original) => ({
  timestamp: ts,
  original,
  replay: `https://web.archive.org/web/${ts}/${original}`,
  raw: `https://web.archive.org/web/${ts}id_/${original}`,
});

if (values.url) {
  const winter = rows
    .filter(([ts]) => inSeason(ts))
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, limit)
    .map(([ts, original]) => snapshot(ts, original));
  const latestAny = rows.at(-1);
  console.log(
    JSON.stringify(
      {
        url: values.url,
        months: [...months],
        from,
        totalSnapshots: rows.length,
        latestSnapshot: latestAny ? latestAny[0] : null,
        winterSnapshots: winter,
      },
      null,
      2,
    ),
  );
} else {
  // prefix は urlkey で畳むため timestamp は各URLの最初の保存日時。
  // 季節で絞らず候補URLだけ返し、各URLは --url で冬季版を確認する。
  const candidates = rows
    .filter(([, original]) => !pattern || pattern.test(original))
    .filter(
      ([, original]) =>
        !/\.(css|js|png|jpe?g|gif|svg|pdf)(\?|$)/i.test(original),
    )
    .slice(0, limit)
    .map(([ts, original]) => ({ firstSeen: ts, original }));
  console.log(
    JSON.stringify(
      {
        prefix: values.prefix,
        grep: values.grep ?? null,
        from,
        matched: candidates.length,
        candidates,
      },
      null,
      2,
    ),
  );
}
