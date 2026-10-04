import assert from "node:assert/strict";
import { test } from "node:test";
import { canEdit, isUserRole } from "@/lib/roles";
import { assertBoundedPayload, assertCorrectionScope } from "./contract";
import { validateEditPayload } from "./payloadSchema";
import {
  assertCanReadRequest,
  assertPendingVersion,
  assertReviewActors,
} from "./policy";

test("only an editor's own request or an administrator can read a request", () => {
  const request = { authorId: "author" };
  assert.doesNotThrow(() =>
    assertCanReadRequest({ id: "author", role: "editor" }, request),
  );
  assert.doesNotThrow(() =>
    assertCanReadRequest({ id: "admin", role: "admin" }, request),
  );
  for (const actor of [
    { id: "other", role: "editor" },
    { id: "author", role: "viewer" },
    { id: "author", role: "unknown" },
  ])
    assert.throws(() => assertCanReadRequest(actor, request));
  assert.equal(canEdit("viewer"), false);
  assert.equal(canEdit("unknown"), false);
  assert.equal(isUserRole("editor"), true);
});
test("terminal states and stale review versions cannot be approved", () => {
  assert.doesNotThrow(() =>
    assertPendingVersion({ status: "PENDING", version: 3 }, 3),
  );
  for (const status of ["APPLIED", "REJECTED", "WITHDRAWN", "CONFLICT"])
    assert.throws(() => assertPendingVersion({ status, version: 3 }, 3));
  assert.throws(() =>
    assertPendingVersion({ status: "PENDING", version: 4 }, 3),
  );
  assert.throws(() =>
    assertReviewActors({ role: "editor" }, { role: "editor" }),
  );
  assert.throws(() =>
    assertReviewActors({ role: "admin" }, { role: "viewer" }),
  );
  assert.throws(() => assertReviewActors({ role: "admin" }, null));
});
test("administrator corrections cannot rebase or redirect a submitted request", () => {
  const original = {
    resortId: "example",
    fileHash: "a".repeat(64),
    lifts: [{ targetSkiId: "example", properties: { name: "Before" } }],
  };
  assert.doesNotThrow(() =>
    assertCorrectionScope(original, {
      ...original,
      lifts: [{ ...original.lifts[0], properties: { name: "Corrected" } }],
    }),
  );
  assert.throws(() =>
    assertCorrectionScope(original, { ...original, fileHash: "b".repeat(64) }),
  );
  assert.throws(() =>
    assertCorrectionScope(original, {
      ...original,
      lifts: [{ ...original.lifts[0], targetSkiId: "other" }],
    }),
  );
});
test("administrator corrections may split, reorder and remove identified items", () => {
  const course = (id: string, name: string) => ({
    targetSkiId: "example",
    properties: { entityId: id, name },
  });
  const original = {
    resortId: "example",
    courses: [course("a", "A"), course("b", "B")],
  };
  assert.doesNotThrow(() =>
    assertCorrectionScope(original, {
      ...original,
      courses: [course("b", "B"), course("a", "A上部"), course("c", "A下部")],
    }),
  );
  assert.doesNotThrow(() =>
    assertCorrectionScope(original, {
      ...original,
      courses: [course("a", "A")],
    }),
  );
  assert.throws(() =>
    assertCorrectionScope(original, {
      ...original,
      courses: [
        { ...course("a", "A"), targetSkiId: "other" },
        course("b", "B"),
      ],
    }),
  );
  assert.throws(() =>
    assertCorrectionScope(original, {
      ...original,
      courses: [...original.courses, { ...course("c", "C"), targetSkiId: "x" }],
    }),
  );
});
test("malformed, oversized and polluted proposals fail before any write", () => {
  const valid = {
    resortId: "example",
    fileHash: null,
    lifts: [
      {
        targetSkiId: "example",
        properties: { name: "Lift" },
        coordinates: [
          [140, 43],
          [140.01, 43.01],
        ],
      },
    ],
  };
  assert.doesNotThrow(() => validateEditPayload("lift", valid));
  assert.throws(() => validateEditPayload("lift", { ...valid, role: "admin" }));
  assert.throws(() =>
    validateEditPayload("lift", {
      ...valid,
      lifts: [
        {
          ...valid.lifts[0],
          coordinates: [
            [190, 100],
            [140, 43],
          ],
        },
      ],
    }),
  );
  assert.throws(() =>
    assertBoundedPayload(JSON.parse('{"__proto__":{"admin":true}}')),
  );
  assert.throws(() =>
    assertBoundedPayload({ value: "x".repeat(4 * 1024 * 1024) }),
  );
});
