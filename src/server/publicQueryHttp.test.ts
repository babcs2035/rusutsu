// 公開 query が未検証入力を実行せず，失敗時にも内部情報を返さないことを確認する．
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { respondToPublicQuery } from "./publicQueryHttp";

const schema = z.object({ ids: z.array(z.string()).min(1).max(4) });
/** 外部サービスを起動せずに HTTP 境界の要求を作る． */
function request(
  body: string,
  headers: HeadersInit = { "Content-Type": "application/json" },
): Request {
  return new Request("http://localhost/rusutsu/api/resorts/maps", {
    method: "POST",
    headers,
    body,
  });
}

test("public queries validate before service execution and return private results", async () => {
  let calls = 0;
  const service = async ({ ids }: { ids: string[] }): Promise<string[]> => {
    calls++;
    return ids;
  };
  for (const invalid of ["{", '{"ids":[]}', '{"ids":[1]}']) {
    const response = await respondToPublicQuery(
      request(invalid),
      schema,
      service,
    );
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
  const response = await respondToPublicQuery(
    request('{"ids":["one","two"]}'),
    schema,
    service,
  );
  assert.deepEqual(await response.json(), ["one", "two"]);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(calls, 1);
});

test("query body limits stop oversized requests before executing the service", async () => {
  const response = await respondToPublicQuery(
    request("x".repeat(300_000)),
    schema,
    async () => assert.fail("Oversized input reached the service"),
  );
  assert.equal(response.status, 413);
  assert.equal(
    response.headers.get("Content-Type"),
    "application/problem+json",
  );
  assert.deepEqual(await response.json(), {
    type: "about:blank",
    title: "Payload Too Large",
    status: 413,
    code: "PAYLOAD_TOO_LARGE",
    detail: "Request body is too large",
  });
});

test("query failures do not expose private error details", async () => {
  const response = await respondToPublicQuery(
    request('{"ids":["one"]}'),
    schema,
    async () => {
      throw new Error("private-diagnostic-content");
    },
  );
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("private-diagnostic-content"));
});
