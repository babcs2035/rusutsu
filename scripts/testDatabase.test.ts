// 開発・本番の DB を統合試験から保護する接続条件を検査する．
import assert from "node:assert/strict";
import { test } from "node:test";
import { readTestDatabaseUrl } from "./testDatabase";

test("integration tests accept only explicitly configured local disposable databases", () => {
  assert.equal(
    readTestDatabaseUrl({ DATABASE_URL: "not-a-test-db" }),
    undefined,
  );
  const accepted = "postgresql://test:test@127.0.0.1:55491/rusutsu_test_1";
  assert.equal(readTestDatabaseUrl({ TEST_DATABASE_URL: accepted }), accepted);
  for (const url of [
    "postgresql://test:test@db.example.test/rusutsu_test_1",
    "postgresql://test:test@localhost/rusutsu",
    "postgresql://test:test@localhost/postgres",
    "https://localhost/rusutsu_test_1",
  ]) {
    assert.throws(() => readTestDatabaseUrl({ TEST_DATABASE_URL: url }));
  }
});
