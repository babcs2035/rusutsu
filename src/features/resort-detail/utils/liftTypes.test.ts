import assert from "node:assert/strict";
import test from "node:test";
import { getLiftTypeLabel, groupByLiftType } from "./liftTypes";

test("索道は乗り物の種類で分け、チェアリフトだけ速度で分ける", () => {
  assert.equal(
    getLiftTypeLabel({ type: "ゴンドラ", speed: "高速" }),
    "ゴンドラ",
  );
  assert.equal(getLiftTypeLabel({ type: "gondola" }), "ゴンドラ");
  assert.equal(getLiftTypeLabel({ type: "cable_car" }), "ロープウェイ");
  assert.equal(getLiftTypeLabel({ type: "ケーブルカー" }), "ケーブルカー");
  assert.equal(
    getLiftTypeLabel({ type: "リフト", speed: "高速" }),
    "高速リフト",
  );
  assert.equal(
    getLiftTypeLabel({ type: "chair_lift", speed: "低速" }),
    "低速リフト",
  );
  assert.equal(getLiftTypeLabel({ type: "chair_lift" }), "リフト");
  assert.equal(getLiftTypeLabel({ type: "magic_carpet" }), "動く歩道");
  assert.equal(getLiftTypeLabel({ type: "rope_tow" }), "ロープトウ・Tバー");
  assert.equal(getLiftTypeLabel({ type: null, name: "第1ペア" }), "リフト");
  assert.equal(getLiftTypeLabel({ type: "yes" }), "その他");
});

test("該当のない種別は行を作らず、表示順にそろえる", () => {
  const rows = [
    { type: "リフト", speed: "低速" },
    { type: "ゴンドラ", speed: null },
    { type: "リフト", speed: "低速" },
  ];
  assert.deepEqual(
    groupByLiftType(rows, getLiftTypeLabel).map(group => [
      group.label,
      group.rows.length,
    ]),
    [
      ["ゴンドラ", 1],
      ["低速リフト", 2],
    ],
  );
});
