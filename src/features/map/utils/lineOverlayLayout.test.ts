import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProjectedLine,
  getLabelDistances,
  getPointAtDistance,
  getSpacedDistances,
  getTangentAngle,
  isPointInsideOrientedRect,
  type LayoutPoint,
  orientedRectsOverlap,
  refineAnchor,
  toReadableAngle,
} from "./lineLayout";
import {
  collectDirectionMarks,
  collectLabelCandidates,
  getCourseLabelName,
  getDirectionMarkPath,
  getLabelFontSize,
  type LabelSource,
  placeLabelCandidates,
  shouldSkipCourseLabel,
} from "./lineOverlayLayout";

const horizontalPoints = (length: number, y = 0): LayoutPoint[] => [
  { x: 0, y },
  { x: length, y },
];

const measureWidth = (text: string, fontSize: number) =>
  Array.from(text).length * fontSize;

test("createProjectedLine が折れ線の長さと累積距離を返す", () => {
  const line = createProjectedLine([
    { x: 0, y: 0 },
    { x: 30, y: 40 },
    { x: 30, y: 90 },
  ]);

  assert.ok(line);
  assert.equal(line.length, 100);
  assert.deepEqual(line.cumulativeLengths, [0, 50, 100]);
});

test("createProjectedLine は点が足りない・長さ 0 の線を弾く", () => {
  assert.equal(createProjectedLine([{ x: 0, y: 0 }]), null);
  assert.equal(
    createProjectedLine([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ]),
    null,
  );
});

test("getPointAtDistance が線上の位置を返し、範囲外は端に丸める", () => {
  const line = createProjectedLine(horizontalPoints(100));
  assert.ok(line);
  assert.deepEqual(getPointAtDistance(line, 25), { x: 25, y: 0 });
  assert.deepEqual(getPointAtDistance(line, -10), { x: 0, y: 0 });
  assert.deepEqual(getPointAtDistance(line, 500), { x: 100, y: 0 });
});

test("getTangentAngle が進行方向を返す", () => {
  const line = createProjectedLine([
    { x: 0, y: 100 },
    { x: 100, y: 0 },
  ]);
  assert.ok(line);
  assert.equal(Math.round(getTangentAngle(line, 70, 20)), -45);
});

test("toReadableAngle は文字が逆さにならない範囲へ折り返す", () => {
  assert.equal(toReadableAngle(170), -10);
  assert.equal(toReadableAngle(-170), 10);
  assert.equal(toReadableAngle(45), 45);
});

test("getSpacedDistances は短い線には 1 つ、長い線には間隔ぶんだけ置く", () => {
  assert.deepEqual(
    getSpacedDistances({ length: 100, spacing: 360, margin: 30, maxCount: 6 }),
    [50],
  );

  const many = getSpacedDistances({
    length: 1200,
    spacing: 360,
    margin: 30,
    maxCount: 6,
  });
  assert.equal(many.length, 4);
  assert.equal(many[0], 30);
  assert.equal(many.at(-1), 1170);

  const capped = getSpacedDistances({
    length: 100000,
    spacing: 360,
    margin: 30,
    maxCount: 6,
  });
  assert.equal(capped.length, 6);
});

test("refineAnchor は曲がりの少ない位置へずらす", () => {
  // 中央付近だけが折れている線。曲がった真ん中を避けて直線側に寄るはず
  const line = createProjectedLine([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 150, y: 60 },
    { x: 200, y: 0 },
    { x: 400, y: 0 },
  ]);
  assert.ok(line);

  const anchor = refineAnchor({
    line,
    targetDistance: 160,
    span: 120,
    searchRadius: 90,
  });
  assert.notEqual(anchor.distance, 160);
  assert.ok(anchor.deviation < 20);
});

test("orientedRectsOverlap は回転を考慮する", () => {
  const bar = {
    cx: 0,
    cy: 0,
    halfWidth: 60,
    halfHeight: 4,
    angle: 45,
  };
  // bar と平行で、垂直方向に 20px 離した帯。
  // 軸並行矩形で判定すると重なって見えるが、実際には重なっていない。
  const parallelBar = {
    ...bar,
    cx: 14.14,
    cy: -14.14,
  };

  assert.equal(orientedRectsOverlap(bar, bar), true);
  assert.equal(orientedRectsOverlap(bar, parallelBar), false);
  assert.equal(orientedRectsOverlap(bar, { ...bar, cx: 400, cy: 400 }), false);
  assert.equal(orientedRectsOverlap(bar, { ...bar, angle: -45 }), true);
});

