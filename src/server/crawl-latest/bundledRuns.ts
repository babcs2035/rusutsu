import { promises as fs } from "node:fs";
import path from "node:path";
import { listLatestStatusFiles } from "@/lib/latestStatusFiles";
import type {
  CrawlMonitorCategorySummary,
  CrawlMonitorCurrent,
  CrawlMonitorRunDetail,
  CrawlMonitorRunSummary,
} from "./adminContract";
import { hashCrawlLatestJson } from "./persistence";

/**
 * `src/private/data/resorts-temporary/latest_data` に残っているクロール結果。
 *
 * crawl_latestの結果をAPIへ送る運用は段階導入中で、DBに実行記録があるスキー場は
 * まだ一部しかない。残りはこのファイル群が唯一の記録なので、監視画面では
 * 「DBに無ければファイルを見る」という既存の参照規則（availableStatus.ts）に合わせる。
 */

const BUNDLED_ROOT = path.join(
  process.cwd(),
  "src/private/data/resorts-temporary",
  "latest_data",
);

const FILE_RUN_ID_RE = /^file-(\d{4}_\d{4}_\d{6})$/u;
const FILE_NAME_RE = /^(\d{4})_(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.json$/u;

export const bundledRunId = (fileName: string): string =>
  `file-${fileName.replace(/\.json$/u, "")}`;

export const isBundledRunId = (runId: string): boolean =>
  FILE_RUN_ID_RE.test(runId);

export const bundledFileNameFromRunId = (runId: string): string | null => {
  const match = FILE_RUN_ID_RE.exec(runId);
  return match ? `${match[1]}.json` : null;
};

/** ファイル名の時刻はJSTで記録されている。 */
export const bundledObservedAt = (fileName: string): string | null => {
  const match = FILE_NAME_RE.exec(fileName);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const parsed = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const namedItems = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          isRecord(item) &&
          typeof item.name === "string" &&
          item.name.trim() !== "",
      )
    : [];

const urls = (value: unknown): string[] => {
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim() !== "",
      ),
    ),
  ];
};

export type BundledCategory = CrawlMonitorCategorySummary & {
  sourceUrls: string[];
  data: unknown;
};

const summarize = (
  kind: CrawlMonitorCategorySummary["kind"],
  data: unknown,
  sourceUrls: string[],
  itemCount: number,
  usableItemCount: number,
  hasValue: boolean,
): BundledCategory => ({
  kind,
  state: hasValue ? "SUCCESS" : "EMPTY",
  // ファイルには保存時の検証結果が残っていないので、取得できたかどうかだけを示す。
  validationState: "VALID",
  eligibleForCurrent: false,
  itemCount,
  usableItemCount,
  contentHash: hasValue ? hashCrawlLatestJson(data) : null,
  nameSetHash:
    usableItemCount > 0
      ? hashCrawlLatestJson(
          [...new Set(namedItems(data).map(item => String(item.name)))].sort(),
        )
      : null,
  sourceUrls,
  data: hasValue ? data : null,
});

/** ファイル1件の中身を、DB由来のrunと同じ形のカテゴリ4件に読み替える。 */
export const buildBundledCategories = (parsed: unknown): BundledCategory[] => {
  const record = isRecord(parsed) ? parsed : {};

  const comment =
    typeof record.comment === "string" && record.comment.trim() !== ""
      ? record.comment
      : null;
  const weather = isRecord(record.weather) ? record.weather : {};
  const weatherPoints = Object.keys(weather).length;
  const courses = namedItems(record.courses);
  const lifts = namedItems(record.lifts);

  return [
    summarize(
      "COMMENT",
      { value: comment },
      urls(record.commentUrl),
      comment === null ? 0 : 1,
      comment === null ? 0 : 1,
      comment !== null,
    ),
    summarize(
      "NEWS",
      null,
      urls(record.newsUrl),
      0,
      0,
      urls(record.newsUrl).length > 0,
    ),
    summarize(
      "WEATHER",
      weather,
      urls(record.weatherUrl),
      weatherPoints,
      weatherPoints,
      weatherPoints > 0,
    ),
    summarize(
      "COURSES",
      Array.isArray(record.courses) ? record.courses : [],
      urls(record.courseUrl),
      Array.isArray(record.courses) ? record.courses.length : 0,
      courses.length,
      courses.length > 0,
    ),
    summarize(
      "LIFTS",
      Array.isArray(record.lifts) ? record.lifts : [],
      urls(record.liftUrl),
      Array.isArray(record.lifts) ? record.lifts.length : 0,
      lifts.length,
      lifts.length > 0,
    ),
  ];
};

