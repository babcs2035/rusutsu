import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  query_timeout: 10_000,
  statement_timeout: 10_000,
});
try {
  await client.connect();
  const result = await client.query(
    'SELECT count(*)::int AS count FROM "ski_resorts"',
  );
  if (!result.rows[0]?.count) throw new Error("No existing resort master.");
  console.log("Existing resort database is reachable and nonempty.");
} catch {
  console.error(
    "Cannot verify the existing resort DB with the new app settings. No reset or empty-DB creation will be attempted.",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
