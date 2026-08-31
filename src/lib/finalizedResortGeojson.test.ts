import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  getFinalizedResortMapData,
  getResortMapDataFromRoots,
  selectLatestTimestampedGeojsonFile,
} from "./finalizedResortGeojson";
import {
  calculateCoordinateSlopes,
  createCourseSlopeSegments,
  type FinalizedCourseFeature,
  type GeoCoordinate,
  getCourseDifficulty,
  getPisteStyle,
  getStatusOpacity,
  normalizeNumber,
  parseFinalizedCourseName,
} from "./finalizedResortGeojsonShared";

const SLOPE_TEST_COORDINATES: GeoCoordinate[] = [
  [0, 0, 100],
  [0.00009, 0, 99],
  [0.00018, 0, 98],
  [0.00027, 0, 97],
  [0.00036, 0, 96],
];

const createTestCourse = (
  coordinates: GeoCoordinate[] = SLOPE_TEST_COORDINATES,
): FinalizedCourseFeature => ({
  id: "course-1",
  name: "Test Course",
  displayName: "Test Course",
  groupId: "course-1",
  sectionName: null,
  coordinates,
  properties: {
    name: "Test Course",
    level: "中級",
    piste: "○",
    snowboard: null,
    status: "○",
    update: null,
    latestNote: null,
    horizontalDistMap: null,
    slopeDistMap: null,
    elevationDiffMap: null,
    avgSlopeDegMap: 12,
    maxSlopeDegMap: null,
    distance: null,
    avg: null,
    max: null,
    maxWidth: null,
    minWidth: null,
    note: null,
    image: null,
    searchWord: null,
    morning: null,
    night: null,
  },
});

test("selectLatestTimestampedGeojsonFile uses parsed filename timestamps", () => {
  assert.equal(
    selectLatestTimestampedGeojsonFile([
      "2025_0609_235959.geojson",
      "2025_0610_050334.geojson",
      "2024_1231_235959.geojson",
    ]),
    "2025_0610_050334.geojson",
  );
});

test("selectLatestTimestampedGeojsonFile excludes invalid names and dates", () => {
  assert.equal(
    selectLatestTimestampedGeojsonFile([
      "latest.geojson",
      "2025_0230_050334.geojson",
      "2025_0610_050334.json",
      "2025_0610_050334.geojson",
    ]),
    "2025_0610_050334.geojson",
  );
});

test("level strings are normalized to difficulty buckets", () => {
  assert.equal(getCourseDifficulty("初級"), "beginner");
  assert.equal(getCourseDifficulty("初・中級"), "beginnerIntermediate");
  assert.equal(getCourseDifficulty("初中級"), "beginnerIntermediate");
  assert.equal(getCourseDifficulty("中級"), "intermediate");
  assert.equal(getCourseDifficulty("中・上級"), "intermediateAdvanced");
  assert.equal(getCourseDifficulty("中上級"), "intermediateAdvanced");
  assert.equal(getCourseDifficulty("上級"), "advanced");
  assert.equal(getCourseDifficulty(""), "unknown");
  assert.equal(getCourseDifficulty("林間"), "unknown");
});

test("course display names normalize nameless courses", () => {
  assert.deepEqual(parseFinalizedCourseName("無名_1"), {
    displayName: "無名",
    groupName: "無名_1",
    sectionName: null,
  });
  assert.deepEqual(parseFinalizedCourseName("無名_連絡"), {
    displayName: "連絡",
    groupName: "無名_連絡",
    sectionName: null,
  });
});

test("only top middle bottom suffixes produce course groups", () => {
  assert.deepEqual(parseFinalizedCourseName("X_上部"), {
    displayName: "X",
    groupName: "X",
    sectionName: "上部",
  });
  assert.deepEqual(parseFinalizedCourseName("X_#下部"), {
    displayName: "X",
    groupName: "X",
    sectionName: "下部",
  });
  assert.deepEqual(parseFinalizedCourseName("X_2"), {
    displayName: "X_2",
    groupName: "X_2",
    sectionName: null,
  });
  assert.deepEqual(parseFinalizedCourseName("X_迂回"), {
    displayName: "X_迂回",
    groupName: "X_迂回",
    sectionName: null,
  });
});

test("piste styles are mapped from piste status", () => {
  assert.equal(getPisteStyle("○"), "solid");
  assert.equal(getPisteStyle("△"), "solid");
  assert.equal(getPisteStyle("×"), "dot");
  assert.equal(getPisteStyle(undefined), "solid");
});

test("status opacity is mapped from operation status", () => {
  assert.equal(getStatusOpacity("○"), 1);
  assert.equal(getStatusOpacity("△"), 0.6);
  assert.equal(getStatusOpacity("×"), 0.25);
  assert.equal(getStatusOpacity(undefined), 0.75);
});

