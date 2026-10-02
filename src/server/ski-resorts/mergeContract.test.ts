import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminSkiResortRecordSchema,
  adminSkiResortUpdateSchema,
  isMergedSource,
} from "./adminContract";
import {
  linkedAreaDefaults,
  mergeResortSummary,
  resortMergeRequestSchema,
  ticketGroupRequestSchema,
} from "./mergeContract";

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
    linkKind: _linkKind,
    ticketGroupId: _ticketGroupId,
    ...editable
  } = merged;
  assert.equal(adminSkiResortUpdateSchema.safeParse(editable).success, true);
});

test("merge kind defaults to a full merge and accepts a linked area", () => {
  assert.equal(resortMergeRequestSchema.parse(request).kind, "MERGED");
  assert.equal(
    resortMergeRequestSchema.parse({ ...request, kind: "LINKED" }).kind,
    "LINKED",
  );
  assert.equal(
    resortMergeRequestSchema.safeParse({ ...request, kind: "TICKET" }).success,
    false,
  );
});

test("a shared ticket needs at least two distinct resorts", () => {
  const resorts = request.sources;
  assert.equal(
    ticketGroupRequestSchema.safeParse({ action: "set", resorts }).success,
    true,
  );
  for (const invalid of [
    { action: "set", resorts: resorts.slice(0, 1) },
    { action: "set", resorts: [resorts[0], resorts[0]] },
    { action: "clear", resorts },
  ])
    assert.equal(ticketGroupRequestSchema.safeParse(invalid).success, false);
  assert.equal(
    ticketGroupRequestSchema.safeParse({ action: "clear", resort: resorts[0] })
      .success,
    true,
  );
});

test("only sources of a full merge are hidden from per-resort editing", () => {
  const merged = { id: "merged", linkKind: "MERGED" as const };
  const linked = { id: "linked", linkKind: "LINKED" as const };
  const resorts = [merged, linked];
  assert.equal(isMergedSource({ mergedIntoId: "merged" }, resorts), true);
  assert.equal(isMergedSource({ mergedIntoId: "linked" }, resorts), false);
  assert.equal(isMergedSource({ mergedIntoId: null }, resorts), false);
});

test("a linked area may omit its ID, names and summary source", () => {
  const sources = request.sources;
  assert.equal(
    resortMergeRequestSchema.safeParse({ kind: "LINKED", sources }).success,
    true,
  );
  assert.equal(resortMergeRequestSchema.safeParse({ sources }).success, false);
  const defaults = linkedAreaDefaults([
    { id: "able-hakuba-goryu", nameJa: "エイブル白馬五竜", nameEn: "Goryu" },
    { id: "hakuba-47", nameJa: "Hakuba47", nameEn: "Hakuba47" },
  ]);
  assert.equal(defaults.nameJa, "エイブル白馬五竜・Hakuba47");
  assert.equal(defaults.nameEn, "Goryu & Hakuba47");
  assert.equal(defaults.primaryId, "able-hakuba-goryu");
  assert.deepEqual(defaults.idCandidates(2), [
    "able-hakuba-goryu-area",
    "able-hakuba-goryu-area-2",
  ]);
});
