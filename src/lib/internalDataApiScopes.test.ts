import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeInternalDataApiScope } from "./internalDataApiScopes";

const scopedEnvironment = {
  INTERNAL_DATA_API_ADMIN_TOKEN: "admin-secret",
  INTERNAL_DATA_API_CRAWLER_TOKEN: "crawler-secret",
  INTERNAL_DATA_API_DIAGNOSTICS_TOKEN: "diagnostics-secret",
};

test("each scoped token authorizes only its own capability", () => {
  assert.deepEqual(
    authorizeInternalDataApiScope(
      "Bearer admin-secret",
      "admin-data",
      scopedEnvironment,
    ),
    { authorized: true },
  );
  assert.deepEqual(
    authorizeInternalDataApiScope(
      "Bearer crawler-secret",
      "crawler-ingest",
      scopedEnvironment,
    ),
    { authorized: true },
  );
  assert.deepEqual(
    authorizeInternalDataApiScope(
      "Bearer diagnostics-secret",
      "diagnostics-read",
      scopedEnvironment,
    ),
    { authorized: true },
  );

  assert.deepEqual(
    authorizeInternalDataApiScope(
      "Bearer crawler-secret",
      "admin-data",
      scopedEnvironment,
    ),
    { authorized: false, reason: "FORBIDDEN" },
  );
  assert.deepEqual(
    authorizeInternalDataApiScope(
      "Bearer admin-secret",
      "crawler-ingest",
      scopedEnvironment,
    ),
    { authorized: false, reason: "FORBIDDEN" },
  );
});

test("a missing scoped token fails closed once scoped mode is enabled", () => {
  assert.deepEqual(
    authorizeInternalDataApiScope("Bearer legacy-secret", "crawler-ingest", {
      INTERNAL_DATA_API_ADMIN_TOKEN: "admin-secret",
      INTERNAL_DATA_API_TOKEN: "legacy-secret",
    }),
    { authorized: false, reason: "UNCONFIGURED" },
  );
});

test("duplicate scoped secrets make the configuration unavailable", () => {
  assert.deepEqual(
    authorizeInternalDataApiScope("Bearer shared-secret", "admin-data", {
      INTERNAL_DATA_API_ADMIN_TOKEN: "shared-secret",
      INTERNAL_DATA_API_CRAWLER_TOKEN: "shared-secret",
      INTERNAL_DATA_API_DIAGNOSTICS_TOKEN: "diagnostics-secret",
    }),
    { authorized: false, reason: "MISCONFIGURED" },
  );
});

test("legacy shared token grants no capability", () => {
  for (const scope of [
    "admin-data",
    "crawler-ingest",
    "diagnostics-read",
  ] as const) {
    assert.deepEqual(
      authorizeInternalDataApiScope("Bearer legacy-secret", scope, {
        INTERNAL_DATA_API_TOKEN: "legacy-secret",
      }),
      { authorized: false, reason: "UNCONFIGURED" },
    );
  }
});

test("missing and unknown tokens are unauthorized", () => {
  for (const token of [null, "Bearer unknown"]) {
    assert.deepEqual(
      authorizeInternalDataApiScope(token, "admin-data", scopedEnvironment),
      { authorized: false, reason: "UNAUTHORIZED" },
    );
  }
});
