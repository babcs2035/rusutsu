import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { issueAnonymousChallenge, verifyAnonymousProof } from "./challenge";

test("adaptive challenges are identity-bound, scope-bound, signed and short-lived", () => {
  const now = Date.now();
  const challenge = issueAnonymousChallenge("correction", "browser-a", now);
  let nonce = 0;
  while (
    !createHash("sha256")
      .update(`${challenge.token}:${nonce}`)
      .digest("hex")
      .startsWith("0000")
  )
    nonce++;
  const proof = { token: challenge.token, nonce: String(nonce) };
  assert.equal(
    verifyAnonymousProof(proof, "correction", "browser-a", now),
    true,
  );
  assert.equal(
    verifyAnonymousProof(proof, "correction", "browser-b", now),
    false,
  );
  assert.equal(verifyAnonymousProof(proof, "report", "browser-a", now), false);
  assert.equal(
    verifyAnonymousProof(proof, "correction", "browser-a", now + 300_001),
    false,
  );
  assert.equal(
    verifyAnonymousProof(
      { ...proof, token: proof.token.slice(1) },
      "correction",
      "browser-a",
      now,
    ),
    false,
  );
});
