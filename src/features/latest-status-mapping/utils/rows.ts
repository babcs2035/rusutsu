import {
  addSectionMarker,
  canonicalBase,
  normalizeCrawledName,
  removeSuffixIndexIfMultiPart,
} from "@/lib/resortMapMerge";
import type { LatestStatusMappingKind, LatestStatusMappingRow } from "../types";

const unique = (names: string[]): string[] => [...new Set(names)];

const isNamelessGeojsonName = (name: string): boolean =>
  /^無名(?:_|$)/u.test(name.trim());

/**
 * 左だけ・右だけの行が別々にある場合は、先に現れた行へまとめる。
 * 件数差で本当に相手がない行だけ null を残す。
 */
export const compactMappingRows = (
  rows: LatestStatusMappingRow[],
): LatestStatusMappingRow[] => {
  const next = rows
    .filter(row => row.crawledName !== null || row.geojsonName !== null)
    .flatMap(row =>
      row.crawledName !== null &&
      row.geojsonName !== null &&
      isNamelessGeojsonName(row.geojsonName)
        ? [
            { crawledName: null, geojsonName: row.geojsonName },
            { crawledName: row.crawledName, geojsonName: null },
          ]
        : [{ ...row }],
    );
  const crawledOnlyIndexes: number[] = [];
  const geojsonOnlyIndexes: number[] = [];

  next.forEach((row, index) => {
    if (row.crawledName !== null && row.geojsonName === null) {
      crawledOnlyIndexes.push(index);
    } else if (
      row.crawledName === null &&
      row.geojsonName !== null &&
      !isNamelessGeojsonName(row.geojsonName)
    ) {
      geojsonOnlyIndexes.push(index);
    }
  });

  const removedIndexes = new Set<number>();
  const pairCount = Math.min(
    crawledOnlyIndexes.length,
    geojsonOnlyIndexes.length,
  );
  for (let index = 0; index < pairCount; index += 1) {
    const crawledIndex = crawledOnlyIndexes[index];
    const geojsonIndex = geojsonOnlyIndexes[index];
    if (crawledIndex < geojsonIndex) {
      next[crawledIndex].geojsonName = next[geojsonIndex].geojsonName;
      removedIndexes.add(geojsonIndex);
    } else {
      next[geojsonIndex].crawledName = next[crawledIndex].crawledName;
      removedIndexes.add(crawledIndex);
    }
  }

  return next.filter((_, index) => !removedIndexes.has(index));
};

const findCourseSuggestion = (
  geojsonName: string,
  crawledNames: string[],
): string | null => {
  const normalizedToOriginal = new Map(
    crawledNames.map(name => [normalizeCrawledName(name), name]),
  );
  const statusName = removeSuffixIndexIfMultiPart(geojsonName);
  return (
    normalizedToOriginal.get(statusName) ??
    normalizedToOriginal.get(canonicalBase(geojsonName)) ??
    normalizedToOriginal.get(addSectionMarker(statusName)) ??
    null
  );
};

const findSuggestion = (
  kind: LatestStatusMappingKind,
  geojsonName: string,
  crawledNames: string[],
): string | null => {
  if (kind === "courses") {
    return findCourseSuggestion(geojsonName, crawledNames);
  }
  return crawledNames.includes(geojsonName) ? geojsonName : null;
};

const normalizeForPartialMatch = (name: string): string =>
  normalizeCrawledName(name)
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/_\d+$/u, "")
    .replace(/(?:コース|ゲレンデ|リフト)/gu, "")
    .replace(/[^\p{Letter}\p{Number}]/gu, "");

const longestCommonSubstringLength = (left: string, right: string): number => {
  if (left.length === 0 || right.length === 0) return 0;
  const previous = new Array<number>(right.length + 1).fill(0);
  let longest = 0;
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = new Array<number>(right.length + 1).fill(0);
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      if (left[leftIndex - 1] !== right[rightIndex - 1]) continue;
      current[rightIndex] = previous[rightIndex - 1] + 1;
      longest = Math.max(longest, current[rightIndex]);
    }
    for (let index = 0; index < current.length; index += 1) {
      previous[index] = current[index];
    }
  }
  return longest;
};

