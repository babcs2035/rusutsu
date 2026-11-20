import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authorizeApiBearerToken,
  hasValidInternalDataApiToken,
} from "./internalDataApiToken";

test("accepts an exact Bearer token", () => {
  assert.equal(
    hasValidInternalDataApiToken("Bearer local-secret", "local-secret"),
    true,
  );
});

test("administrative API requires the single configured server token", () => {
  const env = { API_BEARER_TOKEN: "test-api-token" };
  assert.deepEqual(authorizeApiBearerToken("Bearer test-api-token", env), {
    authorized: true,
  });
  assert.deepEqual(authorizeApiBearerToken(null, env), {
    authorized: false,
    reason: "UNAUTHORIZED",
  });
  assert.deepEqual(authorizeApiBearerToken("Bearer wrong-token", env), {
    authorized: false,
    reason: "UNAUTHORIZED",
  });
  assert.deepEqual(authorizeApiBearerToken("Bearer test-api-token", {}), {
    authorized: false,
    reason: "UNCONFIGURED",
  });
});

test("rejects missing, malformed, and different tokens", () => {
  assert.equal(hasValidInternalDataApiToken(null, "local-secret"), false);
  assert.equal(
    hasValidInternalDataApiToken("Basic local-secret", "local-secret"),
    false,
  );
  assert.equal(
    hasValidInternalDataApiToken("Bearer local-secret extra", "local-secret"),
    false,
  );
  assert.equal(
    hasValidInternalDataApiToken("Bearer another-secret", "local-secret"),
    false,
  );
  assert.equal(hasValidInternalDataApiToken("Bearer token", ""), false);
});
