import assert from "node:assert/strict";
import { test } from "node:test";
import { crawlLatestRunInputSchema } from "./contract";

type TestCategory = {
  kind: "COMMENT" | "WEATHER" | "COURSES" | "LIFTS";
  state: "SUCCESS" | "EMPTY" | "NOT_SUPPORTED" | "FAILED";
  data: unknown;
  sourceUrls: string[];
};

type TestPayload = {
  schemaVersion: 1;
  producerId: string;
  resortId: string;
  observedAt: string;
  completedAt: string;
  sourceMode: "LIVE" | "WAYBACK_VALIDATION" | "LEGACY_IMPORT";
  crawler: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
  categories: TestCategory[];
  issues: unknown[];
  artifacts: unknown[];
};

const validPayload = (): TestPayload => ({
  schemaVersion: 1,
  producerId: "crawl_latest",
  resortId: "sample-resort",
  observedAt: "2026-09-04T01:00:00.000Z",
  completedAt: "2026-09-04T01:00:10.000Z",
  sourceMode: "LIVE",
  crawler: {
    file: "src/private/scripts/crawl_latest/resorts/sample-resort.ts",
    revision: "abc123",
    sourceSha256: "a".repeat(64),
  },
  rawPayload: {
    resortName: "sample-resort",
    comment: "Open",
  },
  categories: [
    {
      kind: "COMMENT",
      state: "SUCCESS",
      data: { value: "Open" },
      sourceUrls: ["https://example.com/status"],
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

test("accepts a complete LIVE run and applies safe defaults", () => {
  const result = crawlLatestRunInputSchema.safeParse(validPayload());

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.categories.length, 4);
  assert.deepEqual(result.data.issues, []);
  assert.deepEqual(result.data.artifacts, []);
});

test("accepts an explicitly validated empty comment", () => {
  const payload = validPayload();
  payload.categories[0] = {
    kind: "COMMENT",
    state: "SUCCESS",
    data: { value: null },
    sourceUrls: [],
  };

  assert.equal(crawlLatestRunInputSchema.safeParse(payload).success, true);
});

test("accepts a FAILED run with a minimal diagnostic raw payload", () => {
  const payload = validPayload();
  payload.rawPayload = { failure: "navigation failed" };
  payload.categories = payload.categories.map(category => ({
    ...category,
    state: "FAILED",
    data: { reason: "navigation failed" },
  }));
  payload.issues = [
    {
      externalId: "issue-1",
      severity: "ERROR",
      code: "NAVIGATION.ERROR",
      message: "Navigation failed",
      occurrences: 1,
      blocksPromotion: true,
    },
  ];

  assert.equal(crawlLatestRunInputSchema.safeParse(payload).success, true);
});

test("rejects duplicate or missing category kinds", () => {
  const payload = validPayload();
  payload.categories[3] = { ...payload.categories[2] };

  const result = crawlLatestRunInputSchema.safeParse(payload);
  assert.equal(result.success, false);
  if (result.success) return;
  assert.match(
    result.error.issues.map(issue => issue.message).join("\n"),
    /duplicate category kind|missing category kind/u,
  );
});

test("rejects an empty SUCCESS operation category", () => {
  const payload = validPayload();
  payload.categories[2] = {
    kind: "COURSES",
    state: "SUCCESS",
    data: [],
    sourceUrls: [],
  };

  assert.equal(crawlLatestRunInputSchema.safeParse(payload).success, false);
});

test("requires archiveTimestamp only for a Wayback validation run", () => {
  const missingTimestamp = validPayload();
  missingTimestamp.sourceMode = "WAYBACK_VALIDATION";
  assert.equal(
    crawlLatestRunInputSchema.safeParse(missingTimestamp).success,
    false,
  );

  const liveWithTimestamp = validPayload();
  Object.assign(liveWithTimestamp, { archiveTimestamp: "20260101120000" });
  assert.equal(
    crawlLatestRunInputSchema.safeParse(liveWithTimestamp).success,
    false,
  );

  const validWayback = validPayload();
  validWayback.sourceMode = "WAYBACK_VALIDATION";
  Object.assign(validWayback, { archiveTimestamp: "20260101120000" });
  assert.equal(crawlLatestRunInputSchema.safeParse(validWayback).success, true);
});

test("accepts artifact metadata and rejects a DOM body", () => {
  const payload = validPayload();
  const artifact = {
    kind: "RENDERED_DOM",
    state: "AVAILABLE",
    pageKey: "status-page",
    storageKey: "crawl-latest/sample/run/status.html",
    sha256: "b".repeat(64),
    sizeBytes: 1_024,
    redactionVersion: 1,
    issueExternalIds: [],
    capturedAt: "2026-09-04T01:00:09.000Z",
  };
  payload.artifacts = [artifact];
  assert.equal(crawlLatestRunInputSchema.safeParse(payload).success, true);

  Object.assign(artifact, { html: "<html>secret</html>" });
  assert.equal(crawlLatestRunInputSchema.safeParse(payload).success, false);
});
