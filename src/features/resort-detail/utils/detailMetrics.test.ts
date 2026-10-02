import assert from "node:assert/strict";
import test from "node:test";
import type { FinalizedCourseFeature } from "@/lib/finalizedResortGeojsonShared";
import {
  createConnectedCourseElevationProfile,
  createFinalizedCourseGroups,
  findSelectedCourseGroup,
} from "./detailMetrics";

const route = (id: string, lng: number) =>
  ({
    id,
    groupId: "group",
    displayName: "コース",
    groupKind: "routes",
    coordinates: [
      [lng, 0, 1000],
      [lng, 0.001, 900],
    ],
    properties: { status: null },
  }) as unknown as FinalizedCourseFeature;

const groups = createFinalizedCourseGroups([route("a", 0), route("b", 0.01)]);

test("一覧から選んだときは別ルートをまとめて返す", () => {
  const group = findSelectedCourseGroup(groups, {
    kind: "course",
    id: "group",
  });
  assert.deepEqual(
    group?.courses.map(course => course.id),
    ["a", "b"],
  );
  assert.deepEqual(
    createConnectedCourseElevationProfile(group?.courses ?? []),
    [],
  );
});

test("地図で押した別ルートは、その1本だけで断面図を作る", () => {
  const group = findSelectedCourseGroup(groups, {
    kind: "course",
    id: "group",
    routeId: "b",
  });
  assert.deepEqual(
    group?.courses.map(course => course.id),
    ["b"],
  );
  assert.equal(
    createConnectedCourseElevationProfile(group?.courses ?? []).length,
    2,
  );
});

test("見つからないルートはまとまり全体に戻す", () => {
  const group = findSelectedCourseGroup(groups, {
    kind: "course",
    id: "group",
    routeId: "missing",
  });
  assert.equal(group?.courses.length, 2);
});
