import assert from "node:assert/strict";
import test from "node:test";
import type {
  FinalizedCourseFeature,
  GeoCoordinate,
} from "@/lib/finalizedResortGeojsonShared";
import {
  createConnectedCourseElevationProfile,
  createElevationProfile,
  createFinalizedCourseGroups,
  createLiftElevationProfile,
  findSelectedCourseGroup,
  getLiftElevationRange,
} from "./detailMetrics";

test("リフト駅の標高は途中の地形の起伏を含めずGeoJSONの両端から取得する", () => {
  assert.deepEqual(
    getLiftElevationRange([
      [140, 43, 426],
      [140, 43.001, 400],
      [140, 43.002, 528],
    ]),
    { min: 426, max: 528 },
  );
  assert.equal(
    getLiftElevationRange([
      [140, 43],
      [140, 43.002, 528],
    ]),
    null,
  );
});

test("リフト断面図は座標の格納順にかかわらず山麓から山頂へ進む", () => {
  const coordinates: GeoCoordinate[] = [
    [140, 43, 426],
    [140, 43.001, 480],
    [140, 43.002, 528],
  ];
  const before = structuredClone(coordinates);
  const profile = createLiftElevationProfile(coordinates);
  assert.deepEqual(
    profile,
    createLiftElevationProfile([...coordinates].reverse()),
  );
  assert.equal(profile[0].elevation, 426);
  assert.equal(profile[0].distance, 0);
  assert.equal(profile.at(-1)?.elevation, 528);
  assert.ok(profile.every(point => point.slope != null && point.slope > 0));
  assert.ok(
    profile.every(
      (point, index) =>
        index === 0 || point.distance > profile[index - 1].distance,
    ),
  );
  assert.deepEqual(coordinates, before);
  // コースの向きは従来どおり山頂から山麓。
  assert.equal(createElevationProfile(coordinates)[0].elevation, 528);
  assert.equal(
    createConnectedCourseElevationProfile([
      { ...route("lift-direction-regression", 140), coordinates },
    ])[0].elevation,
    528,
  );
});

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
