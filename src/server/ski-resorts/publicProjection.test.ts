import assert from "node:assert/strict";
import { test } from "node:test";
import {
  publicSkiResortSchema,
  publicSkiResortSelect,
} from "./publicProjection";

const resort = {
  id: "rusutsu-resort",
  nameJa: "ルスツリゾート",
  nameEn: "Rusutsu Resort",
  shortName: "ルスツ",
  nameRuby: [],
  formerNames: [],
  prefecture: "北海道",
  town: "留寿都村",
  latitude: 42.74,
  longitude: 140.89,
  topElevation: 994,
  baseElevation: 400,
  verticalDrop: 594,
  numberOfCourses: 37,
  longestCourse: 3500,
  steepestSlope: 40,
  beginnersCoursesPercent: 30,
  intermediateCoursesPercent: 40,
  advancedCoursesPercent: 30,
  courseImages: [],
  typeNotPressed: null,
  typePressed: null,
  typeBump: null,
  angleMax: null,
  angleAvg: null,
  numberOfLifts: 18,
  ropeways: 0,
  gondolas: 4,
  quadLifts: 6,
  tripleLifts: 0,
  pairLifts: 8,
  singleLifts: 0,
  otherLifts: 0,
  liftCapacity: null,
  weekdayOpen: null,
  weekdayClose: null,
  weekendOpen: null,
  weekendClose: null,
  timesComment: null,
  website: "https://rusutsu.com",
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
  courses: [
    {
      id: "course",
      skiResortId: "rusutsu-resort",
      name: "コース",
      snowboard: null,
      difficulty: null,
      distance: null,
      angle: null,
      note: null,
      private_debug: "SECRET",
    },
  ],
  lifts: [],
  tickets: [],
  yukiMagi: {
    id: "yuki",
    name: "雪マジ",
    url: null,
    tag: null,
    benefit: null,
    period: null,
    exclusionDate: null,
    updatedAt: "private timestamp",
    private_debug: "SECRET",
  },
  createdAt: "private timestamp",
  updatedAt: "private timestamp",
  isActive: true,
  private_debug: "SECRET",
  weathers: [{ topData: { raw: "SECRET" } }],
  latestReports: [{ raw: "SECRET" }],
};

test("public full/detail projection keeps display data and strips DB metadata and raw legacy weather", () => {
  const projected = publicSkiResortSchema.parse(resort);
  assert.equal(projected.shortName, "ルスツ");
  assert.equal(projected.latitude, 42.74);
  assert.equal(projected.courses[0]?.name, "コース");
  assert.equal(JSON.stringify(projected).includes("SECRET"), false);
  for (const key of [
    "createdAt",
    "updatedAt",
    "isActive",
    "weathers",
    "latestReports",
  ]) {
    assert.equal(key in projected, false);
    assert.equal(key in publicSkiResortSelect, false);
  }
  assert.ok(projected.yukiMagi);
  assert.equal("updatedAt" in projected.yukiMagi, false);
});

test("remote projection rejects malformed scalar data instead of passing raw objects through", () => {
  assert.equal(
    publicSkiResortSchema.safeParse({ ...resort, nameJa: { raw: "SECRET" } })
      .success,
    false,
  );
});