test("isPointInsideOrientedRect が回転した矩形の内外を判定する", () => {
  const rect = { cx: 0, cy: 0, halfWidth: 50, halfHeight: 5, angle: 90 };
  assert.equal(isPointInsideOrientedRect({ x: 0, y: 40 }, rect), true);
  assert.equal(isPointInsideOrientedRect({ x: 40, y: 0 }, rect), false);
});

test("getCourseLabelName が区間と連番の接尾辞だけを落とす", () => {
  assert.equal(getCourseLabelName("ホワイトラバー_2"), "ホワイトラバー");
  assert.equal(getCourseLabelName("ダイナミック_上部"), "ダイナミック");
  assert.equal(getCourseLabelName("ダイナミック_#下部"), "ダイナミック");
  assert.equal(getCourseLabelName("Aコース"), "Aコース");
});

test("shouldSkipCourseLabel は無名と空だけを除外する", () => {
  assert.equal(shouldSkipCourseLabel("無名"), true);
  assert.equal(shouldSkipCourseLabel(""), true);
  // `_` を含む名前を弾いていた旧実装の挙動には戻さない
  assert.equal(shouldSkipCourseLabel("ホワイトラバー"), false);
});

test("ラベルは線の向きに沿い、天地が逆になるときだけ折り返す", () => {
  // 右下がりの線（画面上は右下方向）
  const downRight = collectLabelCandidates({
    sources: [
      createSource({
        name: "テスト",
        points: [
          { x: 0, y: 0 },
          { x: 400, y: 400 },
        ],
      }),
    ],
    zoom: 16,
    twoLabelMinLength: 640,
    measureWidth,
  });
  assert.equal(Math.round(downRight[0]?.placement.angle ?? 0), 45);

  // 逆向き（左上方向）は文字が逆さになるので 180 度折り返して 45 度になる
  const upLeft = collectLabelCandidates({
    sources: [
      createSource({
        name: "テスト",
        points: [
          { x: 400, y: 400 },
          { x: 0, y: 0 },
        ],
      }),
    ],
    zoom: 16,
    twoLabelMinLength: 640,
    measureWidth,
  });
  assert.equal(Math.round(upLeft[0]?.placement.angle ?? 0), 45);
});

test("真下向きは残し、真上向きだけ下向きへ折り返す", () => {
  // 上から下へ読ませたいので 90 度はそのまま
  const down = collectLabelCandidates({
    sources: [
      createSource({
        name: "テスト",
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 400 },
        ],
      }),
    ],
    zoom: 16,
    twoLabelMinLength: 640,
    measureWidth,
  });
  assert.equal(Math.round(down[0]?.placement.angle ?? 0), 90);

  const up = collectLabelCandidates({
    sources: [
      createSource({
        name: "テスト",
        points: [
          { x: 0, y: 400 },
          { x: 0, y: 0 },
        ],
      }),
    ],
    zoom: 16,
    twoLabelMinLength: 640,
    measureWidth,
  });
  assert.equal(Math.round(up[0]?.placement.angle ?? 0), 90);
});

test("getLabelFontSize は 2 段だけ変える", () => {
  assert.equal(getLabelFontSize(14), 11);
  assert.equal(getLabelFontSize(15.5), 11);
  assert.equal(getLabelFontSize(16), 12);
});

const createSource = (
  overrides: Partial<LabelSource> & Pick<LabelSource, "points" | "name">,
): LabelSource => ({
  kind: "course",
  sourceIds: ["a"],
  primaryId: "a",
  status: "open",
  weight: 1,
  isSelected: false,
  isMuted: false,
  ...overrides,
});

test("getLabelDistances は基本 1 箇所、長い線だけ 1/4 と 3/4 に置く", () => {
  assert.deepEqual(
    getLabelDistances({ length: 400, labelWidth: 60, twoLabelMinLength: 640 }),
    [200],
  );
  assert.deepEqual(
    getLabelDistances({ length: 800, labelWidth: 60, twoLabelMinLength: 640 }),
    [200, 600],
  );
  // 幅の割に短い線は、2 つ出すと名前が並んで見えるので 1 つに留める
  assert.deepEqual(
    getLabelDistances({ length: 700, labelWidth: 200, twoLabelMinLength: 640 }),
    [350],
  );
});

