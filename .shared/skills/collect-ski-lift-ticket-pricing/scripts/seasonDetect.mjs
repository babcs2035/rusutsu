/**
 * seasonDetect.mjs
 *
 * 保存資料の内容から「この料金はどのシーズンのものか」を機械的に判定する。
 *
 * 必要な理由:
 * 運用は毎年10〜11月に登録URLを一括で取り直す形になる。ところが11月時点では
 * 公式サイトがまだ前シーズンの料金を表示していることが普通にある。
 * これを新シーズンとして保存すると、前シーズンの料金が新シーズンのデータとして
 * 確定してしまう。--season は人間の宣言にすぎないので、内容と照合する必要がある。
 *
 * 判定の主軸は「日付＋曜日」である。
 * 「12/26（金）」のような表記は年が変われば曜日も変わるため、2件以上あれば
 * シーズンがほぼ一意に決まる。実測（めがひら）では17件のペアが
 * 2025-2026 だけで全件成立し、他の年は全件不一致だった。
 * 料金ページ自体に年号が1つも無くても、営業カレンダーやイベントページの
 * 日付から確定できる。これが複数URLを登録しておく価値でもある。
 *
 * 年号の直接表記（「2025.12～2026.3」「令和7年度」等）は補助的に使う。
 */

const WEEKDAY_CHARS = "日月火水木金土";
/** 「12/26（金）」「12月26日(金)」 */
const DATE_WEEKDAY_RE =
  /(\d{1,2})\s*(?:\/|月)\s*(\d{1,2})\s*日?\s*[（(]\s*([日月火水木金土])(?:曜日?)?\s*[）)]/g;
/** 「2025.12～2026.3」「2025年12月～2026年3月」 */
const YEAR_RANGE_RE =
  /(20\d\d)\s*[.年/-]\s*(\d{1,2})\s*月?\s*[~～\-–—]\s*(20\d\d)\s*[.年/-]\s*(\d{1,2})/g;
/** 単独の西暦 */
const YEAR_RE = /20\d\d/g;
/** 「令和7年度」→ 2025 */
const REIWA_RE = /令和\s*(\d{1,2})\s*年/g;
/** 「2025-26シーズン」「25-26シーズン」 */
const SEASON_LABEL_RE = /(?:20)?(\d\d)\s*[-–/]\s*(?:20)?(\d\d)\s*シーズン/g;

/** シーズンは12月〜翌3月。9月以降は開始年、8月以前は翌年に属する */
const SEASON_START_MONTH = 9;

export function seasonIdOf(startYear) {
  return `${startYear}-${startYear + 1}`;
}

export function startYearOf(seasonId) {
  const match = /^(\d{4})-(\d{4})$/.exec(seasonId ?? "");
  return match ? Number(match[1]) : null;
}

/** 「日付（曜日）」のペアを抽出する */
export function extractDateWeekdayPairs(text) {
  const pairs = [];
  for (const match of (text ?? "").matchAll(DATE_WEEKDAY_RE)) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const weekday = WEEKDAY_CHARS.indexOf(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    pairs.push({ month, day, weekday, raw: match[0].replace(/\s+/g, "") });
  }
  // 同じ表記の重複は1件として扱う（同じ根拠を数え上げない）
  return [...new Map(pairs.map((p) => [p.raw, p])).values()];
}

/** そのシーズンだとして日付の曜日が合うか */
function pairMatchesSeason(pair, startYear) {
  const year = pair.month >= SEASON_START_MONTH ? startYear : startYear + 1;
  const date = new Date(Date.UTC(year, pair.month - 1, pair.day));
  // 2/30 のような存在しない日付は月が繰り上がるので弾く
  if (date.getUTCMonth() !== pair.month - 1 || date.getUTCDate() !== pair.day) {
    return false;
  }
  return date.getUTCDay() === pair.weekday;
}

