import assert from "node:assert/strict";
import { test } from "node:test";
import type { CrawlLatestApiResult } from "@/private/scripts/crawl_latest/shared/http-run-finalizer";
import {
  classifyCrawlerCompletion,
  isActiveCrawlerFile,
} from "./runCrawlLatestBatch";

const apiResult = (
  outcome: CrawlLatestApiResult["outcome"],
): CrawlLatestApiResult => ({
  runId: "cm1samplecrawlrun",
  outcome,
  created: true,
});

test("active crawler filter excludes templates and retired snapshots", () => {
  assert.equal(isActiveCrawlerFile("rusutsu-resort.ts"), true);
  assert.equal(isActiveCrawlerFile("template.ts"), false);
  assert.equal(isActiveCrawlerFile("resort_before.ts"), false);
  assert.equal(isActiveCrawlerFile("resort.test.ts"), false);
});

test("remote mode uses the persisted API outcome instead of warning text", () => {
  assert.equal(
    classifyCrawlerCompletion({
      mode: "remote-api",
      timedOut: false,
      exitCode: 0,
      warningCount: 3,
      apiResults: [apiResult("SUCCESS")],
      apiResultErrors: [],
    }).status,
    "success",
  );
  assert.equal(
    classifyCrawlerCompletion({
      mode: "remote-api",
      timedOut: false,
      exitCode: 0,
      warningCount: 0,
      apiResults: [apiResult("PARTIAL")],
      apiResultErrors: [],
    }).status,
    "warning",
  );
  assert.equal(
    classifyCrawlerCompletion({
      mode: "remote-api",
      timedOut: false,
      exitCode: 0,
      warningCount: 0,
      apiResults: [apiResult("FAILED")],
      apiResultErrors: [],
    }).status,
    "failed",
  );
});

test("remote mode fails closed when its machine-readable API result is absent", () => {
  for (const input of [
    { apiResults: [], apiResultErrors: [] },
    {
      apiResults: [apiResult("SUCCESS"), apiResult("SUCCESS")],
      apiResultErrors: [],
    },
    { apiResults: [apiResult("SUCCESS")], apiResultErrors: ["invalid JSON"] },
  ]) {
    const result = classifyCrawlerCompletion({
      mode: "remote-api",
      timedOut: false,
      exitCode: 0,
      warningCount: 0,
      ...input,
    });
    assert.equal(result.status, "failed");
    assert.equal(typeof result.batchError, "string");
  }
});

test("local mode keeps terminal warnings as its status source", () => {
  assert.equal(
    classifyCrawlerCompletion({
      mode: "local-files",
      timedOut: false,
      exitCode: 0,
      warningCount: 1,
      apiResults: [],
      apiResultErrors: [],
    }).status,
    "warning",
  );
});

test("timeout and non-zero exit override an API outcome", () => {
  assert.equal(
    classifyCrawlerCompletion({
      mode: "remote-api",
      timedOut: true,
      exitCode: null,
      warningCount: 0,
      apiResults: [apiResult("SUCCESS")],
      apiResultErrors: [],
    }).status,
    "timeout",
  );
  assert.equal(
    classifyCrawlerCompletion({
      mode: "remote-api",
      timedOut: false,
      exitCode: 1,
      warningCount: 0,
      apiResults: [apiResult("SUCCESS")],
      apiResultErrors: [],
    }).status,
    "failed",
  );
});

test("local-files child environment strips API and DB credentials and blocks dotenv reloading", async () => {
  const { childEnvironment } = await import("./runCrawlLatestBatch");
  const local = childEnvironment("local-files", {
    NODE_ENV: "test",
    DATA_API_BASE_URL: "https://production.example/rusutsu",
    DATABASE_URL: "production-db",
    INTERNAL_DATA_API_ADMIN_TOKEN: "admin",
    INTERNAL_DATA_API_CRAWLER_TOKEN: "crawler",
    INTERNAL_DATA_API_DIAGNOSTICS_TOKEN: "diagnostics",
    INTERNAL_DATA_API_TOKEN: "legacy",
  });
  for (const key of [
    "DATA_API_BASE_URL",
    "DATABASE_URL",
    "INTERNAL_DATA_API_ADMIN_TOKEN",
    "INTERNAL_DATA_API_CRAWLER_TOKEN",
    "INTERNAL_DATA_API_DIAGNOSTICS_TOKEN",
    "INTERNAL_DATA_API_TOKEN",
  ])
    assert.equal(local[key], "");
  const remote = childEnvironment("remote-api", {
    NODE_ENV: "test",
    DATA_API_BASE_URL: "https://production.example/rusutsu",
    DATABASE_URL: "production-db",
    INTERNAL_DATA_API_ADMIN_TOKEN: "admin",
    INTERNAL_DATA_API_CRAWLER_TOKEN: "crawler",
    INTERNAL_DATA_API_DIAGNOSTICS_TOKEN: "diagnostics",
  });
  assert.equal(remote.INTERNAL_DATA_API_CRAWLER_TOKEN, "crawler");
  assert.equal(remote.DATABASE_URL, "");
  assert.equal(remote.INTERNAL_DATA_API_ADMIN_TOKEN, "");
  assert.equal(remote.INTERNAL_DATA_API_DIAGNOSTICS_TOKEN, "");
});