test("collectLabelCandidates は長い線でも 2 箇所までに抑える", () => {
  const candidates = collectLabelCandidates({
    sources: [
      createSource({ name: "ダイナミック", points: horizontalPoints(1600) }),
    ],
    zoom: 16,
    twoLabelMinLength: 640,
    measureWidth,
  });

  assert.equal(candidates.length, 2);
  const xs = candidates
    .map(candidate => candidate.placement.x)
    .sort((a, b) => a - b);
  // 1/4 と 3/4 の近くに来る（片側に 2 つ寄らない）
  assert.ok(Math.abs((xs[0] ?? 0) - 400) < 120);
  assert.ok(Math.abs((xs[1] ?? 0) - 1200) < 120);
});

test("collectLabelCandidates は中くらいの線には中央 1 箇所だけ置く", () => {
  const candidates = collectLabelCandidates({
    sources: [
      createSource({ name: "ダイナミック", points: horizontalPoints(500) }),
    ],
    zoom: 16,
    twoLabelMinLength: 640,
    measureWidth,
  });

  assert.equal(candidates.length, 1);
  assert.ok(Math.abs((candidates[0]?.placement.x ?? 0) - 250) < 60);
});

test("collectLabelCandidates はラベルが載らない短い線を捨てる", () => {
  const candidates = collectLabelCandidates({
    sources: [
      createSource({ name: "ダイナミック", points: horizontalPoints(30) }),
    ],
    zoom: 16,
    twoLabelMinLength: 640,
    measureWidth,
  });

  assert.equal(candidates.length, 0);
});

test("placeLabelCandidates はスコアの高い方を残す", () => {
  const candidates = collectLabelCandidates({
    sources: [
      createSource({
        name: "クローズ",
        points: horizontalPoints(400, 0),
        primaryId: "closed",
        status: "closed",
      }),
      createSource({
        name: "営業中",
        points: horizontalPoints(400, 4),
        primaryId: "open",
        status: "open",
      }),
    ],
    zoom: 16,
    twoLabelMinLength: 640,
    measureWidth,
  });
  const placements = placeLabelCandidates(candidates, [], 4);

  // ほぼ重なった 2 本なので、残るのは営業中のほうだけ
  assert.ok(placements.length > 0);
  assert.deepEqual(
    [...new Set(placements.map(placement => placement.selectId))],
    ["open"],
  );
});

test("placeLabelCandidates は選択中のラベルを最優先で置く", () => {
  const candidates = collectLabelCandidates({
    sources: [
      createSource({
        name: "長いコース",
        points: horizontalPoints(2000, 0),
        primaryId: "long",
      }),
      createSource({
        name: "選択中",
        points: horizontalPoints(400, 4),
        primaryId: "selected",
        isSelected: true,
      }),
    ],
    zoom: 16,
    twoLabelMinLength: 640,
    measureWidth,
  });
  const placements = placeLabelCandidates(candidates, [], 4);

  assert.equal(placements[0]?.selectId, "selected");
});

test("collectDirectionMarks が進行方向を向いた矢羽を等間隔に置く", () => {
  const marks = collectDirectionMarks({
    id: "course:1",
    points: horizontalPoints(600),
    spacing: 120,
    markLength: 8,
    maxCount: 10,
    avoidRects: [],
    isSelected: false,
    scale: 1,
  });

  assert.ok(marks.length >= 4);
  for (const mark of marks) {
    assert.equal(Math.round(mark.angle), 0);
  }
});

test("collectDirectionMarks は短すぎる線には置かない", () => {
  assert.deepEqual(
    collectDirectionMarks({
      id: "course:1",
      points: horizontalPoints(20),
      spacing: 120,
      markLength: 8,
      maxCount: 10,
      avoidRects: [],
      isSelected: false,
      scale: 1,
    }),
    [],
  );
});

test("collectDirectionMarks はラベルの下に矢羽を置かない", () => {
  const options = {
    id: "course:1",
    points: horizontalPoints(600),
    spacing: 120,
    markLength: 8,
    maxCount: 10,
    isSelected: false,
    scale: 1,
  };
  const withoutLabel = collectDirectionMarks({ ...options, avoidRects: [] });
  const withLabel = collectDirectionMarks({
    ...options,
    avoidRects: [{ cx: 300, cy: 0, halfWidth: 300, halfHeight: 10, angle: 0 }],
  });

  assert.ok(withoutLabel.length > 0);
  assert.equal(withLabel.length, 0);
});

test("getDirectionMarkPath は切り欠きのある矢の形を返す", () => {
  const path = getDirectionMarkPath(8, 4);
  assert.equal(path.split("L").length - 1, 3);
  assert.ok(path.startsWith("M 4.00 0"));
  assert.ok(path.endsWith("Z"));
});
