// 更新要求の完了順が比較リストの表示を巻き戻さないことを確認する．
import assert from "node:assert/strict";
import { test } from "node:test";
import { createCompareListMutationQueue } from "./mutationQueue";

test("a later update waits for the previous update to complete", async () => {
  const enqueue = createCompareListMutationQueue();
  const previous = Promise.withResolvers<void>();
  const calls: string[] = [];
  const first = enqueue(async () => {
    calls.push("first");
    await previous.promise;
    return "first result";
  });
  const second = enqueue(async () => {
    calls.push("second");
    return "second result";
  });
  await Promise.resolve();
  assert.deepEqual(calls, ["first"]);
  previous.resolve();
  assert.deepEqual(await Promise.all([first, second]), [
    "first result",
    "second result",
  ]);
  assert.deepEqual(calls, ["first", "second"]);
});

test("a failed update does not prevent the next update", async () => {
  const enqueue = createCompareListMutationQueue();
  const failed = enqueue(async () => {
    throw new Error("offline");
  });
  const next = enqueue(async () => "saved");
  await assert.rejects(failed, /offline/);
  assert.equal(await next, "saved");
});
