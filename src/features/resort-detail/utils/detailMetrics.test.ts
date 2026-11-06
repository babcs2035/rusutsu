import assert from "node:assert/strict";
import test from "node:test";
import type {
  FinalizedCourseFeature,
  GeoCoordinate,
} from "@/lib/finalizedResortGeojsonShared";
import {
  createConnectedCourseElevationProfile,
  createCourseProfileBands,
  createElevationProfile,
  createFinalizedCourseGroups,
  createLiftElevationProfile,
  findSelectedCourseGroup,
  getCourseGroupMetricItems,
  getCourseGroupMetrics,
  getCourseGroupStatus,
  getCourseGroupTags,
  getLiftElevationRange,
  getMainCourseGroup,
} from "./detailMetrics";

test("リフト駅の標高は途中の地形の起伏を含めずGeoJSONの両端から取得する", () => {
  assert.deepEqual(
    getLiftElevationRange([
      [140, 43, 426],
      [140, 43.001, 400],
      [140, 43.002, 528],
    ]),
    { min: 426, max: 528 },
  );
  assert.equal(
    getLiftElevationRange([
      [140, 43],
      [140, 43.002, 528],
    ]),
    null,
  );
});

test("リフト断面図は座標の格納順にかかわらず山麓から山頂へ進む", () => {
  const coordinates: GeoCoordinate[] = [
    [140, 43, 426],
    [140, 43.001, 480],
    [140, 43.002, 528],
  ];
  const before = structuredClone(coordinates);
  const profile = createLiftElevationProfile(coordinates);
  assert.deepEqual(
    profile,
    createLiftElevationProfile([...coordinates].reverse()),
  );
  assert.equal(profile[0].elevation, 426);
  assert.equal(profile[0].distance, 0);
  assert.equal(profile.at(-1)?.elevation, 528);
  assert.ok(profile.every(point => point.slope != null && point.slope > 0));
  assert.ok(
    profile.every(
      (point, index) =>
        index === 0 || point.distance > profile[index - 1].distance,
    ),
  );
  assert.deepEqual(coordinates, before);
  // コースの向きは従来どおり山頂から山麓。
  assert.equal(createElevationProfile(coordinates)[0].elevation, 528);
  assert.equal(
    createConnectedCourseElevationProfile([
      { ...route("lift-direction-regression", 140), coordinates },
    ])[0].elevation,
    528,
  );
});

const route = (
  id: string,
  lng: number,
  routeNumber = 1,
  sectionOrder = 1,
  props: Record<string, unknown> = {},
) =>
  ({
    id,
    groupId: "group",
    displayName: "コース",
    groupKind: "routes",
    routeKey: `group:route:${routeNumber}`,
    sectionOrder,
    sectionName: `section${sectionOrder}`,
    coordinates: [
      [lng, 0, 1000],
      [lng, 0.001, 900 - sectionOrder * 10],
    ],
    properties: {
      status: null,
      piste: null,
      slopeDistMap: null,
      distance: null,
      horizontalDistMap: null,
      avgSlopeDegMap: null,
      maxSlopeDegMap: null,
      elevationDiffMap: null,
      ...props,
    },
  }) as unknown as FinalizedCourseFeature;

const groups = createFinalizedCourseGroups([
  route("a", 0, 1),
  route("b", 0.01, 2),
]);

test("一覧から選んだときは最小番号のMAINルートの区間を返す", () => {
  const group = findSelectedCourseGroup(groups, {
    kind: "course",
    id: "group",
  });
  assert.deepEqual(
    group?.courses.map(course => course.id),
    ["a"],
  );
  assert.equal(
    createConnectedCourseElevationProfile(group?.courses ?? []).length,
    2,
  );
});

test("地図で押した別ルートは、その1本だけで断面図を作る", () => {
  const group = findSelectedCourseGroup(groups, {
    kind: "course",
    id: "group",
    routeId: "b",
  });
  assert.deepEqual(
    group?.courses.map(course => course.id),
    ["b"],
  );
  assert.equal(
    createConnectedCourseElevationProfile(group?.courses ?? []).length,
    2,
  );
});

