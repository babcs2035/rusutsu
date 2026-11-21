import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPARE_DATA_FRESH_MS,
  isCompareDataFresh,
  shouldRetryCompareData,
} from "./useCompareResorts";

test("比較結果は同じ対象で10分未満の間だけ新鮮とみなす", t => {
  const now = 1_000_000;
  t.mock.method(Date, "now", () => now);

  assert.equal(isCompareDataFresh({ key: "a,b", at: now - 1 }, "a,b"), true);
  assert.equal(
    isCompareDataFresh({ key: "a,b", at: now - COMPARE_DATA_FRESH_MS }, "a,b"),
    false,
  );
  assert.equal(isCompareDataFresh({ key: "a", at: now - 1 }, "a,b"), false);
  assert.equal(isCompareDataFresh(null, "a,b"), false);
});

test("比較取得の失敗や圏外結果は再接続時に再試行する", t => {
  const now = 2_000_000;
  t.mock.method(Date, "now", () => now);

  assert.equal(
    shouldRetryCompareData({ key: "a", at: -Infinity }, "a", true, null),
    true,
  );
  assert.equal(shouldRetryCompareData(null, "a", false, null), false);
  assert.equal(
    shouldRetryCompareData({ key: "a", at: now - 1 }, "a", true, null),
    false,
  );
  assert.equal(shouldRetryCompareData(null, "a", true, "a"), false);
});
