import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  CrawlMonitorCategorySummary,
  CrawlMonitorOverviewRow,
  CrawlMonitorRunSummary,
} from "@/server/crawl-latest/adminContract";
import {
  buildOverviewEntries,
  countAttention,
  overviewRowStatus,
  paginate,
  STALE_THRESHOLD_MS,
} from "./overview";
import { parseOverviewQuery } from "./query";

const NOW = Date.UTC(2026, 8, 17, 0, 0, 0);

const category = (
  overrides: Partial<CrawlMonitorCategorySummary> = {},
): CrawlMonitorCategorySummary => ({
  kind: "COURSES",
  state: "SUCCESS",
  validationState: "VALID",
  eligibleForCurrent: true,
  itemCount: 10,
  usableItemCount: 10,
  contentHash: "a".repeat(64),
  nameSetHash: "b".repeat(64),
  ...overrides,
});

const run = (
  overrides: Partial<CrawlMonitorRunSummary> = {},
): CrawlMonitorRunSummary => ({
  id: "run-1",
  resortId: "resort-a",
  observedAt: new Date(NOW - 60_000).toISOString(),
  completedAt: new Date(NOW - 30_000).toISOString(),
  sourceMode: "LIVE",
  archiveTimestamp: null,
  outcome: "SUCCESS",
  crawlerFile: "resorts/resort-a.ts",
  crawlerRevision: "abc123",
  categories: [
    category({ kind: "COMMENT", itemCount: 0, usableItemCount: 0 }),
    category({ kind: "WEATHER", itemCount: 3, usableItemCount: 3 }),
    category({ kind: "COURSES" }),
    category({ kind: "LIFTS" }),
  ],
  issueCounts: { warning: 0, error: 0, blocking: 0 },
  ...overrides,
});

const row = (
  overrides: Partial<CrawlMonitorOverviewRow> = {},
): CrawlMonitorOverviewRow => ({
  resortId: "resort-a",
  resortName: "テストスキー場",
  prefecture: "北海道",
  latestRun: run(),
  ...overrides,
});

test("a resort with no run at all needs attention", () => {
  const status = overviewRowStatus(row({ latestRun: null }), NOW);
  assert.equal(status.isMissing, true);
  assert.equal(status.needsAttention, true);
});

test("a healthy recent run needs no attention", () => {
  const status = overviewRowStatus(row(), NOW);
  assert.deepEqual(status, {
    isMissing: false,
    isFailed: false,
    hasWarning: false,
    isStale: false,
    needsAttention: false,
  });
});

test("empty non-comment categories and invalid validation raise flags", () => {
  const warning = overviewRowStatus(
    row({
      latestRun: run({
        categories: [category({ kind: "LIFTS", state: "EMPTY" })],
      }),
    }),
    NOW,
  );
  assert.equal(warning.hasWarning, true);
  assert.equal(warning.isFailed, false);

  const failed = overviewRowStatus(
    row({
      latestRun: run({
        categories: [category({ kind: "LIFTS", validationState: "INVALID" })],
      }),
    }),
    NOW,
  );
  assert.equal(failed.isFailed, true);
});

test("an empty comment alone is not treated as a warning", () => {
  const status = overviewRowStatus(
    row({
      latestRun: run({
        categories: [category({ kind: "COMMENT", state: "EMPTY" })],
      }),
    }),
    NOW,
  );
  assert.equal(status.hasWarning, false);
});

test("runs older than a day are flagged as stale", () => {
  const status = overviewRowStatus(
    row({
      latestRun: run({
        observedAt: new Date(NOW - STALE_THRESHOLD_MS - 1_000).toISOString(),
      }),
    }),
    NOW,
  );
  assert.equal(status.isStale, true);
  assert.equal(status.needsAttention, true);
});

test("entries are filtered by text and sorted with problems first", () => {
  const rows = [
    row({ resortId: "healthy", resortName: "健全" }),
    row({ resortId: "missing", resortName: "未取得", latestRun: null }),
    row({
      resortId: "warned",
      resortName: "警告",
      latestRun: run({ issueCounts: { warning: 2, error: 0, blocking: 0 } }),
    }),
  ];
  const entries = buildOverviewEntries(rows, parseOverviewQuery({}), NOW);
  assert.deepEqual(
    entries.map(entry => entry.row.resortId),
    ["missing", "warned", "healthy"],
  );

  const attentionOnly = buildOverviewEntries(
    rows,
    parseOverviewQuery({ status: "attention" }),
    NOW,
  );
  assert.deepEqual(
    attentionOnly.map(entry => entry.row.resortId),
    ["missing", "warned"],
  );

  const searched = buildOverviewEntries(
    rows,
    parseOverviewQuery({ q: "健全" }),
    NOW,
  );
  assert.deepEqual(
    searched.map(entry => entry.row.resortId),
    ["healthy"],
  );

  assert.deepEqual(countAttention(entries), {
    failed: 0,
    warning: 1,
    missing: 1,
    stale: 0,
  });
});

test("pagination clamps out-of-range pages", () => {
  const items = [1, 2, 3, 4, 5];
  assert.deepEqual(paginate(items, 2, 2), {
    items: [3, 4],
    page: 2,
    pageCount: 3,
    total: 5,
  });
  assert.equal(paginate(items, 99, 2).page, 3);
  assert.equal(paginate([], 1, 2).pageCount, 1);
});
