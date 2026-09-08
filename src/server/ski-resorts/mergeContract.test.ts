import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminSkiResortRecordSchema,
  adminSkiResortUpdateSchema,
} from "./adminContract";
import { mergeResortSummary, resortMergeRequestSchema } from "./mergeContract";

const request = {
  id: "combined-resort",
  nameJa: "結合スキー場",
  nameEn: "Combined Resort",
  primaryId: "area-a",
  sources: [
    { id: "area-a", expectedUpdatedAt: "2026-09-08T00:00:00Z" },
    { id: "area-b", expectedUpdatedAt: "2026-09-08T00:00:00Z" },
  ],
};

test("merge requires distinct sources, a member as primary, and a new safe ID", () => {
  assert.equal(resortMergeRequestSchema.safeParse(request).success, true);
  for (const invalid of [
    { ...request, sources: request.sources.slice(0, 1) },
    { ...request, sources: [request.sources[0], request.sources[0]] },
    { ...request, id: "area-a" },
    { ...request, id: "../new" },
    { ...request, id: "New Resort" },
    { ...request, primaryId: "outside" },
    { ...request, nameJa: " " },
    {
      ...request,
      sources: [
        { ...request.sources[0], expectedUpdatedAt: "invalid" },
        request.sources[1],
      ],
    },
  ])
    assert.equal(resortMergeRequestSchema.safeParse(invalid).success, false);
});

const primary = adminSkiResortRecordSchema.parse({
  id: "area-a",
  updatedAt: "2026-09-08T00:00:00Z",
  nameJa: "A",
  nameEn: "A",
  shortName: null,
  nameRuby: [],
  formerNames: [],
  readingNeedsReview: false,
  isActive: true,
  prefecture: "北海道",
  town: "町",
  latitude: 43,
  longitude: 141,
  topElevation: 1000,
  baseElevation: 400,
  verticalDrop: 600,
  numberOfCourses: 4,
  longestCourse: 3000,
  steepestSlope: null,
  beginnersCoursesPercent: 30,
  intermediateCoursesPercent: 40,
  advancedCoursesPercent: 30,
  courseImages: ["shared"],
  typeNotPressed: null,
  typePressed: null,
  typeBump: null,
  angleMax: null,
  angleAvg: null,
  numberOfLifts: 2,
  ropeways: 0,
  gondolas: 1,
  quadLifts: 0,
  tripleLifts: 0,
  pairLifts: 1,
  singleLifts: 0,
  otherLifts: 0,
  liftCapacity: 1000,
  weekdayOpen: "09:00",
  weekdayClose: null,
  weekendOpen: null,
  weekendClose: null,
  timesComment: null,
  website: null,
  skiersPercent: null,
  snowboardersPercent: null,
  sources: ["source-a"],
  descriptionShort: null,
  descriptionLong: null,
  outlineImages: [],
  condition: null,
  status: null,
  review: null,
});

test("merge sums counts, combines elevations and evidence, and preserves primary-only fields", () => {
  const other = {
    ...primary,
    id: "area-b",
    topElevation: 1400,
    baseElevation: 600,
    numberOfCourses: 6,
    numberOfLifts: 3,
    liftCapacity: null,
    latitude: 44,
    weekdayOpen: "08:00",
    sources: ["source-b"],
    courseImages: ["shared", "other"],
  };
  const merged = mergeResortSummary(primary, [primary, other]);
  assert.equal(merged.numberOfCourses, 10);
  assert.equal(merged.numberOfLifts, 5);
  assert.equal(merged.verticalDrop, 1000);
  assert.equal(merged.baseElevation, 400);
  assert.equal(merged.latitude, 43);
  assert.equal(merged.weekdayOpen, "09:00");
  assert.equal(merged.beginnersCoursesPercent, 30);
  assert.equal(merged.liftCapacity, null);
  assert.deepEqual(merged.courseImages, ["shared", "other"]);
  assert.deepEqual(merged.sources, ["source-a", "source-b"]);
  assert.equal(primary.numberOfCourses, 4);
  const {
    id: _id,
    updatedAt: _date,
    mergedIntoId: _parent,
    sourceResortIds: _sources,
    ...editable
  } = merged;
  assert.equal(adminSkiResortUpdateSchema.safeParse(editable).success, true);
});