/** 年号の直接表記から候補シーズンを拾う */
export function extractYearTokens(text) {
  const source = text ?? "";
  const tokens = [];
  const seasons = new Set();

  for (const match of source.matchAll(YEAR_RANGE_RE)) {
    const startYear = Number(match[1]);
    const startMonth = Number(match[2]);
    // 「2025.12～2026.3」なら 2025-2026 シーズン
    seasons.add(startMonth >= SEASON_START_MONTH ? startYear : startYear - 1);
    tokens.push(match[0].replace(/\s+/g, ""));
  }
  for (const match of source.matchAll(SEASON_LABEL_RE)) {
    const startYear = 2000 + Number(match[1]);
    seasons.add(startYear);
    tokens.push(match[0].replace(/\s+/g, ""));
  }
  for (const match of source.matchAll(REIWA_RE)) {
    seasons.add(2018 + Number(match[1]));
    tokens.push(match[0].replace(/\s+/g, ""));
  }
  const years = [...new Set([...source.matchAll(YEAR_RE)].map((m) => Number(m[0])))];
  for (const year of years) tokens.push(String(year));

  return {
    tokens: [...new Set(tokens)],
    // 範囲・シーズン表記から確定できたシーズン
    seasonsFromRanges: [...seasons].sort(),
    years: years.sort(),
  };
}

/**
 * 候補シーズンを絞る。全ての日付＋曜日ペアを満たすシーズンだけを返す。
 * 1つも満たすものが無い場合は、ページ間で年が矛盾している（＝一部のページだけ
 * 新シーズンに更新されている）可能性がある。
 */
export function candidateSeasons(pairs, searchStartYears) {
  return searchStartYears.filter((startYear) =>
    pairs.every((pair) => pairMatchesSeason(pair, startYear)),
  );
}

/**
 * ページ単位のテキストからシーズンを判定する。
 *
 * @param {Array<{pageId: string, title?: string, text: string}>} pages
 * @param {string} declaredSeason  --season で宣言されたシーズン
 * @param {number} referenceYear   取得日の年（候補の探索範囲に使う）
 */
export function detectSeason(pages, declaredSeason, referenceYear) {
  const searchStartYears = [];
  for (let y = referenceYear - 3; y <= referenceYear + 1; y++) {
    searchStartYears.push(y);
  }
  const declaredStartYear = startYearOf(declaredSeason);
  if (declaredStartYear && !searchStartYears.includes(declaredStartYear)) {
    searchStartYears.push(declaredStartYear);
    searchStartYears.sort();
  }

  const byPage = {};
  const allPairs = [];
  const allTokens = new Set();
  const rangeSeasons = new Set();

  for (const page of pages) {
    const pairs = extractDateWeekdayPairs(page.text);
    const { tokens, seasonsFromRanges, years } = extractYearTokens(page.text);
    allPairs.push(...pairs);
    for (const token of tokens) allTokens.add(token);
    for (const season of seasonsFromRanges) rangeSeasons.add(season);
    byPage[page.pageId] = {
      title: page.title ?? null,
      weekday_pairs: pairs.length,
      // 各ページ単独で成立するシーズン。矛盾の切り分けに使う
      seasons_from_weekdays:
        pairs.length > 0
          ? candidateSeasons(pairs, searchStartYears).map(seasonIdOf)
          : [],
      seasons_from_year_ranges: seasonsFromRanges.map(seasonIdOf),
      years,
      examples: pairs.slice(0, 5).map((p) => p.raw),
    };
  }

  const uniquePairs = [...new Map(allPairs.map((p) => [p.raw, p])).values()];
  const weekdayCandidates = candidateSeasons(uniquePairs, searchStartYears);
  const rangeCandidates = [...rangeSeasons];

  let detected = null;
  let basis = null;
  let verdict = "undetermined";

  if (uniquePairs.length >= 2 && weekdayCandidates.length === 1) {
    // 最も強い根拠。日付と曜日の組み合わせが年を一意に決めている
    detected = seasonIdOf(weekdayCandidates[0]);
    basis = `日付＋曜日 ${uniquePairs.length}件が全件一致（他の年は不一致）`;
    verdict = "determined";
  } else if (uniquePairs.length >= 2 && weekdayCandidates.length === 0) {
    // どの年でも全件を説明できない = ページ間で年が混在している
    verdict = "conflicting";
    basis = `日付＋曜日 ${uniquePairs.length}件を1つのシーズンで説明できない`;
  } else if (uniquePairs.length >= 2 && weekdayCandidates.length > 1) {
    // 年号表記で絞れるか試す
    const narrowed = weekdayCandidates.filter((y) => rangeCandidates.includes(y));
    if (narrowed.length === 1) {
      detected = seasonIdOf(narrowed[0]);
      basis = `日付＋曜日の候補${weekdayCandidates.length}件を年号表記で1件に絞り込み`;
      verdict = "determined";
    } else {
      basis = `日付＋曜日の候補が${weekdayCandidates.length}件に絞れない`;
    }
  } else if (rangeCandidates.length === 1) {
    // 日付が足りないが「2025.12～2026.3」のような明示範囲がある
    detected = seasonIdOf(rangeCandidates[0]);
    basis = "年号の範囲表記から判定（日付＋曜日の根拠は不足）";
    verdict = "determined";
  } else if (uniquePairs.length === 1 && weekdayCandidates.length === 1) {
    detected = seasonIdOf(weekdayCandidates[0]);
    basis = "日付＋曜日が1件のみ（弱い根拠）";
    verdict = "determined";
  } else {
    basis =
      uniquePairs.length === 0 && allTokens.size === 0
        ? "資料に日付＋曜日も年号も見つからない"
        : "根拠が不足していてシーズンを絞り込めない";
  }

  if (verdict === "determined") {
    verdict = detected === declaredSeason ? "match" : "mismatch";
  }

  return {
    declared: declaredSeason,
    detected,
    verdict,
    basis,
    weekday_pairs: uniquePairs.length,
    candidates_from_weekdays: weekdayCandidates.map(seasonIdOf),
    candidates_from_year_ranges: rangeCandidates.map(seasonIdOf),
    year_tokens: [...allTokens].sort(),
    by_page: byPage,
  };
}

