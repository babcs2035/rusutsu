/**
 * スキー場名を狭い列に収めるときの折り返し位置。
 *
 * 日本語はどこでも折り返せてしまうので、ブラウザ任せだと
 * 「志賀高原 サンバ／レー」のような読みにくい切れ方をする。
 * ここに「どこで折るか」を記録しておき、それを元に行へ分ける。
 *
 * 優先順位は
 *   1. LABEL_WRAP_OVERRIDES（個別に決め打ちしたいスキー場）
 *   2. 区切り記号（空白・中黒など）の手前
 *   3. BREAK_BEFORE_TOKENS の手前 / BREAK_AFTER_TOKENS の直後
 *   4. どれも使えなければ最大文字数で機械的に折る
 */

/** 個別指定。ここに書いたスキー場はこの行分けをそのまま使う（キーはスキー場 ID） */
const LABEL_WRAP_OVERRIDES: Record<string, string[]> = {
  "hakuba-happo-one": ["白馬", "八方尾根"],
  "shiga-kogen-yakebitaiyama": ["志賀高原", "焼額山"],
  "shiga-kogen-sun-valley": ["志賀高原", "サンバレー"],
  "nozawa-onsen": ["野沢温泉"],
};

/** この語の手前で折ると読みやすい */
const BREAK_BEFORE_TOKENS = [
  "スノーリゾート",
  "スキーリゾート",
  "スノーパーク",
  "スノーヴィレッジ",
  "マウンテンリゾート",
  "スノーエリア",
  "ファミリー",
  "ヴィレッジ",
  "ビレッジ",
  "マウンテン",
  "リゾート",
  "ゲレンデ",
  "パーク",
  "高原",
  "国際",
  "温泉",
  "公園",
];

/** この語の直後で折ると読みやすい */
const BREAK_AFTER_TOKENS = ["高原", "温泉", "国際", "県営", "町営", "市営"];

const SEPARATOR_PATTERN = /[ 　・／/＆&]/;

const collectBreakPoints = (name: string): number[] => {
  const points = new Set<number>();

  for (let index = 1; index < name.length; index += 1) {
    if (SEPARATOR_PATTERN.test(name[index])) points.add(index);
  }
  for (const token of BREAK_BEFORE_TOKENS) {
    let index = name.indexOf(token);
    while (index > 0) {
      points.add(index);
      index = name.indexOf(token, index + 1);
    }
  }
  for (const token of BREAK_AFTER_TOKENS) {
    let index = name.indexOf(token);
    while (index >= 0) {
      const end = index + token.length;
      if (end < name.length) points.add(end);
      index = name.indexOf(token, index + 1);
    }
  }

  return [...points].sort((a, b) => a - b);
};

/**
 * 名前を 1 行あたり maxCharsPerLine 文字に収まるよう行へ分ける。
 * 収まる名前は 1 行のまま返す。
 */
export const getResortLabelLines = (
  name: string,
  maxCharsPerLine = 6,
  resortId?: string,
): string[] => {
  const override = resortId ? LABEL_WRAP_OVERRIDES[resortId] : undefined;
  if (override) return override;

  const trimmed = name.trim();
  if (trimmed.length <= maxCharsPerLine) return [trimmed];

  const breakPoints = collectBreakPoints(trimmed);
  const lines: string[] = [];
  let start = 0;

  while (start < trimmed.length) {
    if (trimmed.length - start <= maxCharsPerLine) {
      lines.push(trimmed.slice(start));
      break;
    }

    const limit = start + maxCharsPerLine;
    const candidate = breakPoints
      .filter(point => point > start && point <= limit)
      .pop();
    const end = candidate ?? limit;

    lines.push(trimmed.slice(start, end).trim());
    start = end;
    // 区切り記号は次の行の頭に残さない
    while (start < trimmed.length && SEPARATOR_PATTERN.test(trimmed[start])) {
      start += 1;
    }
  }

  return lines.filter(line => line.length > 0);
};
