import assert from "node:assert/strict";
import { test } from "node:test";
import { allowsAdminOverwrite, withAdminOverwrite } from "./overwriteContext";

test("explicit overwrite permission stays within its asynchronous operation", async () => {
  assert.equal(allowsAdminOverwrite(), false);
  await Promise.all([
    withAdminOverwrite(async () => {
      await Promise.resolve();
      assert.equal(allowsAdminOverwrite(), true);
    }),
    (async () => {
      await Promise.resolve();
      assert.equal(allowsAdminOverwrite(), false);
    })(),
  ]);
  assert.equal(allowsAdminOverwrite(), false);
});
