import assert from "node:assert/strict";
import { test } from "node:test";
import { combineLatestStatuses, withLinkedAreaIds } from "./linkedAreaStatus";

const status = (
  fileName: string,
  time: string | null,
  names: string[],
  sourceUrls: string[],
) => ({
  fileName,
  time,
  items: names.map(name => ({ name })),
  sourceUrls,
});

test("a linked area combines every member's latest status", () => {
  const goryu = status("goryu.json", "2026-01-10T08:00:00Z", ["A"], ["u1"]);
  const hakuba47 = status(
    "47.json",
    "2026-01-10T09:00:00Z",
    ["B"],
    ["u1", "u2"],
  );
  const combined = combineLatestStatuses([goryu, null, hakuba47]);
  assert.deepEqual(combined?.items, [{ name: "A" }, { name: "B" }]);
  assert.deepEqual(combined?.sourceUrls, ["u1", "u2"]);
  assert.equal(combined?.time, "2026-01-10T09:00:00Z");
  assert.equal(combined?.fileName, "47.json");
});

test("a single available status is returned unchanged", () => {
  const only = status("a.json", null, ["A"], []);
  assert.equal(combineLatestStatuses([null, only]), only);
  assert.equal(combineLatestStatuses([null, null]), null);
});

test("an area counts as crawled when any member is crawled", () => {
  const areas = [
    { id: "area", memberIds: ["goryu", "hakuba47"] },
    { id: "other-area", memberIds: ["x", "y"] },
  ];
  assert.deepEqual(withLinkedAreaIds(["hakuba47", "solo"], areas), [
    "hakuba47",
    "solo",
    "area",
  ]);
});
