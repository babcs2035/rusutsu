import assert from "node:assert/strict";
import test from "node:test";
import {
  latestRatings,
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
  conditions: [],
  crowding: null,
  rating: null,
  latitude: null,
  longitude: null,
  present: null,
  itemType: null,
  size: null,
  waitMinutes: null,
  ...extra,
});

test("report entries enforce target and kind-specific fields", () => {
  assert.ok(
    reportEntrySchema.safeParse(
      entry("COURSE", { courseId: "course-a", rating: 4 }),
    ).success,
  );
  assert.ok(
    reportEntrySchema.safeParse(
      entry("LIFT", { liftId: "lift-a", waitMinutes: 12, crowding: "普通" }),
    ).success,
  );
  assert.ok(
    reportEntrySchema.safeParse(
      entry("MOGUL", {
        courseId: "course-a",
        latitude: 43,
        longitude: 140,
        present: true,
        snowQualities: ["柔らかい"],
      }),
    ).success,
  );
  assert.ok(
    reportEntrySchema.safeParse(
      entry("ITEM", {
        courseId: "course-a",
        latitude: 43,
        longitude: 140,
        present: false,
        itemType: "キッカー",
        size: "小さめ",
      }),
    ).success,
  );

  assert.ok(!reportEntrySchema.safeParse(entry("COURSE")).success);
  assert.ok(!reportEntrySchema.safeParse(entry("LIFT")).success);
  assert.ok(
    !reportEntrySchema.safeParse(
      entry("COURSE", { courseId: "course-a", liftId: "lift-a" }),
    ).success,
  );
  assert.ok(
    !reportEntrySchema.safeParse(
      entry("MOGUL", { latitude: 43, longitude: 140 }),
    ).success,
  );
  assert.ok(
    !reportEntrySchema.safeParse(
      entry("ITEM", {
        latitude: 43,
        longitude: 140,
        present: true,
      }),
    ).success,
  );
  assert.ok(
    !reportEntrySchema.safeParse(
      entry("LIFT", { liftId: "lift-a", snowQualities: ["パウダー（軽い）"] }),
    ).success,
  );
  assert.ok(
    !reportEntrySchema.safeParse(entry("COURSE", { rating: 6 })).success,
  );
});

test("a visit report can combine all entry kinds and rejects duplicate targets", () => {
  const entries = [
    entry("COURSE", { courseId: "course-a", rating: 4 }),
    entry("LIFT", { liftId: "lift-a", waitMinutes: 5 }),
    entry("MOGUL", {
      courseId: "course-a",
      latitude: 43,
      longitude: 140,
      present: true,
    }),
    entry("ITEM", {
      courseId: "course-a",
      latitude: 43.01,
      longitude: 140.01,
      present: true,
      itemType: "レール",
    }),
  ];
  assert.ok(
    reportDraftSchema.safeParse({
      observedOn: "2026-01-10",
      body: "一日の記録",
      rating: 5,
      entries,
    }).success,
  );
  assert.ok(
    !reportDraftSchema.safeParse({
      observedOn: "2026-01-10",
      body: "",
      rating: null,
      entries: [],
    }).success,
  );
  assert.ok(
    !reportDraftSchema.safeParse({
      observedOn: "2026-01-10",
      body: "",
      rating: null,
      entries: [entries[0], { ...entries[0], clientKey: crypto.randomUUID() }],
    }).success,
  );
  assert.ok(
    !reportDraftSchema.safeParse({
      observedOn: "2026-01-10",
      body: "",
      rating: null,
      entries: [entries[0], { ...entries[1], clientKey: entries[0].clientKey }],
    }).success,
  );
});

test("observed dates reject impossible calendar days", () => {
  assert.ok(!observedOnSchema.safeParse("2026-02-30").success);
});

test("ratings use the latest rated report per author and course", () => {
  const rows = [
    {
      id: "1",
      authorId: "a",
      courseId: "course",
      rating: 1,
      createdAt: "2026-01-01",
    },
    {
      id: "2",
      authorId: "a",
      courseId: "course",
      rating: 5,
      createdAt: "2026-01-02",
    },
    {
      id: "3",
      authorId: "a",
      courseId: "course",
      rating: null,
      createdAt: "2026-01-03",
    },
    {
      id: "4",
      authorId: "b",
      courseId: "course",
      rating: 3,
      createdAt: "2026-01-01",
    },
    {
      id: "5",
      authorId: "a",
      courseId: null,
      rating: 2,
      createdAt: "2026-01-01",
    },
  ];
  const summaries = latestRatings(rows);
  assert.deepEqual(
    summaries.find(summary => summary.courseId === "course"),
    { courseId: "course", average: 4, count: 2 },
  );
  assert.deepEqual(
    summaries.find(summary => summary.courseId === null),
    { courseId: null, average: 2, count: 1 },
  );
});
