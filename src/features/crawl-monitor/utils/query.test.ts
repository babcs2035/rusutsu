import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildQueryString,
  parseIssueQuery,
  parseOverviewQuery,
  parsePage,
  parseSourceModes,
  sinceFromDays,
} from "./query";

test("source modes default to live and drop unknown values", () => {
  assert.deepEqual(parseSourceModes(undefined), ["LIVE"]);
  assert.deepEqual(parseSourceModes("LEGACY_IMPORT"), ["LIVE"]);
  assert.deepEqual(parseSourceModes("WAYBACK_VALIDATION"), [
    "WAYBACK_VALIDATION",
  ]);
  assert.deepEqual(parseSourceModes("WAYBACK_VALIDATION,LIVE"), [
    "LIVE",
    "WAYBACK_VALIDATION",
  ]);
});

test("page numbers are clamped into a usable range", () => {
  assert.equal(parsePage(undefined), 1);
  assert.equal(parsePage("0"), 1);
  assert.equal(parsePage("-3"), 1);
  assert.equal(parsePage("abc"), 1);
  assert.equal(parsePage("7"), 7);
  assert.equal(parsePage("9999"), 200);
});

test("overview query keeps only known status filters", () => {
  const query = parseOverviewQuery({
    q: " ルスツ ",
    prefecture: "北海道",
    status: "unknown-value",
    page: "2",
  });
  assert.equal(query.q, "ルスツ");
  assert.equal(query.prefecture, "北海道");
  assert.equal(query.status, "all");
  assert.equal(query.page, 2);

  assert.equal(parseOverviewQuery({ status: "attention" }).status, "attention");
});

test("issue query normalizes optional filters to null", () => {
  const empty = parseIssueQuery({});
  assert.equal(empty.severity, null);
  assert.equal(empty.code, null);
  assert.equal(empty.resortId, null);
  assert.equal(empty.categoryKind, null);
  assert.equal(empty.blockingOnly, false);
  assert.equal(empty.days, null);

  const filled = parseIssueQuery({
    severity: "ERROR",
    code: "WEATHER_EMPTY",
    resortId: "rusutsu-resort",
    categoryKind: "LIFTS",
    blockingOnly: "1",
    days: "7",
  });
  assert.equal(filled.severity, "ERROR");
  assert.equal(filled.code, "WEATHER_EMPTY");
  assert.equal(filled.categoryKind, "LIFTS");
  assert.equal(filled.blockingOnly, true);
  assert.equal(filled.days, 7);

  assert.equal(parseIssueQuery({ severity: "FATAL" }).severity, null);
  assert.equal(parseIssueQuery({ categoryKind: "SNOW" }).categoryKind, null);
});

test("since is computed from the day filter", () => {
  const now = Date.UTC(2026, 8, 17, 0, 0, 0);
  assert.equal(sinceFromDays(null, now), null);
  assert.equal(sinceFromDays(1, now), new Date(now - 86_400_000).toISOString());
});

test("query strings drop empty values and keep filters", () => {
  assert.equal(
    buildQueryString(
      { q: "ルスツ", prefecture: "", blockingOnly: false, page: 1 },
      { page: 3 },
    ),
    "?q=%E3%83%AB%E3%82%B9%E3%83%84&page=3",
  );
  assert.equal(buildQueryString({}), "");
  assert.equal(buildQueryString({ blockingOnly: true }), "?blockingOnly=1");
});
