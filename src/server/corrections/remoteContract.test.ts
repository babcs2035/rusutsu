import assert from "node:assert/strict";
import test from "node:test";
import {
  requestSchema,
  successPayloadSchemas,
} from "@/server/community/remoteContract";
import { editRequestApiCommandSchema } from "@/server/edit-requests/remoteContract";
import { correctionListSchema } from "./remoteContract";

test("anonymous corrections carry an idempotency key and proof without accepting roles", () => {
  const request = {
    googleAccountId: null,
    anonymousIdentity: "a".repeat(64),
    submissionKey: "b".repeat(64),
    command: {
      operation: "correction",
      input: {
        operationKey: "00000000-0000-4000-8000-000000000001",
        resortId: "test-resort",
        items: [{ targetKind: "resort", field: "nameJa", proposed: "変更案" }],
        proof: { token: "server-signed-challenge", nonce: "12345" },
      },
    },
  };
  const parsed = requestSchema.parse(request);
  assert.equal(parsed.submissionKey, request.submissionKey);
  assert.equal(
    requestSchema.safeParse({ ...request, role: "admin" }).success,
    false,
  );
  assert.equal(
    requestSchema.safeParse({ ...request, submissionKey: "raw-cookie" })
      .success,
    false,
  );
  assert.equal(
    successPayloadSchemas.correction.safeParse({ requestId: "request-1" })
      .success,
    true,
  );
  assert.equal(successPayloadSchemas.correction.safeParse({}).success, false);
});

test("correction review commands bound versions, item index and decisions", () => {
  const command = {
    googleAccountId: "server-resolved-google-account",
    operation: "correction-decide",
    id: "cmremote00000000000000001",
    version: 1,
    index: 0,
    decision: "approve",
    comment: "確認済み",
  };
  assert.equal(editRequestApiCommandSchema.safeParse(command).success, true);
  for (const patch of [
    { version: 0 },
    { index: -1 },
    { index: 200 },
    { decision: "APPLIED" },
    { role: "admin" },
  ]) {
    assert.equal(
      editRequestApiCommandSchema.safeParse({ ...command, ...patch }).success,
      false,
    );
  }
});

test("remote correction dates remain usable by the existing admin pages", () => {
  const list = correctionListSchema.parse({
    requests: [
      {
        id: "cmremote00000000000000001",
        resortId: "test-resort",
        status: "PENDING",
        authorName: "匿名",
        createdAt: "2026-11-14T00:00:00.000Z",
      },
    ],
    pendingCount: 300,
  });
  assert.ok(list.requests[0].createdAt instanceof Date);
  assert.equal(list.pendingCount, 300);
});
