import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RequestBodyError,
  readRequestJson,
  readRequestText,
} from "./readRequestBody";

test("streaming limit rejects chunked data and cancels remaining input", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(8));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("http://localhost/", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(
    readRequestText(request, 10),
    (error: unknown) =>
      error instanceof RequestBodyError && error.status === 413,
  );
  assert.equal(cancelled, true);
});

test("body validation covers malformed JSON, media type, bytes and length", async () => {
  const request = (
    body: string,
    headers: Record<string, string> = { "content-type": "application/json" },
  ) => new Request("http://localhost/", { method: "POST", body, headers });
  assert.deepEqual(await readRequestJson(request('{"ok":true}'), 50), {
    ok: true,
  });
  for (const [req, limit, status] of [
    [request("{"), 50, 400],
    [request("{}", { "content-type": "text/plain" }), 50, 415],
    [request('"日本語"'), 5, 413],
    [request("{}", { "content-length": "500" }), 20, 413],
  ] as const) {
    await assert.rejects(
      readRequestTextOrJson(req, limit, status),
      (error: unknown) =>
        error instanceof RequestBodyError && error.status === status,
    );
  }
});

function readRequestTextOrJson(
  request: Request,
  limit: number,
  status: number,
) {
  return status === 413
    ? readRequestText(request, limit)
    : readRequestJson(request, limit);
}

test("stalled request bodies time out", async () => {
  const body = new ReadableStream({ start() {} });
  const request = new Request("http://localhost/", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(
    readRequestText(request, 20, 10),
    (error: unknown) =>
      error instanceof RequestBodyError && error.status === 408,
  );
});
