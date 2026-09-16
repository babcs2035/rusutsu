import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileEditedRows } from "./editedRows";

test("詳細画面で改名しても手動の営業情報対応を保持する", () => {
  assert.deepEqual(
    reconcileEditedRows(
      [{ geojsonName: "コーチ", crawledName: "コーチ(2人乗りリフト)" }],
      [{ id: "lift-1", name: "コーチ" }],
      [{ id: "lift-1", name: "コーチリフト" }],
    ),
    [{ geojsonName: "コーチリフト", crawledName: "コーチ(2人乗りリフト)" }],
  );
});
test("削除・所属移動した線の対応を外し、新しい線を勝手に割り当てない", () => {
  assert.deepEqual(
    reconcileEditedRows(
      [
        { geojsonName: "A", crawledName: "公式A" },
        { geojsonName: "B", crawledName: "公式B" },
      ],
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      [
        { id: "b", name: "B" },
        { id: "c", name: "C" },
      ],
    ),
    [
      { geojsonName: null, crawledName: "公式A" },
      { geojsonName: "B", crawledName: "公式B" },
      { geojsonName: "C", crawledName: null },
    ],
  );
});
test("コースの線編集で追従済みの改名を二重に変更しない", () => {
  assert.deepEqual(
    reconcileEditedRows(
      [{ geojsonName: "新コース名", crawledName: "公式コース" }],
      [{ id: "course", name: "旧コース名" }],
      [{ id: "course", name: "新コース名" }],
    ),
    [{ geojsonName: "新コース名", crawledName: "公式コース" }],
  );
});

test("複数の空名のうち選んだ線だけにクローラ名を入れて対応を保持する", () => {
  assert.deepEqual(
    reconcileEditedRows(
      [{ geojsonName: "第1ペア", crawledName: "第1ペア" }],
      [
        { id: "one", name: "" },
        { id: "two", name: "" },
      ],
      [
        { id: "one", name: "第1ペア" },
        { id: "two", name: "" },
      ],
    ),
    [{ geojsonName: "第1ペア", crawledName: "第1ペア" }],
  );
});
