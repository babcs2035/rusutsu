import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTrack, type MatchingCourse } from "./analyze";
import type { SkizParseResult } from "./parseSkiz";

const start = Date.parse("2026-01-15T00:00:00Z");
function fixture(): SkizParseResult {
  return {
    metadata: {
      name: "Test",
      description: "",
      activity: "skiing",
      start: new Date(start).toISOString(),
      finish: new Date(start + 120000).toISOString(),
      timezone: "+09:00",
      durationSeconds: 120,
      resort: "Test Resort",
    },
    nodes: Array.from({ length: 25 }, (_, index) => ({
      time: start + index * 5000,
      longitude: 137,
      latitude: 36 + index * 0.0002,
      altitude: 1500 - index * 5,
      speed: 5,
    })),
    segments: [
      {
        start,
        end: start + 60000,
        type: "ski_run",
        sequence: 1,
        name: "Ski Run 1",
        durationSeconds: 60,
        averageSpeed: 5,
        distance: 300,
        verticalChange: -60,
      },
      {
        start: start + 60000,
        end: start + 120000,
        type: "lift",
        sequence: 1,
        name: "Lift 1",
        durationSeconds: 60,
        averageSpeed: 5,
        distance: 300,
        verticalChange: 60,
      },
    ],
  };
}
const course: MatchingCourse = {
  id: "a",
  name: "A",
  resortId: "test",
  resortName: "Test Resort",
  coordinates: [
    [137, 36],
    [137, 36.005],
  ],
};
test("only downhill contributes to statistics and course passes", () => {
  const result = analyzeTrack(fixture(), [course]);
  assert.equal(result.runs, 1);
  assert.equal(result.lifts, 1);
  assert.equal(result.distance, 300);
  assert.equal(result.vertical, 60);
  assert.equal(result.maxSpeed, 18);
  assert.equal(result.courses[0].passes, 1);
  assert.ok(result.gpsDistance > 260 && result.gpsDistance < 270);
  assert.equal(result.matchedDistance, result.gpsDistance);
});
test("parallel ambiguous and distant courses remain unmatched", () => {
  const parallel = {
    ...course,
    id: "b",
    name: "B",
    coordinates: course.coordinates.map(([x, y]) => [x + 0.00003, y]),
  };
  assert.equal(analyzeTrack(fixture(), [course, parallel]).courses.length, 0);
  assert.equal(
    analyzeTrack(fixture(), [
      {
        ...course,
        coordinates: [
          [138, 36],
          [138, 37],
        ],
      },
    ]).matchedDistance,
    0,
  );
});
test("short intersections and missing GPS are not fabricated as passes", () => {
  const track = fixture();
  track.nodes = track.nodes.slice(0, 4);
  assert.equal(analyzeTrack(track, [course]).courses.length, 0);
  track.nodes = [track.nodes[0], { ...track.nodes[1], time: start + 50000 }];
  assert.equal(analyzeTrack(track, [course]).gpsDistance, 0);
});
test("no geometry still preserves ski statistics", () => {
  const result = analyzeTrack(fixture(), []);
  assert.equal(result.distance, 300);
  assert.equal(result.courses.length, 0);
  assert.ok(result.gpsDistance > 0);
});
test("stationary and uncorroborated speed spikes do not set maximum speed", () => {
  const track = fixture();
  track.nodes[0].speed = 50;
  track.nodes[1].speed = 50;
  const result = analyzeTrack(track, []);
  assert.equal(result.maxSpeed, 18);
  track.nodes = track.nodes.map(node => ({
    ...node,
    longitude: 137,
    latitude: 36,
  }));
  assert.equal(analyzeTrack(track, []).maxSpeed, 0);
});
test("one traversal per course per recorded downhill, aggregated over runs", () => {
  const track = fixture();
  track.segments[1].type = "ski_run";
  const result = analyzeTrack(track, [course]);
  assert.equal(result.courses[0].passes, 2);
  assert.equal(result.runs, 2);
  assert.equal(result.courses.length, 1);
});
test("sections and duplicate map sources count a named resort course once", () => {
  const duplicate = { ...course, id: "duplicate" };
  const result = analyzeTrack(fixture(), [course, duplicate]);
  assert.equal(result.courses.length, 1);
  assert.equal(result.courses[0].passes, 1);
  assert.equal(result.matchedDistance, result.gpsDistance);
  assert.equal(
    analyzeTrack(fixture(), [{ ...course, name: "名前不明" }]).courses.length,
    0,
  );
});
