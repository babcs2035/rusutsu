import assert from "node:assert/strict";
import { test } from "node:test";
import type { LngLat } from "../types";
import {
  defaultSideToKeep,
  findNearestPosition,
  joinLines,
  positionToCoordinate,
  positionToVertexIndex,
  snapPositionToVertex,
  takeSide,
} from "./lineGeometry";

// 東西にまっすぐ伸びる線。緯度 43 度あたりで 0.001 度 ≒ 81m
const line: LngLat[] = [
  [140.0, 43.0],
  [140.001, 43.0],
  [140.002, 43.0],
  [140.003, 43.0],
];

test("findNearestPosition projects a point onto the closest segment", () => {
  const position = findNearestPosition(line, [140.0015, 43.0002]);
  assert.ok(position);
  assert.equal(position.segmentIndex, 1);
  assert.ok(Math.abs(position.t - 0.5) < 1e-6);
});

test("findNearestPosition returns null for a line with fewer than two points", () => {
  assert.equal(findNearestPosition([[140, 43]], [140, 43]), null);
});

test("positionToCoordinate interpolates inside the segment", () => {
  const point = positionToCoordinate(line, { segmentIndex: 0, t: 0.25 });
  assert.ok(point);
  assert.ok(Math.abs(point[0] - 140.00025) < 1e-9);
});

test("snapPositionToVertex snaps to a nearby vertex but leaves the middle alone", () => {
  assert.deepEqual(
    snapPositionToVertex(line, { segmentIndex: 0, t: 0.02 }, 20),
    { segmentIndex: 0, t: 0 },
  );
  assert.deepEqual(
    snapPositionToVertex(line, { segmentIndex: 0, t: 0.5 }, 20),
    { segmentIndex: 0, t: 0.5 },
  );
});

test("positionToVertexIndex rounds to the nearer vertex", () => {
  assert.equal(positionToVertexIndex({ segmentIndex: 1, t: 0.2 }), 1);
  assert.equal(positionToVertexIndex({ segmentIndex: 1, t: 0.8 }), 2);
});

test("takeSide keeps the split point on both arms", () => {
  const position = { segmentIndex: 1, t: 0.5 };
  const start = takeSide(line, position, "start");
  const end = takeSide(line, position, "end");
  assert.equal(start.length, 3);
  assert.equal(end.length, 3);
  assert.deepEqual(start[start.length - 1], end[0]);
});

test("takeSide does not duplicate a vertex when the position sits on one", () => {
  assert.deepEqual(takeSide(line, { segmentIndex: 1, t: 0 }, "start"), [
    [140.0, 43.0],
    [140.001, 43.0],
  ]);
  assert.deepEqual(takeSide(line, { segmentIndex: 1, t: 1 }, "end"), [
    [140.002, 43.0],
    [140.003, 43.0],
  ]);
});

test("defaultSideToKeep picks the longer arm", () => {
  assert.equal(defaultSideToKeep(line, { segmentIndex: 0, t: 0.5 }), "end");
  assert.equal(defaultSideToKeep(line, { segmentIndex: 2, t: 0.5 }), "start");
});

test("joinLines connects two end points into one continuous line", () => {
  const second: LngLat[] = [
    [140.003, 43.0],
    [140.004, 43.0],
  ];
  const joined = joinLines(
    { coordinates: line, position: { segmentIndex: 2, t: 1 }, keep: "start" },
    { coordinates: second, position: { segmentIndex: 0, t: 0 }, keep: "end" },
  );
  assert.deepEqual(joined, [
    [140.0, 43.0],
    [140.001, 43.0],
    [140.002, 43.0],
    [140.003, 43.0],
    [140.004, 43.0],
  ]);
});

test("joinLines reverses arms so the seam never doubles back", () => {
  const second: LngLat[] = [
    [140.01, 43.01],
    [140.011, 43.01],
    [140.012, 43.01],
  ];
  // 1本目は「つなぎ目〜終点」を残す。反転してつなぎ目が末尾へ来る
  // 2本目は「始点〜つなぎ目」を残す。反転してつなぎ目が先頭へ来る
  const joined = joinLines(
    { coordinates: line, position: { segmentIndex: 1, t: 0 }, keep: "end" },
    { coordinates: second, position: { segmentIndex: 1, t: 0 }, keep: "start" },
  );
  assert.deepEqual(joined, [
    [140.003, 43.0],
    [140.002, 43.0],
    [140.001, 43.0],
    [140.011, 43.01],
    [140.01, 43.01],
  ]);
});
