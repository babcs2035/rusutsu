import assert from "node:assert/strict";
import { test } from "node:test";
import { projectLinkedResort } from "./detailProjection";

type Row = Parameters<typeof projectLinkedResort>[0];

const row = (id: string, overrides: Partial<Row> = {}): Row =>
  ({
    id,
    nameJa: id,
    nameEn: id,
    shortName: null,
    nameRuby: [],
    formerNames: [],
    prefecture: "長野県",
    town: "白馬村",
    latitude: 36.7,
    longitude: 137.8,
    topElevation: 1000,
    baseElevation: 500,
    verticalDrop: 500,
    numberOfCourses: 5,
    longestCourse: 3000,
    steepestSlope: null,
    beginnersCoursesPercent: 30,
    intermediateCoursesPercent: 40,
    advancedCoursesPercent: 30,
    courseImages: [],
    typeNotPressed: null,
    typePressed: null,
    typeBump: null,
    angleMax: null,
    angleAvg: null,
    numberOfLifts: 3,
    ropeways: 0,
    gondolas: 0,
    quadLifts: 0,
    tripleLifts: 0,
    pairLifts: 0,
    singleLifts: 0,
    otherLifts: 0,
    liftCapacity: null,
    weekdayOpen: null,
    weekdayClose: null,
    weekendOpen: null,
    weekendClose: null,
    timesComment: null,
    website: null,
    skiersPercent: null,
    snowboardersPercent: null,
    sources: [],
    descriptionShort: null,
    descriptionLong: null,
    outlineImages: [],
    condition: null,
    status: null,
    review: null,
    yukiMagiId: null,
    sourceResortIds: [],
    mergedMembers: [],
    courses: [],
    lifts: [],
    tickets: [],
    yukiMagi: null,
    ...overrides,
  }) as Row;

const member = (id: string, latitude: number, isActive = true) => ({
  id,
  nameJa: id,
  shortName: null,
  latitude,
  longitude: 137.8,
  isActive,
  courses: [],
  lifts: [],
  tickets: [],
});

test("a linked member keeps its own identity and shares the area's data", () => {
  const own = row("hakuba47", {
    nameJa: "Hakuba47",
    latitude: 36.71,
    website: "https://47.example",
    numberOfCourses: 8,
  });
  const area = row("goryu-47", {
    nameJa: "白馬五竜・Hakuba47",
    numberOfCourses: 20,
    sourceResortIds: ["goryu", "hakuba47"],
    mergedMembers: [
      member("hakuba47", 36.71),
      member("goryu", 36.68),
      member("closed", 36.6, false),
    ],
  });
  const detail = projectLinkedResort(own, area);
  assert.equal(detail.id, "hakuba47");
  assert.equal(detail.nameJa, "Hakuba47");
  assert.equal(detail.latitude, 36.71);
  assert.equal(detail.website, "https://47.example");
  assert.equal(detail.numberOfCourses, 20);
  assert.deepEqual(detail.sourceResortIds, ["goryu", "hakuba47"]);
  assert.equal(detail.linkedArea?.id, "goryu-47");
  assert.deepEqual(
    detail.linkedArea?.members.map(item => item.id),
    ["goryu", "hakuba47"],
  );
});
