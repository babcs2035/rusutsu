// 単体・DB・ブラウザ試験を既存 test コマンドから選択し，一つの使い捨て DB で直列検証する．
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { readTestDatabaseUrl } from "./testDatabase";

const root = "src/private/data/resorts-temporary/tmp/test-runner";
const databaseName = `rusutsu_test_${process.pid}`;
const containerName = `rusutsu-tests-${process.pid}`;
const databaseImage = "postgres:16-alpine";
const unitTestTimeoutMs = 60_000;
const testDatabaseLockKey = "rusutsu:test-runner";
const browserTests = [
  "scripts/testOfflineOverview.ts",
  "scripts/testOfflineDetail.ts",
  "scripts/testOfflineRetention.ts",
  "scripts/testPublicWorkflow.ts",
];

/** 生成物・データ・依存を探索せず，管理する試験ファイルだけを列挙する． */
async function collect(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (
        ["node_modules", ".git"].includes(entry.name) ||
        file === "src/private/data"
      )
        continue;
      files.push(...(await collect(file)));
    } else if (entry.isFile() && /\.test\.tsx?$/u.test(entry.name))
      files.push(file);
  }
  return files;
}

/** 引数を shell で再解釈せず，終了コードと signal を親へ伝える． */
async function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    const stop = (signal: NodeJS.Signals): void => {
      child.kill(signal);
    };
    const interrupt = (): void => stop("SIGINT");
    const terminate = (): void => stop("SIGTERM");
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", terminate);
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${signal ?? code})`));
    });
  });
}

/** 検査済みの使い捨て DB で，migration 履歴を保持して suite の状態を初期化する． */
async function clearTestFixtures(client: Client): Promise<void> {
  const tables = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  if (tables.rows.length) {
    const names = tables.rows.map(
      row => `public."${row.tablename.replaceAll('"', '""')}"`,
    );
    await client.query(`TRUNCATE ${names.join(", ")} RESTART IDENTITY`);
  }
}

/** 通常の DATABASE_URL を流用せず，必要な場合だけ試験専用コンテナを作成する． */
function createDatabase(): string {
  const created = spawnSync(
    "docker",
    [
      "run",
      "--detach",
      "--name",
      containerName,
      "--label",
      "com.rusutsu.test=database",
      "--publish",
      "127.0.0.1::5432",
      "--tmpfs",
      "/var/lib/postgresql/data",
      "--env",
      "POSTGRES_USER=rusutsu_test",
      "--env",
      "POSTGRES_PASSWORD=ephemeral_test_only",
      "--env",
      `POSTGRES_DB=${databaseName}`,
      "--health-cmd",
      `pg_isready -h 127.0.0.1 -U rusutsu_test -d ${databaseName}`,
      "--health-interval",
      "1s",
      "--health-retries",
      "30",
      databaseImage,
    ],
    { encoding: "utf8" },
  );
  if (created.status !== 0)
    throw new Error(
      "Cannot create disposable test PostgreSQL. Start Docker or configure TEST_DATABASE_URL.",
    );
  const port = spawnSync("docker", ["port", containerName, "5432/tcp"], {
    encoding: "utf8",
  });
  const number = /^127\.0\.0\.1:(\d+)\s*$/u.exec(port.stdout)?.[1];
  if (!number) throw new Error("Cannot resolve disposable database port.");
  return `postgresql://rusutsu_test:ephemeral_test_only@127.0.0.1:${number}/${databaseName}`;
}

/** 全体・単体・DB・既存の production サーバーを使うブラウザ試験を切り替える． */
async function main(): Promise<void> {
  const args = process.argv.slice(2).filter(arg => arg !== "--");
  const mode = args.shift() ?? "--all";
  if (!["--all", "--unit", "--db", "--browser"].includes(mode)) {
    throw new Error(
      "Usage: mise run test -- [--all|--unit|--db|--browser] [test-file...]",
    );
  }
  await mkdir(root, { recursive: true });
  const scratch = await mkdtemp(path.resolve(root, "run-"));
  try {
    const config = path.join(scratch, "tsconfig.json");
    await writeFile(
      config,
      JSON.stringify({
        extends: path.resolve("tsconfig.json"),
        compilerOptions: { jsx: "react-jsx" },
      }),
    );
    await runSelectedTests(mode, args, {
      ...process.env,
      TSX_TSCONFIG_PATH: config,
      RUSUTSU_TEST_ARTIFACT_DIR: scratch,
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/** 一時ファイルを実行単位のディレクトリに集めて試験する． */
async function runSelectedTests(
  mode: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  if (mode === "--browser") {
    if (args.some(file => !browserTests.includes(file)))
      throw new Error("Select an existing browser test file.");
    for (const file of args.length ? args : browserTests)
      await run(process.execPath, [file], env);
    return;
  }
  const files = [
    ...(await collect("src")),
    ...(await collect("scripts")),
  ].sort();
  if (args.some(file => !files.includes(file)))
    throw new Error("Select existing test files below src/ or scripts/.");
  const selected = args.length
    ? files.filter(file => args.includes(file))
    : files;
  const integrationSuffix = /\.integration\.test\.tsx?$/u;
  const unit = selected.filter(file => !integrationSuffix.test(file));
  const integration = selected.filter(file => integrationSuffix.test(file));
  if (
    (!unit.length && mode === "--unit") ||
    (!integration.length && mode === "--db") ||
    !selected.length
  )
    throw new Error("Required test suites are missing.");
  if (mode !== "--db" && unit.length)
    await run(
      process.execPath,
      [
        "--import",
        "tsx",
        "--test",
        `--test-timeout=${unitTestTimeoutMs}`,
        ...unit,
      ],
      env,
    );
  if (mode === "--unit" || !integration.length) return;
  let databaseUrl = readTestDatabaseUrl();
  let owned = false;
  let lockClient: Client | undefined;
  try {
    if (!databaseUrl) {
      if (process.env.CI)
        throw new Error(
          "CI requires TEST_DATABASE_URL; DB tests must not be skipped.",
        );
      owned = true;
      databaseUrl = createDatabase();
      await run(
        "docker",
        [
          "exec",
          containerName,
          "sh",
          "-c",
          `timeout 45 sh -c 'until pg_isready -h 127.0.0.1 -U rusutsu_test -d ${databaseName}; do sleep 1; done'`,
        ],
        env,
      );
    }
    const databaseEnv = {
      ...env,
      TEST_DATABASE_URL: databaseUrl,
      DATABASE_URL: databaseUrl,
    };
    readTestDatabaseUrl(databaseEnv);
    lockClient = new Client({ connectionString: databaseUrl });
    await lockClient.connect();
    const lock = await lockClient.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
      [testDatabaseLockKey],
    );
    if (!lock.rows[0]?.acquired)
      throw new Error("Another test runner is using this test database.");
    await run("pnpm", ["exec", "prisma", "migrate", "deploy"], databaseEnv);
    for (const file of integration) {
      await clearTestFixtures(lockClient);
      await run(
        process.execPath,
        ["--import", "tsx", "--test", file],
        databaseEnv,
      );
    }
    await clearTestFixtures(lockClient);
  } finally {
    try {
      await lockClient?.end();
    } finally {
      if (owned) {
        const removed = spawnSync("docker", ["rm", "--force", containerName], {
          stdio: "inherit",
        });
        if (removed.status !== 0) {
          console.error(
            `Could not remove owned test container ${containerName}`,
          );
          process.exitCode = 1;
        }
      }
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Test runner failed");
  process.exitCode = 1;
});