test("coordinate elevations produce smoothed point slopes", () => {
  const slopes = calculateCoordinateSlopes(SLOPE_TEST_COORDINATES);

  assert.equal(slopes.length, SLOPE_TEST_COORDINATES.length);
  for (const slope of slopes) {
    assert.ok(slope !== null);
    assert.ok(Math.abs(slope - 5.71) < 0.05);
  }
});

test("coordinate elevations produce colored slope segments", () => {
  const segments = createCourseSlopeSegments(createTestCourse());

  assert.equal(segments.length, SLOPE_TEST_COORDINATES.length - 1);
  assert.ok(Math.abs((segments[0]?.slope ?? 0) - 5.71) < 0.05);
  assert.notEqual(segments[0]?.slope, 12);
});

test("slope segments can be widened while preserving intermediate coordinates", () => {
  const segments = createCourseSlopeSegments(createTestCourse(), 2);

  assert.equal(segments.length, 2);
  assert.equal(segments[0].coordinates.length, 3);
  assert.ok(Math.abs((segments[0]?.slope ?? 0) - 5.71) < 0.05);
});

test("courses without elevations fall back to their saved average slope", () => {
  const segments = createCourseSlopeSegments(
    createTestCourse([
      [137, 36],
      [137.001, 36.001],
      [137.002, 36.002],
    ]),
  );

  assert.equal(segments.length, 2);
  assert.equal(segments[0].slope, 12);
  assert.equal(segments[1].slope, 12);
});

test("empty strings are treated as missing numeric values", () => {
  assert.equal(normalizeNumber(""), null);
  assert.equal(normalizeNumber("not-number"), null);
  assert.equal(normalizeNumber("0"), 0);
});

test("unknown resort ids return no finalized map data", async () => {
  assert.equal(await getFinalizedResortMapData("missing-resort-id"), null);
});

