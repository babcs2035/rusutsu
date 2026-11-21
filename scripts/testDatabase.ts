// DB 統合試験が共有する使い捨て PostgreSQL の接続先を検査する．
/** 明示されたローカルのテスト DB だけを許可し，通常の接続設定を流用しない． */
export function readTestDatabaseUrl(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const value = environment.TEST_DATABASE_URL;
  if (!value) return undefined;
  const url = URL.parse(value);
  // 接続ライブラリによってはクエリで接続先を上書きできる．
  if (
    !url ||
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/rusutsu_test_\d+$/u.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "TEST_DATABASE_URL must target a loopback rusutsu_test_<number> database without URL parameters.",
    );
  }
  return value;
}
