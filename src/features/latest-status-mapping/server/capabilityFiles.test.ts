import assert from "node:assert/strict";
import { test } from "node:test";
import type { LatestStatusCapabilityFile } from "../types.capability";
import {
  parseCapabilityFile,
  serializeCapabilityFile,
} from "./capabilityFiles";

test("壊れたJSONを渡すとnullを返す", () => {
  assert.equal(parseCapabilityFile("sample-resort", "{ not json"), null);
});

test("未知のフィールドは捨てられ、欠けているセクションは安全な既定値になる", () => {
  const raw = JSON.stringify({
    resortId: "resort-a",
    extraTopLevelField: "should be dropped",
    source: {
      mode: "LIVE",
      archiveTimestamp: "20260101",
      urls: ["https://example.com"],
      extra: "should be dropped",
    },
    // courses / lifts / conditions は省略
  });
  const parsed = parseCapabilityFile("resort-a", raw);
  assert.deepEqual(parsed, {
    version: 1,
    resortId: "resort-a",
    source: {
      mode: "LIVE",
      archiveTimestamp: "20260101",
      urls: ["https://example.com"],
    },
    observedAt: new Date(0).toISOString(),
    crawlerSourceHash: null,
    courses: {
      available: false,
      count: 0,
      fields: { name: false, status: false, update: false, note: false },
      names: [],
      statuses: [],
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
  });
});

test("serializeしてparseし直しても台帳の内容は変わらない", () => {
  const original: LatestStatusCapabilityFile = {
    version: 1,
    resortId: "sample-resort",
    source: {
      mode: "WAYBACK_VALIDATION",
      archiveTimestamp: "20260115",
      urls: ["https://web.archive.org/web/20260115/https://example.com"],
    },
    observedAt: "2026-01-15T00:00:00.000Z",
    crawlerSourceHash: "a".repeat(64),
    courses: {
      available: true,
      count: 2,
      fields: { name: true, status: true, update: true, note: false },
      names: ["Aコース", "Bコース"],
      statuses: ["○", "△"],
    },
    lifts: {
      available: true,
      count: 1,
      fields: { name: true, status: true, update: false, note: false },
      names: ["第1リフト"],
      statuses: ["○"],
    },
    conditions: {
      comment: true,
      news: true,
      points: ["山頂", "山麓"],
      fields: {
        update: true,
        weather: true,
        temperature: true,
        snowDepth: true,
        snowfall: true,
        condition: false,
        windSpeed: true,
      },
    },
  };
  const raw = serializeCapabilityFile(original);
  const roundTripped = parseCapabilityFile(original.resortId, raw);
  assert.deepEqual(roundTripped, original);
});