/** 判定結果を人間が読める警告文にする */
export function formatSeasonReport(check) {
  const lines = [];
  const pageDetail = () => {
    for (const [pageId, info] of Object.entries(check.by_page)) {
      const parts = [];
      if (info.weekday_pairs > 0) {
        parts.push(
          `日付${info.weekday_pairs}件→${info.seasons_from_weekdays.join("/") || "該当年なし"}`,
        );
        if (info.examples.length > 0) parts.push(info.examples.join(", "));
      }
      if (info.seasons_from_year_ranges.length > 0) {
        parts.push(`年号範囲→${info.seasons_from_year_ranges.join("/")}`);
      }
      if (parts.length === 0) parts.push("シーズンの手がかりなし");
      lines.push(`    ${pageId}${info.title ? ` ${info.title}` : ""}: ${parts.join(" / ")}`);
    }
  };

  if (check.verdict === "match") {
    lines.push(`■ シーズン判定: 一致（${check.detected}）`);
    lines.push(`  根拠: ${check.basis}`);
    return lines.join("\n");
  }

  if (check.verdict === "mismatch") {
    lines.push("■ シーズン不一致 — 処理を中止しました");
    lines.push(`  指定: ${check.declared}`);
    lines.push(`  資料から判定: ${check.detected}（${check.basis}）`);
    pageDetail();
    lines.push(
      "  → 公式サイトがまだ前シーズンの料金を表示している可能性があります。",
    );
    lines.push(
      "     新シーズンの料金が公開されてから取り直してください。指定シーズンが",
    );
    lines.push("     誤っている場合は --season を修正してください。");
    return lines.join("\n");
  }

  if (check.verdict === "conflicting") {
    lines.push("■ シーズンが資料内で矛盾しています — 処理を中止しました");
    lines.push(`  指定: ${check.declared}`);
    lines.push(`  ${check.basis}`);
    pageDetail();
    lines.push(
      "  → 一部のページだけ新シーズンに更新されている可能性があります",
    );
    lines.push(
      "     （例: イベントページは更新済みだが料金ページは前シーズンのまま）。",
    );
    lines.push("     どのページがどのシーズンかを確認してください。");
    return lines.join("\n");
  }

  lines.push("■ シーズンを判定できませんでした — 処理を中止しました");
  lines.push(`  指定: ${check.declared}`);
  lines.push(`  ${check.basis}`);
  pageDetail();
  lines.push(
    "  → このスキー場の資料からは、料金がどのシーズンのものか機械的に判断できません。",
  );
  lines.push(
    "     人間が公式サイトを見れば分かる場合があります。確認のうえ、正しければ",
  );
  lines.push("     --accept-season を付けて再実行してください。");
  return lines.join("\n");
}
