import assert from "node:assert/strict";
import { test } from "node:test";
import { createGoogleMapsLinksLoader } from "./useGoogleMapsLinks";

test("HTTP failures are not cached and a later load can retry", async () => {
  let requestCount = 0;
  const loader = createGoogleMapsLinksLoader(async () => {
    requestCount += 1;
    return new Response("unavailable", { status: 503 });
  });

  assert.equal(await loader.load(), null);
  assert.equal(loader.getCached(), null);
  assert.equal(await loader.load(), null);
  assert.equal(requestCount, 2);
});

test("a successful empty response is cached", async () => {
  let requestCount = 0;
  const loader = createGoogleMapsLinksLoader(async () => {
    requestCount += 1;
    return new Response("{}", { status: 200 });
  });

  assert.deepEqual(await loader.load(), {});
  assert.deepEqual(loader.getCached(), {});
  assert.deepEqual(await loader.load(), {});
  assert.equal(requestCount, 1);
});
