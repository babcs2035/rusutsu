import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicPost } from "./contract";
import { getPeriodStart, groupExactCoordinates } from "./mapOverlay";

const post = (id: string, latitude: number, longitude: number): PublicPost =>
  ({
    id,
    kind: "MOGUL",
    courseId: null,
    observedOn: "2026-10-20",
    body: "",
    snowQualities: [],
    conditions: [],
    present: true,
    latitude,
    longitude,
    itemType: null,
    size: null,
    resortId: "resort",
    version: 1,
    author: { id: "author", publicName: "匿名" },
    createdAt: "2026-10-20T00:00:00.000Z",
    updatedAt: "2026-10-20T00:00:00.000Z",
    photos: [],
    likeCount: 0,
    commentCount: 0,
    liked: false,
    courseName: null,
  }) satisfies PublicPost;

test("groups exact overlaps only", () => {
  const groups = groupExactCoordinates([
    post("a", 43, 142),
    post("b", 43, 142),
    post("c", 43.00001, 142),
  ]);
  assert.deepEqual(
    groups.map(group => group.posts.map(item => item.id)),
    [["a", "b"], ["c"]],
  );
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
