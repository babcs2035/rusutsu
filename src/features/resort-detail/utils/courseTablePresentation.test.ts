import assert from "node:assert/strict";
import test from "node:test";
import type { FinalizedCourseFeature } from "@/lib/finalizedResortGeojsonShared";
import type { FinalizedCourseGroup } from "../types";
import {
  courseDifficultyBands,
  courseNameBackground,
  courseSectionSymbols,
} from "./courseTablePresentation";

const course = (
  id: string,
  order: number,
  properties: Partial<FinalizedCourseFeature["properties"]>,
): FinalizedCourseFeature =>
  ({
    id,
    groupId: "group",
    displayName: "コース",
    groupKind: "continuous",
    sectionOrder: order,
    sectionName: `区間${order}`,
    coordinates: [
      [140, 40, 1000],
      [140, 40.001, 900],
    ],
    properties: { status: null, piste: null, ...properties },
  }) as FinalizedCourseFeature;
const group = (courses: FinalizedCourseFeature[]): FinalizedCourseGroup => ({
  id: "group",
  displayName: "コース",
  courses,
});

test("上部○・中部×・下部○を省略せず、地物の配列順にも依存しない", () => {
  const input = group([
    course("bottom", 3, { status: "○", piste: "○" }),
    course("top", 1, { status: "○", piste: "○" }),
    course("middle", 2, { status: "×", piste: "×" }),
  ]);
  const expected = [
    { label: "上部", symbol: "○" },
    { label: "中部", symbol: "×" },
    { label: "下部", symbol: "○" },
  ];
  assert.deepEqual(courseSectionSymbols(input, "status"), expected);
  assert.deepEqual(courseSectionSymbols(input, "piste"), expected);
});

test("全区間で同じ値なら1記号にまとめ、欠損区間は残す", () => {
  const input = group([
    course("top", 1, { status: "○", piste: "○" }),
    course("bottom", 2, { status: "○", piste: null }),
  ]);
  assert.deepEqual(courseSectionSymbols(input, "status"), [
    { label: "", symbol: "○" },
  ]);
  assert.deepEqual(courseSectionSymbols(input, "piste"), [
    { label: "上部", symbol: "○" },
    { label: "下部", symbol: null },
  ]);
});

test("難易度の背景をメインルートの区間距離25%・50%・25%で分ける", () => {
  const input = group([
    course("top", 1, { level: "上級", slopeDistMap: 100 }),
    course("middle", 2, { level: "中級", slopeDistMap: 200 }),
    course("bottom", 3, { level: "初級", slopeDistMap: 100 }),
  ]);
  const bands = courseDifficultyBands(input);
  assert.deepEqual(bands, [
    { difficulty: "advanced", fraction: 0.25 },
    { difficulty: "intermediate", fraction: 0.5 },
    { difficulty: "beginner", fraction: 0.25 },
  ]);
  assert.match(courseNameBackground(bands), /0% 25%.*25% 75%.*75% 100%/u);
});

test("営業状況も圧雪も色の割合も、副ルートの値を混ぜない", () => {
  const main = {
    ...course("main", 2, {
      status: "○",
      piste: "○",
      level: "初級",
      slopeDistMap: 100,
    }),
    groupKind: "routes" as const,
    routeKey: "group:route:1",
  };
  const alternate = {
    ...course("alt", 1, {
      status: null,
      piste: "×",
      level: "上級",
      slopeDistMap: 900,
    }),
    groupKind: "routes" as const,
    routeKey: "group:route:2",
  };
  const input = group([alternate, main]);
  assert.deepEqual(courseSectionSymbols(input, "status"), [
    { label: "", symbol: "○" },
  ]);
  assert.deepEqual(courseSectionSymbols(input, "piste"), [
    { label: "", symbol: "○" },
  ]);
  assert.deepEqual(courseDifficultyBands(input), [
    { difficulty: "beginner", fraction: 1 },
  ]);
});

test("1本の線内の圧雪設定も、隙間を元の値で補って区間表示する", () => {
  const input = group([
    course("segmented", 1, {
      piste: "○",
      pisteSegments: [{ from: 0.25, to: 0.75, value: "×" }],
    }),
  ]);
  assert.deepEqual(courseSectionSymbols(input, "piste"), [
    { label: "上部", symbol: "○" },
    { label: "中部", symbol: "×" },
    { label: "下部", symbol: "○" },
  ]);
});

test("早朝・ナイターもメインルートを使い、同じ値が続く区間を上部・下部にまとめる", () => {
  const input = group([
    {
      ...course("alternate", 1, { morning: "○", night: "×" }),
      groupKind: "routes",
      routeKey: "group:route:2",
    },
    ...[1, 2, 3].map(order => ({
      ...course(`main-${order}`, order, {
        morning: "×",
        night: order === 1 ? "×" : "○",
      }),
      groupKind: "routes" as const,
      routeKey: "group:route:1",
    })),
  ]);
  assert.deepEqual(courseSectionSymbols(input, "morning"), [
    { label: "", symbol: "×" },
  ]);
  assert.deepEqual(courseSectionSymbols(input, "night"), [
    { label: "上部", symbol: "×" },
    { label: "下部", symbol: "○" },
  ]);
});

test("早朝・ナイターの線内区間も読み取り、○×○や不明な途中区間は落とさない", () => {
  const input = group([
    course("segmented", 1, {
      morning: "○",
      night: null,
      morningSegments: [{ from: 0.25, to: 0.75, value: "×" }],
      nightSegments: [
        { from: 0, to: 0.25, value: "○" },
        { from: 0.75, to: 1, value: "○" },
      ],
    }),
  ]);
  assert.deepEqual(courseSectionSymbols(input, "morning"), [
    { label: "上部", symbol: "○" },
    { label: "中部", symbol: "×" },
    { label: "下部", symbol: "○" },
  ]);
  assert.deepEqual(courseSectionSymbols(input, "night"), [
    { label: "上部", symbol: "○" },
    { label: "中部", symbol: null },
    { label: "下部", symbol: "○" },
  ]);
});
