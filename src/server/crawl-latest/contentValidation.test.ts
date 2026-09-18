import assert from "node:assert/strict";
import { test } from "node:test";
import type { LatestStatusCapabilityFile } from "@/features/latest-status-mapping/types.capability";
import {
  buildCapabilityGapIssues,
  buildCrawlLatestPersistenceValidation,
  type CrawlLatestPersistenceValidation,
} from "./contentValidation";
import {
  type CrawlLatestCategoryKind,
  crawlLatestRunInputSchema,
} from "./contract";

const validInput = () =>
  crawlLatestRunInputSchema.parse({
    schemaVersion: 1,
    producerId: "crawl_latest",
    resortId: "sample-resort",
    observedAt: "2026-09-04T01:00:00.000Z",
    completedAt: "2026-09-04T01:00:10.000Z",
    sourceMode: "LIVE",
    crawler: {},
    rawPayload: { resortName: "sample-resort" },
    categories: [
      {
        kind: "COMMENT",
        state: "SUCCESS",
        data: { value: "Open" },
        sourceUrls: [],
      },
      {
        kind: "NEWS",
        state: "SUCCESS",
        data: null,
        sourceUrls: ["https://example.com/news"],
      },
      {
        kind: "WEATHER",
        state: "SUCCESS",
        data: {
          mountain: {
            update: "09:00",
            weather: "snow",
            temperature: -5,
            snowDepth: 100,
            snowfall: 10,
            condition: null,
            windSpeed: 3,
          },
        },
        sourceUrls: [],
      },
      {
        kind: "COURSES",
        state: "SUCCESS",
        data: [{ name: "A", status: "○", update: null, note: null }],
        sourceUrls: [],
      },
      {
        kind: "LIFTS",
        state: "SUCCESS",
        data: [{ name: "Lift 1", status: "△", update: null, note: null }],
        sourceUrls: [],
      },
    ],
    issues: [],
    artifacts: [],
  });

const category = (
  validation: CrawlLatestPersistenceValidation,
  kind: CrawlLatestCategoryKind,
) => {
  const result = validation.categories.find(
    candidate => candidate.kind === kind,
  );
  assert.ok(result);
  return result;
};

test("promotes every valid LIVE category without trusting producer issues", () => {
  const input = validInput();
  const before = structuredClone(input);
  const validation = buildCrawlLatestPersistenceValidation(input);

  assert.equal(validation.outcome, "SUCCESS");
  assert.deepEqual(validation.serverIssues, []);
  assert.equal(
    validation.categories.every(candidate => candidate.eligibleForCurrent),
    true,
  );
  assert.deepEqual(input, before);
});

test("turns a null successful comment into an invalid empty snapshot", () => {
  const input = validInput();
  const comment = input.categories.find(
    candidate => candidate.kind === "COMMENT",
  );
  assert.ok(comment);
  comment.data = { value: null };

  const validation = buildCrawlLatestPersistenceValidation(input);
  const result = category(validation, "COMMENT");

  assert.equal(result.state, "EMPTY");
  assert.equal(result.validationState, "INVALID");
  assert.equal(result.eligibleForCurrent, false);
  assert.equal(result.usableItemCount, 0);
  assert.equal(validation.outcome, "PARTIAL");
  assert.equal(category(validation, "WEATHER").eligibleForCurrent, true);
  assert.deepEqual(
    validation.serverIssues.map(candidate => candidate.code),
    ["SERVER_VALIDATION.COMMENT_EMPTY"],
  );
});

test("does not count an update timestamp as actual weather data", () => {
  const input = validInput();
  const weather = input.categories.find(
    candidate => candidate.kind === "WEATHER",
  );
  assert.ok(weather);
  weather.data = {
    mountain: {
      update: "09:00",
      weather: null,
      temperature: null,
      snowDepth: null,
      snowfall: null,
      condition: " ",
      windSpeed: null,
    },
  };

  const validation = buildCrawlLatestPersistenceValidation(input);
  const result = category(validation, "WEATHER");

  assert.equal(result.state, "EMPTY");
  assert.equal(result.validationState, "INVALID");
  assert.equal(result.eligibleForCurrent, false);
  assert.equal(result.itemCount, 1);
  assert.equal(result.usableItemCount, 0);
  assert.equal(
    validation.serverIssues[0]?.code,
    "SERVER_VALIDATION.WEATHER_NO_ACTUAL_VALUE",
  );
});

test("accepts zero as an actual weather value", () => {
  const input = validInput();
  const weather = input.categories.find(
    candidate => candidate.kind === "WEATHER",
  );
  assert.ok(weather);
  weather.data = {
    mountain: {
      update: null,
      weather: null,
      temperature: 0,
      snowDepth: null,
      snowfall: null,
      condition: null,
      windSpeed: null,
    },
  };

  const validation = buildCrawlLatestPersistenceValidation(input);
  assert.equal(category(validation, "WEATHER").eligibleForCurrent, true);
  assert.deepEqual(validation.serverIssues, []);
});

