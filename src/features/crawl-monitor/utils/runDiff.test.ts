import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  CrawlMonitorCategorySummary,
  CrawlMonitorRunSummary,
} from "@/server/crawl-latest/adminContract";
import { buildCountSeries, buildRunChangeMap } from "./runDiff";

const category = (
  overrides: Partial<CrawlMonitorCategorySummary> = {},
): CrawlMonitorCategorySummary => ({
  kind: "COURSES",
  state: "SUCCESS",
  validationState: "VALID",
  eligibleForCurrent: true,
  itemCount: 10,
  usableItemCount: 10,
  contentHash: "content-1",
  nameSetHash: "names-1",
  ...overrides,
});

const run = (
  id: string,
  categories: CrawlMonitorCategorySummary[],
  observedAt = "2026-09-17T00:00:00.000Z",
): CrawlMonitorRunSummary => ({
  id,
  resortId: "resort-a",
  observedAt,
  completedAt: observedAt,
  sourceMode: "LIVE",
  archiveTimestamp: null,
  outcome: "SUCCESS",
  crawlerFile: null,
  crawlerRevision: null,
  categories,
  issueCounts: { warning: 0, error: 0, blocking: 0 },
});

test("identical hashes mean the crawl result did not move", () => {
  const runs = [run("new", [category()]), run("old", [category()])];
  assert.equal(buildRunChangeMap(runs).new?.COURSES, "same");
});

test("a changed name set is reported separately from a value change", () => {
  const valueChanged = [
    run("new", [category({ contentHash: "content-2" })]),
    run("old", [category()]),
  ];
  assert.equal(buildRunChangeMap(valueChanged).new?.COURSES, "changed");

  const namesChanged = [
    run("new", [
      category({ contentHash: "content-2", nameSetHash: "names-2" }),
    ]),
    run("old", [category()]),
  ];
  assert.equal(buildRunChangeMap(namesChanged).new?.COURSES, "names-changed");
});

test("the oldest run and missing hashes stay unknown", () => {
  const runs = [
    run("new", [category({ contentHash: null })]),
    run("old", [category()]),
  ];
  const map = buildRunChangeMap(runs);
  assert.equal(map.new?.COURSES, "unknown");
  assert.equal(map.old?.COURSES, "unknown");
});

test("count series is returned oldest first", () => {
  const runs = [
    run("new", [category({ itemCount: 12 })], "2026-09-17T00:00:00.000Z"),
    run("old", [category({ itemCount: 10 })], "2026-09-16T00:00:00.000Z"),
  ];
  assert.deepEqual(
    buildCountSeries(runs, "COURSES").map(entry => entry.itemCount),
    [10, 12],
  );
  assert.deepEqual(buildCountSeries(runs, "WEATHER"), []);
});
