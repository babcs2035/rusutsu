// DB 統合試験が共有する使い捨て PostgreSQL の接続先を検査する．
import assert from "node:assert/strict";

/** 明示されたローカルのテスト DB だけを許可し，通常の接続設定を流用しない． */
export function readTestDatabaseUrl(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const value = environment.TEST_DATABASE_URL;
  if (!value) return undefined;
  const url = new URL(value);
  assert.ok(["postgresql:", "postgres:"].includes(url.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /^\/rusutsu_test_\d+$/u);
  return value;
}
