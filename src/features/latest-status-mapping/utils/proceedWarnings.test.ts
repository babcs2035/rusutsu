import assert from "node:assert/strict";
import test from "node:test";
import { mappingProceedWarnings } from "./proceedWarnings";
import { hasMappingNameOverlap } from "./rows";

test("名前の表記揺れ・分割名は許容し、共通語しか重ならない名前は警告する", () => {
  for (const [left, right] of [
    ["Ａコース_2", "aコース"],
    ["白樺コース", "白樺ゲレンデ"],
    ["第１リフト", "第1リフト"],
    ["コース", "コース"],
  ]) {
    assert.equal(hasMappingNameOverlap(left, right), true);
  }
  assert.equal(hasMappingNameOverlap("白樺コース", "パノラマコース"), false);
  assert.equal(hasMappingNameOverlap("中央リフト", "山頂リフト"), false);
});

test("IDの未対応指定を名前の対応より優先し、不一致と未対応を列挙する", () => {
  const warnings = mappingProceedWarnings(
    [
      { id: "1", name: "白樺コース" },
      { id: "2", name: "中央リフト" },
      { id: "3", name: " Aコース " },
      { id: "4", name: "" },
    ],
    {
      crawledNameByGeometryId: new Map([
        ["1", null],
        ["2", "山頂リフト"],
      ]),
      crawledNameByGeojsonName: new Map([
        ["白樺コース", "白樺コース"],
        ["Aコース", "Ａコース"],
      ]),
    },
  );
  assert.deepEqual(warnings, [
    "白樺コース：クローラーの対応がありません。",
    "中央リフト → 山頂リフト：名前に共通部分がありません。",
    "4 番目（名前なし）：クローラーの対応がありません。",
  ]);
});

test("クローラー取得結果がない場合はすべて未対応になる", () => {
  assert.equal(
    mappingProceedWarnings([{ id: "1", name: "白樺" }], {
      crawledNameByGeometryId: new Map(),
      crawledNameByGeojsonName: new Map(),
    }).length,
    1,
  );
});
