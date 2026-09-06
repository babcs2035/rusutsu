import assert from "node:assert/strict";
import { test } from "node:test";
import { hasValidInternalDataApiToken } from "./internalDataApiToken";

test("accepts an exact Bearer token", () => {
  assert.equal(
    hasValidInternalDataApiToken("Bearer local-secret", "local-secret"),
    true,
  );
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
