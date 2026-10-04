import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combineLatestStatuses,
  combineLinkedMappingCaptures,
  withLinkedAreaIds,
} from "./linkedAreaStatus";

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

test("linked mapping uses history for members without an adopted status", () => {
  const manba = status("manba-history.json", "2026-01-09T08:00:00Z", ["A"], []);
  const oku = status("oku.json", "2026-01-10T08:00:00Z", ["B"], []);
  const okuOld = status("oku-old.json", "2026-01-01T08:00:00Z", ["C"], []);
  const { status: combined, history } = combineLinkedMappingCaptures([
    { status: null, history: [manba] },
    { status: oku, history: [oku, okuOld] },
  ]);
  assert.deepEqual(
    combined?.items.map(item => item.name),
    ["A", "B"],
  );
  assert.deepEqual(
    history.map(item => [item.fileName, item.items.map(i => i.name)]),
    [
      ["manba-history.json", ["A", "B"]],
      ["oku.json", ["B", "A"]],
      ["oku-old.json", ["C", "A"]],
    ],
  );
});

test("same-name items across members are prefixed with the resort name", () => {
  const goryu = status("goryu.json", null, ["A", "ファミリー"], []);
  const hakuba47 = status("47.json", null, ["ファミリー", "B"], []);
  const combined = combineLatestStatuses(
    [goryu, hakuba47],
    ["白馬五竜", "Hakuba47"],
  );
  assert.deepEqual(
    combined?.items.map(item => item.name),
    ["A", "白馬五竜 ファミリー", "Hakuba47 ファミリー", "B"],
  );
});
