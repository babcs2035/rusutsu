import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const available = spawnSync("docker", ["compose", "version"]).status === 0;
const required = {
  AUTH_SECRET: "test-auth-secret",
  AUTH_URL: "https://example.test",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  ADMIN_EMAILS: "admin@example.test",
  POSTGRES_PASSWORD: "test-db-password",
  PRODUCTION_DATABASE_URL: "postgresql://test:test-db-password@db:5432/test",
  POSTGRES_VOLUME: "already-existing-data",
  DATA_API_BASE_URL: "https://example.test/rusutsu",
  INTERNAL_DATA_API_ADMIN_TOKEN: "a".repeat(64),
  INTERNAL_DATA_API_CRAWLER_TOKEN: "b".repeat(64),
  INTERNAL_DATA_API_DIAGNOSTICS_TOKEN: "c".repeat(64),
};

function config(env: Partial<NodeJS.ProcessEnv>, json = false) {
  return spawnSync(
    "docker",
    [
      "compose",
      "--env-file",
      "/dev/null",
      "-f",
      "docker-compose.production.yml",
      "--profile",
      "crawlers",
      "config",
      ...(json ? ["--format", "json"] : ["--quiet"]),
    ],
    { env: { ...process.env, ...required, ...env }, encoding: "utf8" },
  );
}

test("production Compose isolates tokens and waits for DB/API health", {
  skip: !available,
}, () => {
  const result = config({}, true);
  assert.equal(result.status, 0, result.stderr);
  const compose = JSON.parse(result.stdout);
  const { app, "crawl-latest-scheduler": worker } = compose.services;
  assert.equal(app.environment.DATA_API_BASE_URL, undefined);
  assert.equal(compose.volumes.postgres_data.external, true);
  assert.equal(compose.volumes.postgres_data.name, "already-existing-data");
  assert.equal(worker.environment.DATABASE_URL, undefined);
  assert.equal(worker.environment.INTERNAL_DATA_API_ADMIN_TOKEN, undefined);
  assert.equal(
    worker.environment.INTERNAL_DATA_API_DIAGNOSTICS_TOKEN,
    undefined,
  );
  assert.equal(worker.depends_on.app.condition, "service_healthy");
  assert.equal(app.depends_on.db.condition, "service_healthy");
  assert.deepEqual(worker.profiles, ["crawlers"]);
  assert.deepEqual(Object.keys(compose.volumes).sort(), [
    "crawler_artifacts",
    "crawler_worker_artifacts",
    "postgres_data",
  ]);
});

for (const key of Object.keys(required)) {
  test(`production Compose rejects missing ${key}`, {
    skip: !available,
  }, () => {
    assert.notEqual(config({ [key]: "" }).status, 0);
  });
}

test("Compose serializes literal dollars without substituting their contents", {
  skip: !available,
}, () => {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Verify literal Compose interpolation characters in credentials.
  const secret = "literal-$UNSET-${UNSET}-$$-quotes'\"-backslash\\";
  const result = config(
    { AUTH_SECRET: secret, POSTGRES_PASSWORD: secret },
    true,
  );
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  // `config` emits a reusable Compose document and therefore doubles dollars.
  // The disposable Docker integration test checks the actual container value.
  const serialized = secret.replaceAll("$", () => "$$");
  assert.equal(parsed.services.app.environment.AUTH_SECRET, serialized);
  assert.equal(parsed.services.db.environment.POSTGRES_PASSWORD, serialized);
});