const partialMatchScore = (leftName: string, rightName: string): number => {
  const left = normalizeForPartialMatch(leftName);
  const right = normalizeForPartialMatch(rightName);
  const commonLength = longestCommonSubstringLength(left, right);
  if (commonLength === 0) return 0;
  const shorterLength = Math.min(left.length, right.length);
  const coverage = shorterLength === 0 ? 0 : commonLength / shorterLength;
  const containsBonus =
    left.includes(right) || right.includes(left) ? 1_000 : 0;
  return commonLength * 10_000 + Math.round(coverage * 100) + containsBonus;
};

export const createSuggestedRows = (
  kind: LatestStatusMappingKind,
  crawledNames: string[],
  geojsonNames: string[],
): LatestStatusMappingRow[] => {
  const uniqueCrawledNames = unique(crawledNames);
  const uniqueGeojsonNames = unique(geojsonNames);
  const usedCrawledNames = new Set<string>();
  const usedGeojsonNames = new Set<string>();
  const rows: LatestStatusMappingRow[] = [];

  // 既存の完全一致・区間名規則を最優先する。同じクロール名を
  // 分割された複数のGeoJSON線へ対応させる既存挙動も維持する。
  for (const geojsonName of uniqueGeojsonNames) {
    if (isNamelessGeojsonName(geojsonName)) continue;
    const crawledName = findSuggestion(kind, geojsonName, uniqueCrawledNames);
    if (!crawledName) continue;
    rows.push({ crawledName, geojsonName });
    usedCrawledNames.add(crawledName);
    usedGeojsonNames.add(geojsonName);
  }

  const remainingCrawledNames = uniqueCrawledNames.filter(
    name => !usedCrawledNames.has(name),
  );
  const remainingGeojsonNames = uniqueGeojsonNames.filter(
    name => !usedGeojsonNames.has(name) && !isNamelessGeojsonName(name),
  );
  const candidates = remainingCrawledNames
    .flatMap((crawledName, crawledIndex) =>
      remainingGeojsonNames.map((geojsonName, geojsonIndex) => ({
        crawledName,
        crawledIndex,
        geojsonName,
        geojsonIndex,
        score: partialMatchScore(crawledName, geojsonName),
      })),
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.geojsonIndex - right.geojsonIndex ||
        left.crawledIndex - right.crawledIndex,
    );

  // 残りは共通部分の多い組み合わせから一対一で配置する。
  for (const candidate of candidates) {
    if (
      usedCrawledNames.has(candidate.crawledName) ||
      usedGeojsonNames.has(candidate.geojsonName)
    ) {
      continue;
    }
    rows.push({
      crawledName: candidate.crawledName,
      geojsonName: candidate.geojsonName,
    });
    usedCrawledNames.add(candidate.crawledName);
    usedGeojsonNames.add(candidate.geojsonName);
  }

  for (const geojsonName of uniqueGeojsonNames) {
    if (!usedGeojsonNames.has(geojsonName)) {
      rows.push({ crawledName: null, geojsonName });
    }
  }
  for (const crawledName of uniqueCrawledNames) {
    if (!usedCrawledNames.has(crawledName)) {
      rows.push({ crawledName, geojsonName: null });
    }
  }
  return compactMappingRows(rows);
};

export const reconcileSavedRows = (
  savedRows: LatestStatusMappingRow[],
  crawledNames: string[],
  geojsonNames: string[],
): LatestStatusMappingRow[] => {
  const uniqueCrawledNames = unique(crawledNames);
  const uniqueGeojsonNames = unique(geojsonNames);
  const usedCrawledNames = new Set(
    savedRows.flatMap(row => (row.crawledName ? [row.crawledName] : [])),
  );
  const usedGeojsonNames = new Set(
    savedRows.flatMap(row => (row.geojsonName ? [row.geojsonName] : [])),
  );
  const rows = compactMappingRows(savedRows);

  const remainingCrawled = uniqueCrawledNames.filter(
    name => !usedCrawledNames.has(name),
  );
  const remainingGeojson = uniqueGeojsonNames.filter(
    name => !usedGeojsonNames.has(name),
  );
  const remainingCount = Math.max(
    remainingCrawled.length,
    remainingGeojson.length,
  );

  for (let index = 0; index < remainingCount; index += 1) {
    rows.push({
      crawledName: remainingCrawled[index] ?? null,
      geojsonName: remainingGeojson[index] ?? null,
    });
  }
  return compactMappingRows(rows);
};

