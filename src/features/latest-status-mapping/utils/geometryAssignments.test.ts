import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileEditedRows } from "./editedRows";
import {
  applyGeometryAssignments,
  duplicateGeometryNames,
  geometryAssignmentsFromRows,
} from "./geometryAssignments";

for (const kind of ["リフト", "コース"]) {
  test(`${kind}: 同名の上段を選択・改名しても下段の対応は変わらない`, () => {
    const geometries = [
      { id: "upper", name: "高丸トリプル" },
      { id: "lower", name: "高丸トリプル" },
    ];
    const rows = [
      { geojsonName: "高丸トリプル", crawledName: "高丸トリプル" },
      { geojsonName: null, crawledName: "みはらしペア" },
    ];
    const assignments = geometryAssignmentsFromRows(rows, geometries);
    assignments.upper = "みはらしペア";
    assert.equal(assignments.lower, "高丸トリプル");
    assert.deepEqual(duplicateGeometryNames(geometries), ["高丸トリプル"]);
    assert.deepEqual(
      applyGeometryAssignments(rows, geometries, assignments),
      rows,
    );

    const renamed = geometries.map(item =>
      item.id === "upper" ? { ...item, name: assignments.upper ?? "" } : item,
    );
    const result = applyGeometryAssignments(
      reconcileEditedRows(rows, geometries, renamed),
      renamed,
      assignments,
    );
    assert.deepEqual(duplicateGeometryNames(renamed), []);
    assert.equal(renamed[1].name, "高丸トリプル");
    assert.equal(
      result.find(row => row.geojsonName === "高丸トリプル")?.crawledName,
      "高丸トリプル",
    );
    assert.equal(
      result.find(row => row.geojsonName === "みはらしペア")?.crawledName,
      "みはらしペア",
    );
    assert.deepEqual(
      applyGeometryAssignments(result, renamed, assignments),
      result,
    );
  });
}

test("同名の下段を削除・改名しても上段の対応を外さない", () => {
  const rows = [{ geojsonName: "同名", crawledName: "公式" }];
  const before = [
    { id: "one", name: "同名" },
    { id: "two", name: "同名" },
  ];
  const after = [
    { id: "one", name: "同名" },
    { id: "two", name: "別名" },
  ];
  assert.equal(reconcileEditedRows(rows, before, after)[0].geojsonName, "同名");
  assert.equal(
    reconcileEditedRows(rows, before, after.slice(0, 1))[0].geojsonName,
    "同名",
  );
});

test("並べ替え・一時的な同名化を経てもIDごとの手動対応を保持する", () => {
  const before = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ];
  const rows = [
    { geojsonName: "A", crawledName: "公式A" },
    { geojsonName: "B", crawledName: "公式B" },
  ];
  const assignments = geometryAssignmentsFromRows(rows, before);
  const duplicate = [
    { id: "b", name: "A" },
    { id: "a", name: "A" },
  ];
  const intermediate = reconcileEditedRows(rows, before, duplicate);
  const after = [
    { id: "b", name: "C" },
    { id: "a", name: "A" },
  ];
  const result = applyGeometryAssignments(
    reconcileEditedRows(intermediate, duplicate, after),
    after,
    assignments,
  );
  assert.equal(
    result.find(row => row.geojsonName === "C")?.crawledName,
    "公式B",
  );
  assert.equal(
    result.find(row => row.geojsonName === "A")?.crawledName,
    "公式A",
  );
});
