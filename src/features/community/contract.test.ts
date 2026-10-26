import assert from "node:assert/strict";
import test from "node:test";
import {
  observedOnSchema,
  reportDraftSchema,
  reportEntrySchema,
} from "./contract";

const entry = (kind: "COURSE" | "LIFT" | "MOGUL" | "ITEM", extra = {}) => ({
  clientKey: crypto.randomUUID(),
  kind,
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
  ...extra,
});

test("report entries enforce target and kind-specific fields", () => {
  const valid = [
    entry("COURSE", {
      courseId: "course-a",
      status: "積雪不足",
      snowQualities: ["硬め"],
      crowding: "普通",
      latitude: 43,
      longitude: 140,
    }),
    entry("LIFT", {
      liftId: "lift-a",
      status: "減速中",
      waitMinutes: 12,
      liftSpeed: 2.3,
      liftSpeedLevel: "遅い",
    }),
    entry("MOGUL", {
      courseId: "course-a",
      latitude: 43,
      longitude: 140,
      snowQualities: ["柔らかめ"],
      depth: "深い",
    }),
    entry("ITEM", {
      latitude: 43,
      longitude: 140,
      itemType: "キッカー",
      size: "5m",
    }),
  ];
  for (const item of valid)
    assert.ok(reportEntrySchema.safeParse(item).success);

  const invalid = [
    // 対象・状況・場所・アイテムの必須
    entry("COURSE", { status: "オープン" }),
    entry("COURSE", { courseId: "course-a" }),
    entry("LIFT", { liftId: "lift-a" }),
    entry("MOGUL"),
    entry("ITEM", { latitude: 43, longitude: 140 }),
    // 種類に合わない欄・値
    entry("COURSE", { courseId: "c", status: "減速中" }),
    entry("LIFT", { liftId: "l", status: "積雪不足" }),
    entry("LIFT", { liftId: "l", status: "オープン", snowQualities: ["硬め"] }),
    entry("LIFT", { liftId: "l", status: "オープン", crowding: "混雑" }),
    entry("COURSE", { courseId: "c", status: "オープン", waitMinutes: 5 }),
    entry("COURSE", { courseId: "c", status: "オープン", depth: "浅い" }),
    entry("MOGUL", { latitude: 43, longitude: 140, status: "オープン" }),
    entry("LIFT", { liftId: "l", status: "オープン", liftSpeed: 20 }),
    entry("COURSE", { courseId: "c", status: "オープン", latitude: 43 }),
  ];
  for (const item of invalid)
    assert.ok(!reportEntrySchema.safeParse(item).success, JSON.stringify(item));
});

test("a report carries exactly one item with its date and time", () => {
  const course = entry("COURSE", { courseId: "course-a", status: "オープン" });
  const valid = {
    observedOn: "2026-01-10",
    observedTime: "10:35",
    entries: [course],
  };
  assert.ok(reportDraftSchema.safeParse(valid).success);
  assert.ok(!reportDraftSchema.safeParse({ ...valid, entries: [] }).success);
  assert.ok(
    !reportDraftSchema.safeParse({
      ...valid,
      entries: [course, { ...course, clientKey: crypto.randomUUID() }],
    }).success,
  );
  assert.ok(
    !reportDraftSchema.safeParse({ ...valid, observedTime: null }).success,
  );
  assert.ok(
    !reportDraftSchema.safeParse({ ...valid, observedTime: "24:00" }).success,
  );
  // 以前の全体の感想・評価は受け付けない
  assert.ok(
    !reportDraftSchema.safeParse({ ...valid, body: "感想", rating: 5 }).success,
  );
});

test("observed dates reject impossible calendar days", () => {
  assert.ok(observedOnSchema.safeParse("2024-02-29").success);
  assert.ok(!observedOnSchema.safeParse("2026-02-30").success);
});
