import assert from "node:assert/strict";
import { test } from "node:test";
import { reorderItemsByNameOrder } from "./courseOrder";

test("JSONで指定した名前順に並べ、未対応項目は元の順序で末尾へ残す", () => {
  const items = [
    { name: "[S4, S5] ブロンコ" },
    { name: "[C3] エンターテイメント" },
    { name: "[C1] メロディ" },
    { name: "未対応A" },
    { name: "[C2] エーデルワイス" },
    { name: "未対応B" },
  ];

  assert.deepEqual(
    reorderItemsByNameOrder(
      items,
      [
        "[C1] メロディ",
        "[C3] エンターテイメント",
        "[C2] エーデルワイス",
        "[S4, S5] ブロンコ",
      ],
      item => item.name,
    ),
    [
      { name: "[C1] メロディ" },
      { name: "[C3] エンターテイメント" },
      { name: "[C2] エーデルワイス" },
      { name: "[S4, S5] ブロンコ" },
      { name: "未対応A" },
      { name: "未対応B" },
    ],
  );
});