test("見つからないルートはMAINルートに戻す", () => {
  const group = findSelectedCourseGroup(groups, {
    kind: "course",
    id: "group",
    routeId: "missing",
  });
  assert.deepEqual(
    group?.courses.map(course => course.id),
    ["a"],
  );
});

test("MAINはroute:2をroute:10より優先し、入力順に依存しない", () => {
  const route2 = route("r2", 0, 2);
  const route10 = route("r10", 0.01, 10);
  const inputGroup = {
    id: "group",
    displayName: "コース",
    courses: [route10, route2],
  };
  assert.deepEqual(
    getMainCourseGroup(inputGroup).courses.map(item => item.id),
    ["r2"],
  );
});

test("MAINの複数区間を順序づけ、二次ルートの営業状況を混ぜない", () => {
  const mainLower = route("main-lower", 0, 1, 2, { status: "○" });
  const secondary = route("secondary", 0.01, 2, 1, { status: "×" });
  const mainUpper = route("main-upper", 0, 1, 1, { status: "○" });
  const group = {
    id: "group",
    displayName: "コース",
    courses: [mainLower, secondary, mainUpper],
  };
  assert.deepEqual(
    getMainCourseGroup(group).courses.map(item => item.id),
    ["main-upper", "main-lower"],
  );
  assert.deepEqual(getCourseGroupStatus(group), { symbol: "○", note: null });
});

test("sectionOrderがないMAIN区間は旧区間名で上部から並べる", () => {
  const lower = {
    ...route("lower", 0, 1),
    sectionName: "下部",
    sectionOrder: undefined,
  };
  const upper = {
    ...route("upper", 0, 1),
    sectionName: "上部",
    sectionOrder: undefined,
  };
  const middle = {
    ...route("middle", 0, 1),
    sectionName: "中部",
    sectionOrder: undefined,
  };
  const group = {
    id: "group",
    displayName: "コース",
    courses: [lower, middle, upper],
  };
  assert.deepEqual(
    getMainCourseGroup(group).courses.map(course => course.id),
    ["upper", "middle", "lower"],
  );
});

test("MAINの欠損営業状況を二次ルートの状態で補わない", () => {
  const group = {
    id: "group",
    displayName: "コース",
    courses: [
      route("main", 0, 1, 1, { status: null }),
      route("alt", 0.01, 2, 1, { status: "○" }),
    ],
  };
  assert.deepEqual(getCourseGroupStatus(group), { symbol: null, note: null });
});

test("MAIN区間のメトリクスを合算し、距離加重平均と最大値を使う", () => {
  const group = {
    id: "group",
    displayName: "コース",
    courses: [
      route("main1", 0, 1, 1, {
        slopeDistMap: 100,
        horizontalDistMap: 80,
        avgSlopeDegMap: 10,
        maxSlopeDegMap: 20,
        elevationDiffMap: 30,
      }),
      route("alt", 0.01, 2, 1, {
        slopeDistMap: 900,
        horizontalDistMap: 900,
        avgSlopeDegMap: 50,
        maxSlopeDegMap: 60,
        elevationDiffMap: 500,
      }),
      route("main2", 0, 1, 2, {
        slopeDistMap: 300,
        horizontalDistMap: 220,
        avgSlopeDegMap: 20,
        maxSlopeDegMap: 25,
        elevationDiffMap: 40,
      }),
    ],
  };
  const items = getCourseGroupMetricItems(group);
  assert.equal(items[0].value, "300m");
  assert.equal(items[1].value, "400m");
  assert.equal(items[2].value, "70m");
  assert.equal(items[3].value, "18°");
  assert.equal(items[4].value, "25°");
  assert.equal(items[2].detail, "(1000〜880m)");
});