test("map data follows finalized, measured, then before priority", async () => {
  const fixtureRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "resort-map-data-"),
  );
  const roots = { temporaryRoot: path.join(fixtureRoot, "temporary") };
  const writeGeojson = async (
    filePath: string,
    name: string,
    coordinates: number[][],
    properties: Record<string, unknown> = {},
  ) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "LineString", coordinates },
            properties: { name, ...properties },
          },
        ],
      }),
    );
  };

  const writeJson = async (filePath: string, value: unknown) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value));
  };

  try {
    // slope_10m の線に、基本情報（*_detail）と当日の状況（latest_data）を重ねる
    const mergedId = "merged-resort";
    await writeGeojson(
      path.join(roots.temporaryRoot, "slope_10m", `${mergedId}.geojson`),
      "白樺ゲレンデ_#上部",
      [
        [140, 40, 1000],
        [140.01, 40.01, 900],
      ],
      { avg_slope_deg_map: "12.3" },
    );
    await writeJson(
      path.join(roots.temporaryRoot, "slope_detail", `${mergedId}.json`),
      [
        {
          name: "白樺ゲレンデ",
          level: "中級",
          piste: "○",
          snowboard: "○",
          searchWord: "テスト　白樺ゲレンデ",
        },
      ],
    );
    await writeGeojson(
      path.join(roots.temporaryRoot, "lift_20m", `${mergedId}.geojson`),
      "第1ペア",
      [
        [140, 40, 900],
        [140.01, 40.01, 1000],
      ],
    );
    await writeJson(
      path.join(roots.temporaryRoot, "lift_detail", `${mergedId}.json`),
      [
        {
          name: "第1ペア",
          type: "ペアリフト",
          speed: "低速",
          capacity: 2,
          hood: "×",
          footrest: "○",
          oilShield: "×",
          searchWord: "テスト　第1ペア",
        },
      ],
    );
    await writeJson(
      path.join(
        roots.temporaryRoot,
        "latest_data",
        mergedId,
        "2026_0101_000000.json",
      ),
      {
        time: "2026/1/1 0:00:00",
        courses: [
          {
            name: "白樺ゲレンデ上部",
            status: "○",
            update: "2026-01-01 07:00 更新",
            note: "圧雪",
          },
        ],
        lifts: [{ name: "第1ペア", status: "×", note: "運休" }],
        courseUrl: ["https://example.com/course"],
        liftUrl: ["https://example.com/lift"],
      },
    );

    const explicitMappingId = "explicit-mapping";
    await writeGeojson(
      path.join(
        roots.temporaryRoot,
        "slope_10m",
        `${explicitMappingId}.geojson`,
      ),
      "地図側コース名",
      [
        [140, 40, 1000],
        [140.01, 40.01, 900],
      ],
    );
    await writeJson(
      path.join(
        roots.temporaryRoot,
        "latest_data",
        explicitMappingId,
        "2026_0101_000000.json",
      ),
      {
        courses: [{ name: "公式サイト側コース名", status: "×", note: "運休" }],
      },
    );
    await writeJson(
      path.join(
        roots.temporaryRoot,
        "latest_status_mapping",
        `${explicitMappingId}.json`,
      ),
      {
        version: 1,
        courses: {
          sourceFile: "2026_0101_000000.json",
          updatedAt: "2026-01-01T00:00:00.000Z",
          rows: [
            {
              crawledName: "公式サイト側コース名",
              geojsonName: "地図側コース名",
            },
          ],
        },
      },
    );

    const measuredId = "measured-fallback";
    await writeGeojson(
      path.join(roots.temporaryRoot, "slope_10m", `${measuredId}.geojson`),
      "measured-course",
      [
        [140, 40, 1000],
        [140.01, 40.01, 900],
      ],
      { slope_deg: [10, 20] },
    );
    await writeGeojson(
      path.join(roots.temporaryRoot, "lift_20m", `${measuredId}.geojson`),
      "measured-lift",
      [
        [140, 40, 900],
        [140.01, 40.01, 1000],
      ],
    );

    const beforeId = "before-fallback";
    await writeGeojson(
      path.join(roots.temporaryRoot, "slope_before", `${beforeId}.geojson`),
      "before-course",
      [
        [140, 40],
        [140.01, 40.01],
      ],
    );
    await writeGeojson(
      path.join(roots.temporaryRoot, "lift_before", `${beforeId}.geojson`),
      "before-lift",
      [
        [140, 40],
        [140.01, 40.01],
      ],
      { aerialway: "chair_lift" },
    );

    const osmId = "osm-fallback";
    await writeGeojson(
      path.join(roots.temporaryRoot, "slope_10m_osm", `${osmId}.geojson`),
      "OSMコース",
      [
        [140, 40],
        [140.01, 40.01],
      ],
    );
    await writeGeojson(
      path.join(roots.temporaryRoot, "slope_before_osm", `${osmId}.geojson`),
      "OSMコース",
      [
        [140, 40],
        [140.01, 40.01],
      ],
      { level: "初級", osm_source: "OpenStreetMap" },
    );
    // 同名の curated 詳細があっても、OSMコースへ混ぜない。
    await writeJson(
      path.join(roots.temporaryRoot, "slope_detail", `${osmId}.json`),
      [{ name: "OSMコース", level: "上級" }],
    );

    const mixedId = "mixed-sources";
    await writeGeojson(
      path.join(roots.temporaryRoot, "slope_before", `${mixedId}.geojson`),
      "確認済みコース",
      [
        [140, 40],
        [140.01, 40.01],
      ],
      { level: "中級" },
    );
    await writeGeojson(
      path.join(roots.temporaryRoot, "slope_before_osm", `${mixedId}.geojson`),
      "OSM追加コース",
      [
        [140.02, 40.02],
        [140.03, 40.03],
      ],
      { level: "初級", osm_source: "OpenStreetMap" },
    );

    const perKindLatestId = "per-kind-latest";
    await writeGeojson(
      path.join(roots.temporaryRoot, "slope_10m", `${perKindLatestId}.geojson`),
      "旧コース取得",
      [
        [140, 40],
        [140.01, 40.01],
      ],
    );
    await writeGeojson(
      path.join(roots.temporaryRoot, "lift_20m", `${perKindLatestId}.geojson`),
      "新リフト取得",
      [
        [140, 40],
        [140.01, 40.01],
      ],
    );
    await writeJson(
      path.join(
        roots.temporaryRoot,
        "latest_data",
        perKindLatestId,
        "2026_0101_000000.json",
      ),
      {
        courses: [{ name: "旧コース取得", status: "△" }],
        courseUrl: "https://example.com/older-course",
      },
    );
    await writeJson(
      path.join(
        roots.temporaryRoot,
        "latest_data",
        perKindLatestId,
        "2026_0101_000100.json",
      ),
      {
        lifts: [{ name: "新リフト取得", status: "○" }],
        liftUrl: "https://example.com/newer-lift",
      },
    );
    await writeJson(
      path.join(
        roots.temporaryRoot,
        "latest_data",
        perKindLatestId,
        "2026_0101_000200.json",
      ),
      { weather: { status: "取得成功" } },
    );

    const mergedData = await getResortMapDataFromRoots(mergedId, roots);
    const mergedCourse = mergedData?.courses?.features[0];
    assert.equal(mergedData?.courses?.source, "slope_10m");
    assert.equal(mergedData?.courses?.baseSource, "slope_detail");
    assert.equal(mergedData?.courses?.verificationStatus, "verified");
    assert.equal(mergedCourse?.verificationStatus, "verified");
    assert.deepEqual(mergedData?.courses?.sourceUrls, [
      "https://example.com/course",
    ]);
    assert.equal(mergedCourse?.displayName, "白樺ゲレンデ");
    assert.equal(mergedCourse?.sectionName, "上部");
    assert.equal(mergedCourse?.properties.level, "中級");
    assert.equal(mergedCourse?.properties.searchWord, "テスト　白樺ゲレンデ");
    // latest_data の note は latestNote に移し、基本情報の note と混ぜない
    assert.equal(mergedCourse?.properties.latestNote, "圧雪");
    assert.equal(mergedCourse?.properties.status, "○");
    assert.equal(mergedCourse?.properties.update, "2026-01-01 07:00 更新");

    const mergedLift = mergedData?.lifts?.features[0];
    assert.equal(mergedData?.lifts?.baseSource, "lift_detail");
    assert.equal(mergedLift?.properties.type, "ペアリフト");
    assert.equal(mergedLift?.properties.status, "×");
    assert.deepEqual(mergedData?.lifts?.sourceUrls, [
      "https://example.com/lift",
    ]);

    const explicitMappingData = await getResortMapDataFromRoots(
      explicitMappingId,
      roots,
    );
    assert.equal(
      explicitMappingData?.courses?.features[0]?.properties.status,
      "×",
    );
    assert.equal(
      explicitMappingData?.courses?.features[0]?.properties.latestNote,
      "運休",
    );

    const measuredData = await getResortMapDataFromRoots(measuredId, roots);
    assert.equal(measuredData?.courses?.source, "slope_10m");
    assert.equal(measuredData?.lifts?.source, "lift_20m");
    const measuredCourse = measuredData?.courses?.features[0];
    assert.ok(measuredCourse);
    assert.equal("slopeDeg" in measuredCourse, false);

    const beforeData = await getResortMapDataFromRoots(beforeId, roots);
    assert.equal(beforeData?.courses?.source, "slope_before");
    assert.equal(beforeData?.lifts?.source, "lift_before");
    const course = beforeData?.courses?.features[0];
    const lift = beforeData?.lifts?.features[0];
    assert.ok(course);
    assert.ok(lift);
    assert.equal(
      course.coordinates.every(coordinate => coordinate.length === 2),
      true,
    );
    assert.equal(
      lift.coordinates.every(coordinate => coordinate.length === 2),
      true,
    );
    assert.equal(lift.properties.type, "chair_lift");
    assert.doesNotThrow(() => createCourseSlopeSegments(course));

    const osmData = await getResortMapDataFromRoots(osmId, roots);
    assert.equal(osmData?.courses?.source, "slope_10m_osm");
    assert.equal(osmData?.courses?.baseSource, "slope_before_osm");
    assert.equal(osmData?.courses?.verificationStatus, "unverified");
    assert.deepEqual(osmData?.courses?.sourceUrls, [
      "https://www.openstreetmap.org/copyright",
    ]);
    assert.equal(osmData?.courses?.features[0]?.properties.level, "初級");
    assert.equal(
      osmData?.courses?.features[0]?.verificationStatus,
      "unverified",
    );

    const mixedData = await getResortMapDataFromRoots(mixedId, roots);
    assert.equal(mixedData?.courses?.source, "mixed");
    assert.equal(mixedData?.courses?.baseSource, "mixed");
    assert.equal(mixedData?.courses?.verificationStatus, "mixed");
    assert.deepEqual(
      mixedData?.courses?.features.map(feature => [
        feature.name,
        feature.verificationStatus,
      ]),
      [
        ["確認済みコース", "verified"],
        ["OSM追加コース", "unverified"],
      ],
    );

    const perKindLatestData = await getResortMapDataFromRoots(
      perKindLatestId,
      roots,
    );
    assert.equal(perKindLatestData?.courses?.fileName, "2026_0101_000000.json");
    assert.equal(
      perKindLatestData?.courses?.features[0]?.properties.status,
      "△",
    );
    assert.deepEqual(perKindLatestData?.courses?.sourceUrls, [
      "https://example.com/older-course",
    ]);
    assert.equal(perKindLatestData?.lifts?.fileName, "2026_0101_000100.json");
    assert.equal(perKindLatestData?.lifts?.features[0]?.properties.status, "○");
    assert.deepEqual(perKindLatestData?.lifts?.sourceUrls, [
      "https://example.com/newer-lift",
    ]);
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});
