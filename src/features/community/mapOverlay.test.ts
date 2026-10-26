import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicMapEntry } from "./contract";
import { getPeriodStart, groupExactCoordinates } from "./mapOverlay";

const entry = (
  id: string,
  latitude: number,
  longitude: number,
): PublicMapEntry => ({
  id,
  postId: `post-${id}`,
  kind: id.endsWith("item") ? "ITEM" : "MOGUL",
  observedOn: "2026-10-20",
  body: "",
  latitude,
  longitude,
  itemType: null,
  size: null,
  targetName: "コースA",
  author: { id: "author", publicName: "匿名" },
});

test("groups exact point overlaps without merging nearby entries", () => {
  const groups = groupExactCoordinates([
    entry("a", 43, 142),
    entry("b", 43, 142),
    entry("c", 43.00001, 142),
  ]);
  assert.deepEqual(
    groups.map(group => group.posts.map(item => item.id)),
    [["a", "b"], ["c"]],
  );
  assert.deepEqual(groups[0]?.coordinates, [142, 43]);
});

test("calculates date windows from observed date", () => {
  assert.equal(
    getPeriodStart("3d", new Date("2026-10-24T03:00:00Z")),
    "2026-10-22",
  );
  assert.equal(
    getPeriodStart("7d", new Date("2026-10-24T03:00:00Z")),
    "2026-10-18",
  );
  assert.equal(
    getPeriodStart("season", new Date("2027-01-10T00:00:00Z")),
    "2026-07-01",
  );
  assert.equal(
    getPeriodStart("season", new Date("2026-11-15T03:00:00Z")),
    "2026-07-01",
  );
  assert.equal(
    getPeriodStart("all", new Date("2027-01-10T00:00:00Z")),
    undefined,
  );
});
