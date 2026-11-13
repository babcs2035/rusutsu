import assert from "node:assert/strict";
import test from "node:test";
import { correctionItemSchema } from "@/server/corrections/contract";
import {
  buildCorrection,
  type CorrectionFeature,
  correctionAvailability,
  editCount,
  linesFromFeatures,
  setEdit,
} from "./model";

const course: CorrectionFeature = {
  id: "course-a",
  kind: "slope",
  name: "ファミリーコース",
  coordinates: [
    [140, 42],
    [140.01, 42.01],
  ],
  properties: { name: "ファミリーコース", level: "初級", piste: "○" },
};
const segmented: CorrectionFeature = {
  id: "course-b",
  kind: "slope",
  name: "ダイナミック",
  coordinates: [
    [140, 42],
    [140.02, 42.02],
  ],
  properties: {
    name: "ダイナミック",
    piste: "△",
    pisteSegments: [{ from: 0, to: 0.5, value: "○" }],
  },
};
const lift: CorrectionFeature = {
  id: "lift-a",
  kind: "lift",
  name: "第1リフト",
  coordinates: [
    [140, 42],
    [140.005, 42.005],
  ],
  properties: { name: "第1リフト", towers: "12" },
};
const features = [course, segmented, lift];

test("an edit that returns to the registered value is dropped", () => {
  const changed = setEdit({}, course, "level", "中級");
  assert.deepEqual(changed, { "course-a": { level: "中級" } });
  assert.deepEqual(setEdit(changed, course, "level", "初級"), {});
  // 名前を空にしただけでは送信しない（打ち直しの途中）
  const blank = setEdit({}, course, "name", "  ");
  assert.deepEqual(blank, { "course-a": { name: null } });
  assert.equal(editCount(blank, "course-a"), 0);
  assert.deepEqual(
    buildCorrection({
      features: [course],
      lines: linesFromFeatures([course]),
      edits: blank,
      otherText: "",
    }).items,
    [],
  );
  // 数値は文字で登録されていても同じ値なら修正にしない
  assert.deepEqual(setEdit({}, lift, "towers", "12"), {});
  assert.deepEqual(setEdit({}, lift, "towers", "14"), {
    "lift-a": { towers: 14 },
  });
});

test("submitted items pass the server contract and clear section ranges", () => {
  const lines = linesFromFeatures(features).map(line =>
    line.id === "lift-a"
      ? {
          ...line,
          coordinates: [...line.coordinates, [140.006, 42.006]] as [
            number,
            number,
          ][],
        }
      : line.id === "course-a"
        ? { ...line, deleted: true }
        : line,
  );
  lines.push({
    id: "new-1",
    kind: "slope",
    name: "",
    coordinates: [
      [141, 43],
      [141.01, 43.01],
    ],
    isNew: true,
  });
  let edits = setEdit({}, segmented, "piste", "△");
  edits = setEdit(edits, lift, "hood", "○");
  const { items, summary } = buildCorrection({
    features,
    lines,
    edits,
    otherText: " レストハウスが閉店 ",
  });
  for (const item of items)
    assert.equal(
      correctionItemSchema.safeParse(item).success,
      true,
      JSON.stringify(item),
    );
  assert.deepEqual(
    items.map(item => [item.targetId, item.field, item.action]),
    [
      ["course-a", "coordinates", "delete"],
      ["lift-a", "coordinates", "change"],
      ["new-1", "coordinates", "add"],
      ["course-b", "piste", undefined],
      ["course-b", "pisteSegments", undefined],
      ["lift-a", "hood", undefined],
      [undefined, "other-report", undefined],
    ],
  );
  assert.deepEqual(
    summary.map(row => `${row.target}｜${row.text}`),
    [
      "ファミリーコース｜コースの削除",
      "第1リフト｜位置を変更",
      "名称未設定のコース｜新しいコースを追加",
      "ダイナミック｜圧雪: 区間別 → 日によって圧雪",
      "第1リフト｜フード: 不明 → あり",
      "その他｜レストハウスが閉店",
    ],
  );
});

test("a new line needs two points and unchanged lines send nothing", () => {
  const lines = [
    ...linesFromFeatures(features),
    {
      id: "new-2",
      kind: "lift" as const,
      name: "新設",
      coordinates: [[141, 43]] as [number, number][],
      isNew: true,
    },
  ];
  assert.deepEqual(
    buildCorrection({ features, lines, edits: {}, otherText: "" }).items,
    [],
  );
});

test("menu wording follows what is already registered", () => {
  assert.deepEqual(correctionAvailability(features), {
    slopeCount: 2,
    liftCount: 1,
    slopeDetails: true,
    liftDetails: true,
    piste: true,
    morning: false,
    night: false,
  });
  assert.deepEqual(correctionAvailability([]), {
    slopeCount: 0,
    liftCount: 0,
    slopeDetails: false,
    liftDetails: false,
    piste: false,
    morning: false,
    night: false,
  });
});