const runOutcome = (
  categories: readonly BundledCategory[],
): CrawlMonitorRunSummary["outcome"] => {
  if (categories.every(category => category.state !== "SUCCESS"))
    return "FAILED";
  // コメントとお知らせは営業期間外だと空のことがあるので、欠けても失敗扱いにしない。
  return categories.some(
    category =>
      category.kind !== "COMMENT" &&
      category.kind !== "NEWS" &&
      category.state !== "SUCCESS",
  )
    ? "PARTIAL"
    : "SUCCESS";
};

const readBundledFile = async (
  resortId: string,
  fileName: string,
): Promise<unknown | null> => {
  try {
    return JSON.parse(
      await fs.readFile(path.join(BUNDLED_ROOT, resortId, fileName), "utf8"),
    ) as unknown;
  } catch {
    return null;
  }
};

const toRunSummary = (
  resortId: string,
  fileName: string,
  categories: BundledCategory[],
): CrawlMonitorRunSummary => {
  const observedAt = bundledObservedAt(fileName) ?? new Date(0).toISOString();
  return {
    id: bundledRunId(fileName),
    resortId,
    origin: "FILE",
    observedAt,
    completedAt: observedAt,
    sourceMode: "LIVE",
    archiveTimestamp: null,
    outcome: runOutcome(categories),
    crawlerFile: null,
    crawlerRevision: null,
    categories: categories.map(
      ({ sourceUrls: _urls, data: _data, ...rest }) => rest,
    ),
    issueCounts: { warning: 0, error: 0, blocking: 0 },
  };
};

export const listBundledResortIds = async (): Promise<string[]> => {
  try {
    return (await fs.readdir(BUNDLED_ROOT, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch {
    return [];
  }
};

/** 新しい順のファイル名。中身は読まないので一覧の作成は軽い。 */
export const listBundledFileNames = async (
  resortId: string,
): Promise<string[]> => {
  try {
    return listLatestStatusFiles(
      await fs.readdir(path.join(BUNDLED_ROOT, resortId)),
    );
  } catch {
    return [];
  }
};

export const readBundledRunSummary = async (
  resortId: string,
  fileName: string,
): Promise<CrawlMonitorRunSummary | null> => {
  const parsed = await readBundledFile(resortId, fileName);
  if (parsed === null) return null;
  return toRunSummary(resortId, fileName, buildBundledCategories(parsed));
};

export const readLatestBundledRunSummary = async (
  resortId: string,
): Promise<CrawlMonitorRunSummary | null> => {
  for (const fileName of await listBundledFileNames(resortId)) {
    const summary = await readBundledRunSummary(resortId, fileName);
    if (summary) return summary;
  }
  return null;
};

export const listBundledRunSummaries = async (
  resortId: string,
  limit: number,
): Promise<CrawlMonitorRunSummary[]> => {
  const fileNames = (await listBundledFileNames(resortId)).slice(0, limit);
  const summaries = await Promise.all(
    fileNames.map(fileName => readBundledRunSummary(resortId, fileName)),
  );
  return summaries.filter(
    (summary): summary is CrawlMonitorRunSummary => summary !== null,
  );
};

/**
 * カテゴリごとに「値が入っている最新のファイル」を探す。
 * 1つのファイルで全部が揃うとは限らないため、kindごとにさかのぼる。
 */
export const readBundledCurrents = async (
  resortId: string,
  kinds: readonly CrawlMonitorCategorySummary["kind"][],
): Promise<CrawlMonitorCurrent[]> => {
  const pending = new Set(kinds);
  const found: CrawlMonitorCurrent[] = [];
  for (const fileName of await listBundledFileNames(resortId)) {
    if (pending.size === 0) break;
    const parsed = await readBundledFile(resortId, fileName);
    if (parsed === null) continue;
    const observedAt = bundledObservedAt(fileName);
    for (const category of buildBundledCategories(parsed)) {
      if (!pending.has(category.kind) || category.state !== "SUCCESS") continue;
      pending.delete(category.kind);
      found.push({
        kind: category.kind,
        origin: "FILE",
        runId: bundledRunId(fileName),
        snapshotId: `${bundledRunId(fileName)}-${category.kind}`,
        observedAt: observedAt ?? new Date(0).toISOString(),
        updatedAt: observedAt ?? new Date(0).toISOString(),
        state: category.state,
        validationState: category.validationState,
        itemCount: category.itemCount,
        usableItemCount: category.usableItemCount,
        sourceUrls: category.sourceUrls,
        data: category.data,
      });
    }
  }
  return found;
};

export const readBundledRunDetail = async (
  resortId: string,
  fileName: string,
): Promise<CrawlMonitorRunDetail | null> => {
  const parsed = await readBundledFile(resortId, fileName);
  if (parsed === null) return null;
  const categories = buildBundledCategories(parsed);
  const summary = toRunSummary(resortId, fileName, categories);
  return {
    run: {
      ...summary,
      producerId: "crawl_latest (ファイル)",
      requestHash: "",
      crawlerSourceHash: null,
    },
    categories,
    issues: [],
    artifacts: [],
    rawPayload: parsed,
  };
};
