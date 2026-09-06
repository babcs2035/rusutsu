import assert from "node:assert/strict";
import { test } from "node:test";
import { adminSkiResortUpdateSchema } from "./adminContract";

test("admin shortName accepts clearing, trims names, and enforces its length", () => {
  const schema = adminSkiResortUpdateSchema.pick({ shortName: true });
  assert.deepEqual(schema.parse({ shortName: " ルスツ " }), {
    shortName: "ルスツ",
  });
  assert.deepEqual(schema.parse({ shortName: " " }), { shortName: null });
  assert.deepEqual(schema.parse({ shortName: null }), { shortName: null });
  assert.equal(schema.safeParse({ shortName: "a".repeat(101) }).success, false);
  assert.equal(schema.safeParse({}).success, false);
});
