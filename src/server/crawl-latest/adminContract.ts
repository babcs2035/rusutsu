import { z } from "zod";
import {
  CRAWL_LATEST_CATEGORY_KINDS,
  CRAWL_LATEST_CATEGORY_STATES,
} from "./contract";

/**
 * クローラー監視画面が扱うDTO。
 *
 * 画面はローカルDB直読みと本番内部API経由の両方から同じ形を受け取る。
 * remote応答をここのschemaで検証してから描画する。
 */

/** 監視画面が扱う実行種別。LEGACY_IMPORTは書き込む経路が存在しないため除外する。 */
export const CRAWL_MONITOR_SOURCE_MODES = [
  "LIVE",
  "WAYBACK_VALIDATION",
] as const;
export type CrawlMonitorSourceMode =
  (typeof CRAWL_MONITOR_SOURCE_MODES)[number];

export const crawlMonitorSourceModeSchema = z.enum(CRAWL_MONITOR_SOURCE_MODES);

export const CRAWL_MONITOR_PAGE_SIZE = 50;
export const CRAWL_MONITOR_MAX_PAGE = 200;

const categoryKindSchema = z.enum(CRAWL_LATEST_CATEGORY_KINDS);
const categoryStateSchema = z.enum(CRAWL_LATEST_CATEGORY_STATES);
const validationStateSchema = z.enum(["VALID", "WARNING", "INVALID"]);
const outcomeSchema = z.enum(["SUCCESS", "PARTIAL", "FAILED"]);
const severitySchema = z.enum(["WARNING", "ERROR"]);
const isoDateTimeSchema = z.string().min(1);

export const crawlMonitorIssueCountsSchema = z.object({
  warning: z.number().int().nonnegative(),
  error: z.number().int().nonnegative(),
  blocking: z.number().int().nonnegative(),
});
export type CrawlMonitorIssueCounts = z.infer<
  typeof crawlMonitorIssueCountsSchema
>;

export const crawlMonitorCategorySummarySchema = z.object({
  kind: categoryKindSchema,
  state: categoryStateSchema,
  validationState: validationStateSchema,
  eligibleForCurrent: z.boolean(),
  itemCount: z.number().int().nonnegative(),
  usableItemCount: z.number().int().nonnegative(),
  contentHash: z.string().nullable(),
  nameSetHash: z.string().nullable(),
});
export type CrawlMonitorCategorySummary = z.infer<
  typeof crawlMonitorCategorySummarySchema
>;

/** DBの実行記録か、latest_dataに残っているファイルか。 */
export const crawlMonitorOriginSchema = z
  .enum(["DATABASE", "FILE"])
  .default("DATABASE");
export type CrawlMonitorOrigin = z.infer<typeof crawlMonitorOriginSchema>;

export const crawlMonitorRunSummarySchema = z.object({
  id: z.string(),
  resortId: z.string(),
  origin: crawlMonitorOriginSchema,
  observedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema,
  sourceMode: crawlMonitorSourceModeSchema,
  archiveTimestamp: z.string().nullable(),
  outcome: outcomeSchema,
  crawlerFile: z.string().nullable(),
  crawlerRevision: z.string().nullable(),
  categories: z.array(crawlMonitorCategorySummarySchema),
  issueCounts: crawlMonitorIssueCountsSchema,
});
export type CrawlMonitorRunSummary = z.infer<
  typeof crawlMonitorRunSummarySchema
>;

/** 対応表との照合結果。missingが「取れるはずなのに取れていない」名前。 */
export const crawlMonitorMappingGapSchema = z.object({
  kind: z.enum(["COURSES", "LIFTS"]),
  expected: z.number().int().nonnegative(),
  crawled: z.number().int().nonnegative(),
  missing: z.array(z.string()),
  unexpected: z.array(z.string()),
});
export type CrawlMonitorMappingGap = z.infer<
  typeof crawlMonitorMappingGapSchema
>;

export const crawlMonitorOverviewRowSchema = z.object({
  resortId: z.string(),
  resortName: z.string(),
  prefecture: z.string(),
  latestRun: crawlMonitorRunSummarySchema.nullable(),
  /** 対応表が無いスキー場では空。 */
  mappingGaps: z.array(crawlMonitorMappingGapSchema).default([]),
});
export type CrawlMonitorOverviewRow = z.infer<
  typeof crawlMonitorOverviewRowSchema
>;

export const crawlMonitorOverviewSchema = z.object({
  rows: z.array(crawlMonitorOverviewRowSchema),
  generatedAt: isoDateTimeSchema,
});
export type CrawlMonitorOverview = z.infer<typeof crawlMonitorOverviewSchema>;

export const crawlMonitorRunPageSchema = z.object({
  runs: z.array(crawlMonitorRunSummarySchema),
  total: z.number().int().nonnegative(),
});
export type CrawlMonitorRunPage = z.infer<typeof crawlMonitorRunPageSchema>;

/**
 * 画面が受け取る実行履歴。`legacyApi` は、接続先のAPIがこの画面より古く、
 * ファイルの記録を返せなかったことを示す（画面はその旨を出す）。
 */
export type CrawlMonitorRunResult = CrawlMonitorRunPage & {
  legacyApi: boolean;
};

