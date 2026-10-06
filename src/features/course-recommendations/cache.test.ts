import assert from "node:assert/strict";
import { test } from "node:test";
import { createResultCache, selectCachedRecommendations } from "./cache";

test("prefetch and selection share one request and completed results are available synchronously", async () => {
  let requests = 0;
  const cache = createResultCache(async () => {
    requests++;
    return { ready: true };
  });
  const prefetch = cache.get("source");
  assert.equal(cache.get("source"), prefetch);
  const result = await prefetch;
  assert.equal(cache.peek("source"), result);
  assert.equal(await cache.get("source"), result);
  assert.equal(requests, 1);
});
test("cache expiry, retry and separate account caches cannot reuse stale results", async () => {
  let time = 0,
    calls = 0;
  const cache = createResultCache(
    async () => ++calls,
    () => time,
  );
  assert.equal(await cache.get("source"), 1);
  time = 60000;
  assert.equal(cache.peek("source"), undefined);
  assert.equal(await cache.get("source"), 2);
  cache.invalidate("source");
  assert.equal(await cache.get("source"), 3);
  const otherAccount = createResultCache(async () => 99);
  assert.equal(otherAccount.peek("source"), undefined);
  assert.equal(await otherAccount.get("source"), 99);
  assert.equal(cache.peek("source"), 3);
});
test("a failed request is evicted so retry can succeed", async () => {
  let calls = 0;
  const cache = createResultCache(async () => {
    if (++calls === 1) throw new Error("Unavailable");
    return 42;
  });
  await assert.rejects(cache.get("source"));
  assert.equal(await cache.get("source"), 42);
});
test("instant index lookup respects the requested main route and never substitutes a secondary route", () => {
  const index = {
    status: "ready" as const,
    courses: [
      {
        groupId: "group",
        routeKey: "group:route:2",
        courseIds: ["main"],
        recommendations: [],
      },
    ],
  };
  assert.equal(
    selectCachedRecommendations(index, {
      kind: "course",
      id: "group",
      routeId: "group:route:10",
    }).status,
    "source_unavailable",
  );
  assert.equal(
    selectCachedRecommendations(index, { kind: "course", id: "group" }).status,
    "source_unavailable",
  );
  assert.equal(
    selectCachedRecommendations(index, {
      kind: "course",
      id: "group",
      routeId: "group:route:2",
    }).status,
    "no_match",
  );
});
