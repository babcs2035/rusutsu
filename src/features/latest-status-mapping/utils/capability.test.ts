import assert from "node:assert/strict";
import { test } from "node:test";
import type { CapabilitySource } from "../types.capability";
import { buildCapabilityFromResult, findCapabilityGaps } from "./capability";

const source: CapabilitySource = {
  mode: "LIVE",
  archiveTimestamp: null,
  urls: [],
};

const observedAt = "2026-01-15T00:00:00.000Z";

const build = (result: unknown) =>
  buildCapabilityFromResult({
    resortId: "sample-resort",
    result,
    source,
    observedAt,
  });

test("コース・リフト・天気を含む結果から件数・名前・状態記号を集計する", () => {
  const capability = build({
    courses: [
      { name: "Aコース", status: "○", update: "09:00", note: null },
      { name: "Bコース", status: "△", update: "09:10", note: null },
      { name: "Aコース", status: "○", update: "09:20", note: null },
    ],
    lifts: [
      { name: "第1リフト", status: "○", update: null, note: null },
      { name: "第2リフト", status: "×", update: null, note: null },
    ],
    weather: {
      山頂: {
        update: "09:00",
        weather: "晴れ",
        temperature: -5,
        snowDepth: 150,
        snowfall: 3,
        condition: "良好",
        windSpeed: 4,
      },
    },
  });
  assert.equal(capability.courses.count, 3);
  assert.deepEqual(capability.courses.names, ["Aコース", "Bコース"]);
  assert.deepEqual(capability.courses.statuses, ["○", "△"]);
  assert.equal(capability.lifts.count, 2);
  assert.deepEqual(capability.lifts.names, ["第1リフト", "第2リフト"]);
  assert.deepEqual(capability.lifts.statuses, ["○", "×"]);
});

test("全項目でnullのフィールドはfalse、値が入っているフィールドはtrueになる", () => {
  const capability = build({
    courses: [
      { name: "Aコース", status: "○", update: "09:00", note: null },
      { name: "Bコース", status: "△", update: null, note: null },
    ],
  });
  assert.equal(capability.courses.fields.note, false, "noteは常にnull");
  assert.equal(capability.courses.fields.update, true, "updateは一度は値あり");
});

test("プレースホルダー文字列（-, --, ***, 空文字, 空白）は値ありと数えない", () => {
  const capability = build({
    courses: [
      { name: "Aコース", status: "-", update: "--", note: "***" },
      { name: "Bコース", status: "", update: "   ", note: "ー" },
    ],
  });
  assert.equal(capability.courses.fields.status, false);
  assert.equal(capability.courses.fields.update, false);
  assert.equal(capability.courses.fields.note, false);
  assert.equal(capability.courses.fields.name, true);
});

test("天気の数値フィールドは0でも値ありと数える", () => {
  const capability = build({
    weather: {
      山麓: {
        update: null,
        weather: null,
        temperature: 0,
        snowDepth: null,
        snowfall: 0,
        condition: null,
        windSpeed: null,
      },
    },
  });
  assert.equal(capability.conditions.fields.temperature, true);
  assert.equal(capability.conditions.fields.snowfall, true);
  assert.equal(capability.conditions.fields.snowDepth, false);
});

test("newsUrlにURLがあるとconditions.newsはtrueになる", () => {
  const capability = build({ newsUrl: ["https://example.com/news"] });
  assert.equal(capability.conditions.news, true);
});

test("newsUrlが空だとconditions.newsはfalseになる", () => {
  const capability = build({ newsUrl: [] });
  assert.equal(capability.conditions.news, false);
});

test("行が取れていればavailableはtrueになる", () => {
  const capability = build({
    courses: [{ name: "Aコース", status: "○", update: null, note: null }],
  });
  assert.equal(capability.courses.available, true);
});

test("行が0件でも出典URLが登録されていればavailableはtrueになる", () => {
  const capability = build({
    courses: [],
    courseUrl: ["https://example.com/courses"],
  });
  assert.equal(capability.courses.available, true);
});

const buildCoursesCapability = () =>
  build({
    courses: [
      { name: "Aコース", status: "○", update: "09:00", note: null },
      { name: "Bコース", status: "△", update: "09:10", note: null },
    ],
  });

const fullResult = () => ({
  courses: [
    { name: "Aコース", status: "○", update: "09:00", note: null },
    { name: "Bコース", status: "△", update: "09:10", note: null },
  ],
  lifts: [{ name: "第1リフト", status: "○", update: "09:00", note: null }],
  weather: {
    山頂: {
      update: "09:00",
      weather: "晴れ",
      temperature: -5,
      snowDepth: 150,
      snowfall: 3,
      condition: "良好",
      windSpeed: 4,
    },
  },
  comment: "本日は晴天です",
  newsUrl: ["https://example.com/news"],
});

test("capability引数がnullなら差分は空配列になる", () => {
  assert.deepEqual(findCapabilityGaps(null, {}), []);
});

test("台帳がtrueとしているフィールドが結果に無いと差分が1件出る", () => {
  const capability = buildCoursesCapability();
  const gaps = findCapabilityGaps(capability, {
    courses: [
      { name: "Aコース", status: "○", update: null, note: null },
      { name: "Bコース", status: "△", update: null, note: null },
    ],
  });
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].category, "COURSES");
  assert.equal(gaps[0].code, "CAPABILITY.MISSING_COURSES_FIELD");
});

test("台帳がfalseとしているフィールドは結果に無くても差分にならない", () => {
  const capability = buildCoursesCapability();
  // note は台帳上 false（一度も値が入らなかった）なので、結果に無くても差分にならない。
  const gaps = findCapabilityGaps(capability, {
    courses: [
      { name: "Aコース", status: "○", update: "09:30", note: null },
      { name: "Bコース", status: "△", update: "09:40", note: null },
    ],
  });
  assert.deepEqual(gaps, []);
});

test("台帳にコースがあるのに結果が0件だとMISSING_COURSESの差分が出る", () => {
  const capability = buildCoursesCapability();
  const gaps = findCapabilityGaps(capability, { courses: [] });
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].code, "CAPABILITY.MISSING_COURSES");
});

test("台帳にある名前が結果から消えていると差分として報告される", () => {
  const capability = buildCoursesCapability();
  const gaps = findCapabilityGaps(capability, {
    courses: [
      { name: "Aコース", status: "○", update: "09:00", note: null },
      { name: "Cコース", status: "△", update: "09:10", note: null },
    ],
  });
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].code, "CAPABILITY.MISSING_COURSES_NAMES");
  assert.match(gaps[0].message, /Bコース/);
});

test("結果が台帳と一致していれば差分は出ない", () => {
  const capability = build(fullResult());
  const gaps = findCapabilityGaps(capability, fullResult());
  assert.deepEqual(gaps, []);
});
