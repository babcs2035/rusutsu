// 内部 API 応答の redirect・期限・実 byte 上限を検証する．
import assert from "node:assert/strict";
import test from "node:test";
import { fetchBoundedResponse } from "./boundedResponse";

test("fetchBoundedResponse rejects oversized bodies and blocks redirects", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    requestInit = init;
    return new Response("abc");
  };

  const response = await fetchBoundedResponse(
    "https://data.example.test/api/admin/documents",
    {},
    { maxBytes: 2, timeoutMs: 1000 },
  );
  assert.equal(requestInit?.redirect, "error");
  assert.equal(requestInit?.cache, "no-store");
  assert.ok(requestInit?.signal);
  await assert.rejects(response.text(), /byte limit/u);
});
