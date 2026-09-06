import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  prepareEnvironment,
  shellEnvironment,
} from "./prepare-environment.mjs";
import { existingContainers, settings } from "./test-fixtures.mjs";

test("bootstrap preserves DB identity/credentials, OAuth and ports and normalizes the public origin", () => {
  const output = prepareEnvironment(existingContainers(), settings);
  assert.equal(output.COMPOSE_PROJECT_NAME, "test-project");
  assert.equal(output.POSTGRES_VOLUME, "existing-data");
  assert.equal(output.POSTGRES_PASSWORD, "sentinel-db-password");
  assert.equal(output.AUTH_SECRET, "sentinel-auth-secret");
  assert.equal(output.APP_PORT, "13000");
  assert.equal(output.DB_PORT, "15432");
  assert.equal(output.AUTH_URL, "https://example.test");
  assert.equal(output.DATA_API_BASE_URL, "https://example.test/rusutsu");
});

test("explicit GitHub URL overrides the old origin while API scopes remain independent", () => {
  const output = prepareEnvironment(existingContainers(), {
    ...settings,
    DATA_API_BASE_URL: "https://new.example.test/rusutsu/",
  });
  assert.equal(output.AUTH_URL, "https://new.example.test");
  assert.equal(output.DATA_API_BASE_URL, "https://new.example.test/rusutsu");
  assert.equal(
    output.INTERNAL_DATA_API_CRAWLER_TOKEN,
    settings.INTERNAL_DATA_API_CRAWLER_TOKEN,
  );
});

for (const failure of [
  "missing-db",
  "wrong-project",
  "bind-mount",
  "missing-volume",
  "wrong-password",
  "wrong-db",
  "bad-url",
  "missing-auth",
  "weak-token",
  "duplicate-token",
]) {
  test(`bootstrap rejects ${failure} without printing secret values`, () => {
    const containers = existingContainers();
    const updates = { ...settings };
    if (failure === "missing-db") containers.splice(0, 1);
    if (failure === "wrong-project")
      containers[1].Config.Labels["com.docker.compose.project"] = "other";
    if (failure === "bind-mount") {
      assert.ok(containers[0].Mounts);
      containers[0].Mounts[0].Type = "bind";
    }
    if (failure === "missing-volume") containers[0].Mounts = [];
    if (failure === "wrong-password")
      containers[0].Config.Env[1] = "POSTGRES_PASSWORD=other-password";
    if (failure === "wrong-db")
      containers[0].Config.Env[2] = "POSTGRES_DB=other_database";
    if (failure === "bad-url")
      updates.DATA_API_BASE_URL = "http://sentinel-host/rusutsu";
    if (failure === "missing-auth")
      containers[1].Config.Env = containers[1].Config.Env.filter(
        s => !s.startsWith("AUTH_SECRET="),
      );
    if (failure === "weak-token")
      updates.INTERNAL_DATA_API_ADMIN_TOKEN = "short";
    if (failure === "duplicate-token")
      updates.INTERNAL_DATA_API_CRAWLER_TOKEN =
        updates.INTERNAL_DATA_API_ADMIN_TOKEN;
    assert.throws(
      () => prepareEnvironment(containers, updates),
      error => {
        assert.doesNotMatch(
          String(error),
          /sentinel|other-password|other_database/,
        );
        return true;
      },
    );
  });
}

test("generated settings preserve shell metacharacters as data, never commands", () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "rusutsu-settings-test-"),
  );
  try {
    const marker = path.join(directory, "must-not-exist");
    const value = `spaces ' " $HOME \\ \`touch ${marker}\` $(touch ${marker}) # =`;
    const config = path.join(directory, "runtime.env.sh");
    writeFileSync(config, shellEnvironment({ SECRET_TEST_VALUE: value }), {
      mode: 0o600,
    });
    const result = spawnSync(
      "bash",
      ["-c", 'source "$1"; printf "%s" "$SECRET_TEST_VALUE"', "test", config],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, value);
    assert.equal(existsSync(marker), false);
    assert.throws(() =>
      shellEnvironment({ SECRET_TEST_VALUE: "first\nsecond" }),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("GitHub settings payload is masked and incomplete Secrets never emit a payload", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "rusutsu-gh-settings-"));
  try {
    const file = path.join(directory, "github-env");
    const result = spawnSync(
      process.execPath,
      ["scripts/ops/production-settings.mjs"],
      {
        env: { ...process.env, ...settings, GITHUB_ENV: file },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const payload = readFileSync(file, "utf8").trim().split("=")[1];
    assert.ok(result.stdout.includes(`::add-mask::${payload}`));
    assert.equal(
      JSON.parse(Buffer.from(payload, "base64").toString())
        .INTERNAL_DATA_API_ADMIN_TOKEN,
      settings.INTERNAL_DATA_API_ADMIN_TOKEN,
    );
    assert.ok(!result.stdout.includes(settings.INTERNAL_DATA_API_ADMIN_TOKEN));
    const failed = spawnSync(
      process.execPath,
      ["scripts/ops/production-settings.mjs"],
      {
        env: {
          ...process.env,
          ...settings,
          INTERNAL_DATA_API_ADMIN_TOKEN: "",
          GITHUB_ENV: path.join(directory, "rejected"),
        },
        encoding: "utf8",
      },
    );
    assert.equal(failed.status, 1);
    assert.equal(existsSync(path.join(directory, "rejected")), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("optional GitHub login Secrets update selected values and preserve the rest", () => {
  const output = prepareEnvironment(existingContainers(), {
    ...settings,
    ADMIN_EMAILS: "new-admin@example.test",
    GOOGLE_CLIENT_SECRET: "replacement-secret",
  });
  assert.equal(output.ADMIN_EMAILS, "new-admin@example.test");
  assert.equal(output.GOOGLE_CLIENT_SECRET, "replacement-secret");
  assert.equal(output.AUTH_SECRET, "sentinel-auth-secret");
  assert.equal(output.POSTGRES_PASSWORD, "sentinel-db-password");
});