/**
 * クローラーの取得順に対応済みGeoJSON名を並べ、未対応のGeoJSON名は
 * 現在の順番を保ったまま末尾へ残す。
 */
export const buildGeojsonOrderByCrawledItems = (
  crawledNames: string[],
  rows: LatestStatusMappingRow[],
  currentGeojsonNames: string[],
): string[] => {
  const numericSuffix = (name: string): number | null => {
    const match = /_(\d+)$/u.exec(name);
    return match ? Number.parseInt(match[1], 10) : null;
  };
  const sortCourseVariants = (names: string[]): string[] =>
    names
      .map((name, index) => ({ name, index, suffix: numericSuffix(name) }))
      .sort((left, right) => {
        if (left.suffix === null && right.suffix !== null) return -1;
        if (left.suffix !== null && right.suffix === null) return 1;
        if (left.suffix !== null && right.suffix !== null) {
          return left.suffix - right.suffix || left.index - right.index;
        }
        return left.index - right.index;
      })
      .map(item => item.name);

  const geojsonNamesByCrawledName = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.crawledName || !row.geojsonName) continue;
    const names = geojsonNamesByCrawledName.get(row.crawledName) ?? [];
    if (!names.includes(row.geojsonName)) names.push(row.geojsonName);
    geojsonNamesByCrawledName.set(row.crawledName, names);
  }

  const orderedNames: string[] = [];
  const usedNames = new Set<string>();
  for (const crawledName of crawledNames) {
    for (const geojsonName of sortCourseVariants(
      geojsonNamesByCrawledName.get(crawledName) ?? [],
    )) {
      if (usedNames.has(geojsonName)) continue;
      orderedNames.push(geojsonName);
      usedNames.add(geojsonName);
    }
  }
  for (const geojsonName of currentGeojsonNames) {
    if (usedNames.has(geojsonName)) continue;
    orderedNames.push(geojsonName);
    usedNames.add(geojsonName);
  }
  return orderedNames;
};

/**
 * 1 本の線に、対応させるクロール名を割り当て直す。
 *
 * 行の並びは「クローラー取得順に並べる」で使うので、作り直さずに
 * 空いている行へ入れて順番を保つ。null を渡すと対応を外す。
 */
export const assignGeojsonName = (
  rows: LatestStatusMappingRow[],
  geojsonName: string,
  crawledName: string | null,
): LatestStatusMappingRow[] => {
  const next = rows.map(row => ({ ...row }));
  for (const row of next) {
    if (row.geojsonName === geojsonName) row.geojsonName = null;
  }
  if (crawledName === null) {
    // ここで compactMappingRows は通さない。相手のいない行どうしを勝手に
    // つなぎ直してしまい、「未対応にする」という指定が元へ戻ってしまう
    next.push({ crawledName: null, geojsonName });
  } else {
    const target = next.find(
      row => row.crawledName === crawledName && row.geojsonName === null,
    );
    if (target) target.geojsonName = geojsonName;
    else next.push({ crawledName, geojsonName });
  }
  return next.filter(
    row => row.crawledName !== null || row.geojsonName !== null,
  );
};

/** どの線にも割り当てられていないクロール名 */
export const listUnmappedCrawledNames = (
  crawledNames: string[],
  rows: LatestStatusMappingRow[],
): string[] => {
  const assigned = new Set(
    rows
      .filter(row => row.geojsonName !== null && row.crawledName !== null)
      .map(row => row.crawledName),
  );
  return crawledNames.filter(name => !assigned.has(name));
};
