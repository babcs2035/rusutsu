// 試験用データベースの起動に失敗したときの Docker 操作を検証する．
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

test("a Docker name conflict leaves the existing container alone", async () => {
  const artifacts = process.env.RUSUTSU_TEST_ARTIFACT_DIR;
  assert.ok(artifacts, "Run this test through the test runner.");
  const directory = await mkdtemp(path.join(artifacts, "docker-conflict-"));
  const log = path.join(directory, "docker-commands");
  try {
    await writeFile(
      path.join(directory, "docker"),
      '#!/bin/sh\nprintf "%s\\n" "$1" >> "$RUSUTSU_DOCKER_COMMAND_LOG"\nexit 125\n',
      { mode: 0o700 },
    );
    const env = {
      ...process.env,
      CI: "",
      TEST_DATABASE_URL: "",
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      RUSUTSU_DOCKER_COMMAND_LOG: log,
    };
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/runTests.ts",
        "--db",
        "src/features/favorites/actions.integration.test.ts",
      ],
      { env, encoding: "utf8" },
    );
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Cannot create disposable test PostgreSQL/u);
    assert.equal(await readFile(log, "utf8"), "run\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
