// PostgreSQL export CLI の保存・競合・失敗時の挙動を使い捨て Docker stub で検証する．
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { test } from "node:test";

const backupScript = path.resolve("scripts/ops/backup-database.sh");
const privateTmp = path.resolve("src/private/data/resorts-temporary/tmp");

/** 偽の Docker を使い，既存コンテナへの操作を発生させない． */
function createBackupFixture() {
  mkdirSync(privateTmp, { recursive: true });
  const root = mkdtempSync(path.join(privateTmp, "backup-export-test-"));
  const bin = path.join(root, "bin");
  const output = path.join(root, "unique.dump");
  mkdirSync(bin);
  const docker = path.join(bin, "docker");
  writeFileSync(
    docker,
    `#!/usr/bin/env bash
[[ "$1" == exec && "$2" == "\${DOCKER_TEST_CONTAINER:-rusutsu-db}" && "$*" == *"pg_dump"* ]] || exit 9
[[ "\${DOCKER_FAIL:-}" != dump ]] || exit 1
printf 'PGDMP-test-dump'
`,
  );
  chmodSync(docker, 0o700);
  return {
    root,
    output,
    run(extraEnv: Record<string, string> = {}, args = [output]) {
      return spawnSync("bash", [backupScript, ...args], {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          RUSUTSU_DB_CONTAINER: "",
          ...extraEnv,
        },
        encoding: "utf8",
      });
    },
    clean() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("writes a private PostgreSQL custom-format dump atomically", () => {
  const fixture = createBackupFixture();
  try {
    const result = fixture.run({
      RUSUTSU_DB_CONTAINER: "custom-db",
      DOCKER_TEST_CONTAINER: "custom-db",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(fixture.output, "utf8"), "PGDMP-test-dump");
    assert.equal(statSync(fixture.output).mode & 0o777, 0o600);
    assert.match(result.stdout, /custom-format backup written/u);
  } finally {
    fixture.clean();
  }
});

test("refuses to overwrite an existing destination", () => {
  const fixture = createBackupFixture();
  try {
    writeFileSync(fixture.output, "keep-existing");
    const result = fixture.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /already exists/u);
    assert.equal(readFileSync(fixture.output, "utf8"), "keep-existing");
  } finally {
    fixture.clean();
  }
});

test("removes the incomplete temporary dump after a database export failure", () => {
  const fixture = createBackupFixture();
  try {
    const result = fixture.run({ DOCKER_FAIL: "dump" });
    assert.notEqual(result.status, 0);
    assert.equal(readdirSync(fixture.root).length, 1);
    assert.equal(readdirSync(fixture.root)[0], "bin");
  } finally {
    fixture.clean();
  }
});
