import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type DataDocument,
  DataDocumentConflictError,
} from "@/server/data-documents/contract";
import { hashDataDocumentContent } from "@/server/data-documents/repositoryCore";
import {
  captureDocumentWrites,
  capturedDocument,
  collectEdit,
  currentEditCapture,
  recordDocument,
} from "./capture";

const document = (key: string, content: string): DataDocument => ({
  key,
  content,
  hash: hashDataDocumentContent(content),
  version: 1,
  mediaType: "application/json",
  source: "database",
});
test("submission preparation never invokes the canonical writer and merges related edits against one original revision", async () => {
  const original = document("SkiResortLinks.json", "{}");
  const { plan } = await collectEdit(async () => {
    recordDocument(original.key, original);
    const read = async (key: string) =>
      capturedDocument(key)?.document ?? original;
    const first = await captureDocumentWrites(
      [
        {
          key: original.key,
          content: '{"one":1}',
          mediaType: "application/json",
          expectedHash: original.hash,
        },
      ],
      read,
    );
    assert.ok(first);
    await captureDocumentWrites(
      [
        {
          key: original.key,
          content: '{"one":1,"two":2}',
          mediaType: "application/json",
          expectedHash: first[0].hash,
        },
      ],
      read,
    );
  });
  assert.equal(plan.documents.length, 1);
  assert.equal(plan.documents[0].expectedHash, original.hash);
  assert.equal(plan.documents[0].content, '{"one":1,"two":2}');
  assert.equal(plan.beforeDocuments[0].document?.content, "{}");
  assert.equal(currentEditCapture(), undefined);
  assert.equal(await captureDocumentWrites([], async () => null), null);
});
test("failed and parallel requests cannot contaminate another request's proposed writes", async () => {
  const results = await Promise.all(
    ["first", "second"].map(async name =>
      collectEdit(async () => {
        await new Promise(resolve =>
          setTimeout(resolve, name === "first" ? 10 : 1),
        );
        recordDocument(`${name}.json`, null);
        await captureDocumentWrites(
          [
            {
              key: `${name}.json`,
              content: "{}",
              mediaType: "application/json",
              expectedHash: null,
            },
          ],
          async key => capturedDocument(key)?.document ?? null,
        );
        return name;
      }),
    ),
  );
  assert.deepEqual(
    results.map(result => result.plan.documents[0].key),
    ["first.json", "second.json"],
  );
  await assert.rejects(
    collectEdit(async () => {
      await captureDocumentWrites(
        [
          {
            key: "bad.json",
            content: "{}",
            mediaType: "application/json",
            expectedHash: "a".repeat(64),
          },
        ],
        async () => null,
      );
    }),
    DataDocumentConflictError,
  );
  assert.equal(currentEditCapture(), undefined);
});