export const crawlMonitorCurrentSchema = z.object({
  kind: categoryKindSchema,
  origin: crawlMonitorOriginSchema,
  runId: z.string(),
  snapshotId: z.string(),
  observedAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  state: categoryStateSchema,
  validationState: validationStateSchema,
  itemCount: z.number().int().nonnegative(),
  usableItemCount: z.number().int().nonnegative(),
  sourceUrls: z.array(z.string()),
  data: z.unknown(),
});
export type CrawlMonitorCurrent = z.infer<typeof crawlMonitorCurrentSchema>;

export const crawlMonitorCurrentsSchema = z.object({
  currents: z.array(crawlMonitorCurrentSchema),
});

export const crawlMonitorIssueSchema = z.object({
  id: z.string(),
  runId: z.string(),
  resortId: z.string(),
  resortName: z.string(),
  observedAt: isoDateTimeSchema,
  sourceMode: crawlMonitorSourceModeSchema,
  outcome: outcomeSchema,
  categoryKind: categoryKindSchema.nullable(),
  severity: severitySchema,
  code: z.string(),
  message: z.string(),
  occurrences: z.number().int().positive(),
  blocksPromotion: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type CrawlMonitorIssue = z.infer<typeof crawlMonitorIssueSchema>;

export const crawlMonitorIssueCodeSummarySchema = z.object({
  code: z.string(),
  severity: severitySchema,
  count: z.number().int().nonnegative(),
});
export type CrawlMonitorIssueCodeSummary = z.infer<
  typeof crawlMonitorIssueCodeSummarySchema
>;

export const crawlMonitorIssuePageSchema = z.object({
  issues: z.array(crawlMonitorIssueSchema),
  total: z.number().int().nonnegative(),
  codes: z.array(crawlMonitorIssueCodeSummarySchema),
});
export type CrawlMonitorIssuePage = z.infer<typeof crawlMonitorIssuePageSchema>;

export const crawlMonitorArtifactSchema = z.object({
  id: z.string(),
  categoryKind: categoryKindSchema.nullable(),
  state: z.enum(["AVAILABLE", "FAILED"]),
  pageKey: z.string(),
  title: z.string().nullable(),
  requestedUrl: z.string().nullable(),
  finalUrl: z.string().nullable(),
  httpStatus: z.number().int().nullable(),
  sizeBytes: z.string().nullable(),
  captureError: z.string().nullable(),
  capturedAt: isoDateTimeSchema,
  hasContent: z.boolean(),
});
export type CrawlMonitorArtifact = z.infer<typeof crawlMonitorArtifactSchema>;

export const crawlMonitorRunDetailSchema = z.object({
  run: crawlMonitorRunSummarySchema.extend({
    producerId: z.string(),
    requestHash: z.string(),
    crawlerSourceHash: z.string().nullable(),
  }),
  categories: z.array(
    crawlMonitorCategorySummarySchema.extend({
      sourceUrls: z.array(z.string()),
      data: z.unknown(),
    }),
  ),
  issues: z.array(
    z.object({
      id: z.string(),
      categoryKind: categoryKindSchema.nullable(),
      severity: severitySchema,
      code: z.string(),
      message: z.string(),
      occurrences: z.number().int().positive(),
      blocksPromotion: z.boolean(),
      details: z.unknown(),
      createdAt: isoDateTimeSchema,
    }),
  ),
  artifacts: z.array(crawlMonitorArtifactSchema),
  rawPayload: z.unknown(),
});
export type CrawlMonitorRunDetail = z.infer<typeof crawlMonitorRunDetailSchema>;

export const crawlMonitorMappingSchema = z.object({
  gaps: z.array(crawlMonitorMappingGapSchema),
  observedAt: z.string().nullable(),
});
export type CrawlMonitorMapping = z.infer<typeof crawlMonitorMappingSchema>;

export const crawlMonitorResortIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

export const crawlMonitorRunListQuerySchema = z.object({
  resortId: crawlMonitorResortIdSchema,
  /** DBの実行記録と、latest_dataのファイル記録のどちらを見るか。 */
  origin: crawlMonitorOriginSchema,
  sourceModes: z.array(crawlMonitorSourceModeSchema).min(1),
  page: z.number().int().min(1).max(CRAWL_MONITOR_MAX_PAGE),
  pageSize: z.number().int().min(1).max(CRAWL_MONITOR_PAGE_SIZE),
});
export type CrawlMonitorRunListQuery = z.infer<
  typeof crawlMonitorRunListQuerySchema
>;

export const crawlMonitorIssueListQuerySchema = z.object({
  severity: severitySchema.nullable(),
  code: z.string().max(100).nullable(),
  resortId: crawlMonitorResortIdSchema.nullable(),
  categoryKind: categoryKindSchema.nullable(),
  sourceModes: z.array(crawlMonitorSourceModeSchema).min(1),
  blockingOnly: z.boolean(),
  since: z.string().nullable(),
  page: z.number().int().min(1).max(CRAWL_MONITOR_MAX_PAGE),
  pageSize: z.number().int().min(1).max(CRAWL_MONITOR_PAGE_SIZE),
});
export type CrawlMonitorIssueListQuery = z.infer<
  typeof crawlMonitorIssueListQuerySchema
>;
