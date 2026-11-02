import assert from "node:assert/strict";
import test from "node:test";
import type { CommunityMapData, ReportEntryDraft } from "./contract";
import { reportResortId, resortReportMap } from "./mapData";

const pointLine = (longitude: number, latitude: number) => [
  [longitude, latitude],
];

const data: CommunityMapData = {
  name: "同時表示中のスキー場",
  center: [140, 43],
  courses: [
    {
      id: "course-own",
      name: "自分のコース",
      coordinates: pointLine(140, 43),
      lines: [pointLine(140, 43)],
    },
    {
      id: "course-partner",
      name: "相手のコース",
      coordinates: pointLine(141, 44),
      lines: [pointLine(141, 44)],
    },
    {
      id: "course-extra",
      name: "対象外",
      coordinates: pointLine(142, 45),
      lines: [pointLine(142, 45)],
    },
  ],
  lifts: [
    {
      id: "lift-own",
      name: "自分のリフト",
      coordinates: pointLine(140.1, 43.1),
      lines: [pointLine(140.1, 43.1)],
      distance: 500,
    },
    {
      id: "lift-partner",
      name: "相手のリフト",
      coordinates: pointLine(141.1, 44.1),
      lines: [pointLine(141.1, 44.1)],
      distance: 600,
    },
    {
      id: "lift-extra",
      name: "対象外",
      coordinates: pointLine(142.1, 45.1),
      lines: [pointLine(142.1, 45.1)],
      distance: null,
    },
  ],
  resorts: [
    {
      id: "resort-own",
      name: "自分のスキー場",
      courseIds: ["course-own"],
      liftIds: ["lift-own"],
    },
    {
      id: "resort-partner",
      name: "相手のスキー場",
      courseIds: ["course-partner"],
      liftIds: ["lift-partner"],
    },
  ],
};

const entry = (overrides: Partial<ReportEntryDraft>): ReportEntryDraft =>
  ({
    clientKey: "client-key",
    kind: "MOGUL",
    courseId: null,
    liftId: null,
    body: "",
    snowQualities: [],
    status: null,
    crowding: null,
    latitude: null,
    longitude: null,
    itemType: null,
    size: null,
    waitMinutes: null,
    liftSpeed: null,
    liftSpeedLevel: null,
    depth: null,
    ...overrides,
  }) as ReportEntryDraft;

test("feature selections save to the resort that owns a course or lift", () => {
  assert.equal(
    reportResortId(data, entry({ courseId: "course-own" }), "fallback"),
    "resort-own",
  );
  assert.equal(
    reportResortId(data, entry({ courseId: "course-partner" }), "fallback"),
    "resort-partner",
  );
  assert.equal(
    reportResortId(data, entry({ liftId: "lift-own" }), "fallback"),
    "resort-own",
  );
  assert.equal(
    reportResortId(data, entry({ liftId: "lift-partner" }), "fallback"),
    "resort-partner",
  );
});

test("a point without a course selection uses its nearest mapped feature", () => {
  assert.equal(
    reportResortId(
      data,
      entry({ longitude: 141.1, latitude: 44.1 }),
      "fallback",
    ),
    "resort-partner",
  );
});

test("single-resort map data preserves the original fallback behavior", () => {
  const singleResortData = { ...data, resorts: undefined };
  assert.equal(
    reportResortId(
      singleResortData,
      entry({ courseId: "course-own" }),
      "original-resort",
    ),
    "original-resort",
  );
  assert.equal(
    resortReportMap(singleResortData, "original-resort"),
    singleResortData,
  );
});

test("editing a resort report restricts selectable courses and lifts", () => {
  const scoped = resortReportMap(data, "resort-partner");
  assert.deepEqual(
    scoped.courses.map(course => course.id),
    ["course-partner"],
  );
  assert.deepEqual(
    scoped.lifts.map(lift => lift.id),
    ["lift-partner"],
  );
  assert.deepEqual(
    scoped.resorts?.map(resort => resort.id),
    ["resort-partner"],
  );
  assert.equal(scoped.name, data.name);
  assert.equal(scoped.center, data.center);
});
