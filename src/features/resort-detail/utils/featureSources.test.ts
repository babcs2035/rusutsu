import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  FinalizedCourseFeature,
  FinalizedLiftFeature,
} from "@/lib/finalizedResortGeojsonShared";
import {
  courseStatusSources,
  liftStatusSources,
  withTextFragment,
} from "./featureSources";

const course = (
  values: Partial<FinalizedCourseFeature>,
  update = "2026/4/2 8:04",
) => ({ properties: { update }, ...values }) as FinalizedCourseFeature;

test("空の区間出典でもスキー場の出典リンクを保持し、現在の掲載名を別名より優先する", () => {
  assert.deepEqual(
    courseStatusSources(
      {
        id: "g",
        displayName: "地図名",
        courses: [
          course({
            sourceUrls: [],
            latestStatusName: "公式の新名",
            statusMappingNames: ["公式の旧名", "公式の新名"],
          }),
        ],
      },
      ["https://example.com/status"],
    ),
    [
      {
        urls: ["https://example.com/status"],
        update: "2026/4/2 8:04",
        matches: [{ mapName: "地図名", officialNames: ["公式の新名"] }],
      },
    ],
  );
});

test("同じ出典と発表日時の区間をまとめ、異なる日時やURLの対応を混ぜない", () => {
  const sources = courseStatusSources(
    {
      id: "g",
      displayName: "上下",
      courses: [
        course({
          sectionName: "上部区間",
          sourceUrls: ["https://example.com/a"],
          latestStatusName: "上部",
        }),
        course({
          sectionName: "中部区間",
          sourceUrls: ["https://example.com/a"],
          latestStatusName: "中部",
        }),
        course(
          { sourceUrls: ["https://example.com/a"], latestStatusName: "下部" },
          "2026/4/1 8:00",
        ),
        course({
          sourceUrls: ["https://example.com/b"],
          latestStatusName: "迂回",
        }),
      ],
    },
    [],
  );
  assert.equal(sources.length, 3);
  assert.deepEqual(sources[0].matches, [
    { mapName: "上下（上部区間）", officialNames: ["上部"] },
    { mapName: "上下（中部区間）", officialNames: ["中部"] },
  ]);
  assert.deepEqual(sources[1].matches, [
    { mapName: "上下", officialNames: ["下部"] },
  ]);
  assert.equal(sources[1].update, "2026/4/1 8:00");
  assert.deepEqual(sources[2].urls, ["https://example.com/b"]);
});

test("未取得でも保存済みの対応名を示し、未対応の線に掲載名を推測しない", () => {
  const lift = {
    name: "地図のリフト名",
    statusMappingNames: ["公式名"],
    properties: { update: null },
  } as FinalizedLiftFeature;
  assert.deepEqual(
    liftStatusSources(lift, ["https://example.com/lifts"])[0].matches,
    [{ mapName: "地図のリフト名", officialNames: ["公式名"] }],
  );
  assert.deepEqual(
    liftStatusSources({ ...lift, statusMappingNames: [] }, [])[0].matches,
    [{ mapName: "地図のリフト名", officialNames: [] }],
  );
});

test("同じ区間の線が複数あっても対応行を重複させない", () => {
  const part = course({ latestStatusName: "公式名", sectionName: "上部" });
  const sources = courseStatusSources(
    { id: "g", displayName: "地図名", courses: [part, part] },
    [],
  );
  assert.equal(sources[0].matches.length, 1);
});

test("上下の元の表記を機械的な区間番号より優先する", () => {
  const sources = courseStatusSources(
    {
      id: "g",
      displayName: "バンビ",
      courses: [
        course({
          name: "バンビ_#上部",
          sectionName: "区間1",
          latestStatusName: "バンビ上部",
        }),
      ],
    },
    [],
  );
  assert.deepEqual(sources[0].matches, [
    { mapName: "バンビ（上部）", officialNames: ["バンビ上部"] },
  ]);
});

test("出典リンクは掲載名の箇所へ飛ぶテキストフラグメントを付ける", () => {
  assert.equal(
    withTextFragment("https://example.com/status", [
      "A-1 コース",
      "A-1 コース",
    ]),
    "https://example.com/status#:~:text=A%2D1%20%E3%82%B3%E3%83%BC%E3%82%B9",
  );
  assert.equal(
    withTextFragment("https://example.com/s#lift", ["林間", "ゴンドラ"]),
    `https://example.com/s#lift:~:text=${encodeURIComponent("林間")}&text=${encodeURIComponent("ゴンドラ")}`,
  );
  assert.equal(
    withTextFragment("https://example.com/", [" "]),
    "https://example.com/",
  );
});