test("距離がない単一区間の平均斜度は既存値を維持する", () => {
  const group = {
    id: "group",
    displayName: "コース",
    courses: [route("main", 0, 1, 1, { avgSlopeDegMap: 17 })],
  };
  assert.equal(getCourseGroupMetrics(group).averageSlope, 17);
});

test("選択したalternate routeは明示選択として保持する", () => {
  const route2 = route("r2", 0, 2);
  const route1 = route("r1", 0.01, 1);
  const group = {
    id: "group",
    displayName: "コース",
    courses: [route1, route2],
  };
  const selected = findSelectedCourseGroup([group], {
    kind: "course",
    id: "group",
    routeId: "group:route:2",
  });
  assert.deepEqual(
    selected?.courses.map(item => item.id),
    ["r2"],
  );
});

test("標高差マップがない区間は座標から補い、全区間不明ならnull", () => {
  const mappedFallback = route("main", 0, 1, 1, { elevationDiffMap: null });
  const group = {
    id: "group",
    displayName: "コース",
    courses: [mappedFallback],
  };
  assert.equal(getCourseGroupMetrics(group).elevationDiff, 110);

  const unknown = {
    ...mappedFallback,
    coordinates: [
      [0, 0],
      [0, 0.001],
    ],
  } as unknown as FinalizedCourseFeature;
  assert.equal(
    getCourseGroupMetrics({ ...group, courses: [unknown] }).elevationDiff,
    null,
  );
});

const section = (
  id: string,
  sectionOrder: number,
  props: Record<string, unknown>,
  coordinates: GeoCoordinate[],
) =>
  ({
    ...route(id, 0, 1, sectionOrder, props),
    groupKind: "continuous",
    routeKey: undefined,
    coordinates,
  }) as unknown as FinalizedCourseFeature;

test("圧雪が区間で違うときは圧雪でない区間だけ位置を添えて書く", () => {
  const courses = [
    section("top", 1, { piste: "×", level: "上級", night: "×" }, [
      [0, 0, 1000],
      [0, 0.001, 950],
    ]),
    // 座標が下から上へ並んでいても、標高の高い側を上部として扱う
    section(
      "bottom",
      2,
      {
        piste: "○",
        level: "中級",
        night: "○",
        pisteSegments: [{ from: 0, to: 0.5, value: "△" }],
      },
      [
        [0, 0.002, 900],
        [0, 0.001, 950],
      ],
    ),
  ];
  const tags = getCourseGroupTags({
    id: "group",
    displayName: "コース",
    courses,
  });
  assert.deepEqual(
    tags.grooming.map(item => item.label),
    ["上部 非圧雪", "下部 日によって圧雪"],
  );
  assert.deepEqual(tags.hours, [{ label: "下部 ナイター", kind: "night" }]);

  const bands = createCourseProfileBands(courses);
  assert.deepEqual(
    bands.map(band => band.key),
    ["level", "piste", "night"],
  );
  const piste = bands.find(band => band.key === "piste");
  assert.deepEqual(
    piste?.runs.map(run => [run.label, Number(run.from.toFixed(2))]),
    [
      ["非圧雪", 0],
      ["圧雪", 0.5],
      ["日によって圧雪", 0.75],
    ],
  );
});

test("全区間が同じなら位置を付けず、帯はレベルと圧雪だけ出す", () => {
  const courses = [
    section("only", 1, { piste: "○", level: "初級", morning: "○" }, [
      [0, 0, 1000],
      [0, 0.001, 950],
    ]),
  ];
  const tags = getCourseGroupTags({
    id: "group",
    displayName: "コース",
    courses,
  });
  assert.deepEqual(
    tags.grooming.map(item => item.label),
    ["圧雪"],
  );
  assert.deepEqual(tags.hours, [{ label: "早朝", kind: "morning" }]);
  assert.deepEqual(
    createCourseProfileBands(courses).map(band => [
      band.key,
      band.runs.map(run => run.label),
    ]),
    [
      ["level", ["初級"]],
      ["piste", ["圧雪"]],
    ],
  );
});