test("invalidates operations with empty names, statuses, unknown statuses, or duplicates", () => {
  const input = validInput();
  const courses = input.categories.find(
    candidate => candidate.kind === "COURSES",
  );
  assert.ok(courses);
  courses.data = [
    { name: " A ", status: "○", update: null, note: null },
    { name: "A", status: "△", update: null, note: null },
    { name: " ", status: "○", update: null, note: null },
    { name: "B", status: null, update: null, note: null },
    { name: "C", status: "OPEN", update: null, note: null },
  ];

  const validation = buildCrawlLatestPersistenceValidation(input);
  const result = category(validation, "COURSES");

  assert.equal(result.state, "SUCCESS");
  assert.equal(result.validationState, "INVALID");
  assert.equal(result.eligibleForCurrent, false);
  assert.equal(result.usableItemCount, 0);
  assert.deepEqual(
    validation.serverIssues.map(candidate => candidate.code).sort(),
    [
      "SERVER_VALIDATION.OPERATION_DUPLICATE_NAME",
      "SERVER_VALIDATION.OPERATION_NAME_EMPTY",
      "SERVER_VALIDATION.OPERATION_STATUS_MISSING",
      "SERVER_VALIDATION.OPERATION_STATUS_UNKNOWN",
    ],
  );
  assert.equal(
    validation.serverIssues.every(
      candidate =>
        candidate.categoryKind === "COURSES" &&
        candidate.severity === "ERROR" &&
        candidate.blocksPromotion &&
        candidate.externalId === undefined,
    ),
    true,
  );
});

test("keeps valid Wayback categories out of current", () => {
  const input = validInput();
  input.sourceMode = "WAYBACK_VALIDATION";
  input.archiveTimestamp = "20260101120000";

  const validation = buildCrawlLatestPersistenceValidation(input);

  assert.equal(validation.outcome, "SUCCESS");
  assert.equal(
    validation.categories.every(candidate => !candidate.eligibleForCurrent),
    true,
  );
});

test("keeps server validation category-scoped for partial success", () => {
  const input = validInput();
  const lifts = input.categories.find(candidate => candidate.kind === "LIFTS");
  assert.ok(lifts);
  lifts.data = [{ name: "Lift 1", status: null, update: null, note: null }];

  const validation = buildCrawlLatestPersistenceValidation(input);

  assert.equal(validation.outcome, "PARTIAL");
  assert.equal(category(validation, "LIFTS").eligibleForCurrent, false);
  assert.equal(category(validation, "COMMENT").eligibleForCurrent, true);
  assert.equal(category(validation, "WEATHER").eligibleForCurrent, true);
  assert.equal(category(validation, "COURSES").eligibleForCurrent, true);
});

test("a successful NEWS category is driven entirely by sourceUrls, with no data", () => {
  const input = validInput();
  const news = input.categories.find(candidate => candidate.kind === "NEWS");
  assert.ok(news);
  news.sourceUrls = ["https://example.com/news", "https://example.com/news2"];

  const validation = buildCrawlLatestPersistenceValidation(input);
  const result = category(validation, "NEWS");

  assert.equal(result.state, "SUCCESS");
  assert.equal(result.validationState, "VALID");
  assert.equal(result.eligibleForCurrent, true);
  assert.equal(result.itemCount, 2);
  assert.equal(result.usableItemCount, 2);
  assert.deepEqual(result.names, []);
});

test("an EMPTY NEWS category with no sourceUrls is never eligible for current", () => {
  const input = validInput();
  const news = input.categories.find(candidate => candidate.kind === "NEWS");
  assert.ok(news);
  news.state = "EMPTY";
  news.sourceUrls = [];
  news.data = null;

  const validation = buildCrawlLatestPersistenceValidation(input);
  const result = category(validation, "NEWS");

  assert.equal(result.state, "EMPTY");
  assert.equal(result.eligibleForCurrent, false);
  assert.equal(result.itemCount, 0);
  assert.equal(result.usableItemCount, 0);
});

const coursesOnlyCapability: LatestStatusCapabilityFile = {
  version: 1,
  resortId: "sample-resort",
  source: { mode: "LIVE", archiveTimestamp: null, urls: [] },
  observedAt: "2025-01-01T00:00:00.000Z",
  crawlerSourceHash: null,
  courses: {
    available: true,
    count: 1,
    fields: { name: true, status: true, update: false, note: false },
    names: ["Aコース"],
    statuses: ["○"],
  },
  lifts: {
    available: false,
    count: 0,
    fields: { name: false, status: false, update: false, note: false },
    names: [],
    statuses: [],
  },
  conditions: {
    comment: false,
    news: false,
    points: [],
    fields: {
      update: false,
      weather: false,
      temperature: false,
      snowDepth: false,
      snowfall: false,
      condition: false,
      windSpeed: false,
    },
  },
};

test("WAYBACK_VALIDATIONの実行は台帳と差分があっても差分は出ない", () => {
  const input = validInput();
  input.sourceMode = "WAYBACK_VALIDATION";
  input.archiveTimestamp = "20260115";
  input.rawPayload = { resortName: "sample-resort" };

  const issues = buildCapabilityGapIssues(input, coursesOnlyCapability);
  assert.deepEqual(issues, []);
});

test("7月に観測したLIVE実行はシーズン外なので差分が出ない", () => {
  const input = validInput();
  input.sourceMode = "LIVE";
  input.observedAt = "2026-07-15T00:00:00.000Z";
  input.rawPayload = { resortName: "sample-resort" };

  const issues = buildCapabilityGapIssues(input, coursesOnlyCapability);
  assert.deepEqual(issues, []);
});

test("1月に観測したLIVE実行は差分が出て、severityはWARNINGでblocksPromotionはfalse", () => {
  const input = validInput();
  input.sourceMode = "LIVE";
  input.observedAt = "2026-01-15T00:00:00.000Z";
  input.rawPayload = { resortName: "sample-resort" };

  const issues = buildCapabilityGapIssues(input, coursesOnlyCapability);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, "CAPABILITY.MISSING_COURSES");
  assert.equal(issues[0].severity, "WARNING");
  assert.equal(issues[0].blocksPromotion, false);
});
