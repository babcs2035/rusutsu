import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createEmptyCourse,
  splitCourseAtVertex,
} from "@/features/slope/utils/courseOps";
import type { LatestStatusMappingRow } from "../types";
import { reconcileEditedRows } from "./editedRows";
import {
  applyGeometryAssignments,
  duplicateGeometryNames,
  geometryAssignmentsFromRows,
  splitGeometryAssignments,
} from "./geometryAssignments";
import { reconcileSavedRows } from "./rows";

for (const selected of ["手動で選んだ公式コース", null]) {
  test(`分割・再分割後の全区間と保存用対応表に選択を引き継ぐ: ${selected}`, () => {
    let courses = [
      {
        ...createEmptyCourse(),
        id: "original",
        name: "地図の名前",
        coordinates: [
          [140, 43],
          [140.001, 43],
          [140.002, 43],
          [140.003, 43],
        ] as [number, number][],
      },
    ];
    let rows: LatestStatusMappingRow[] = [
      { geojsonName: "地図の名前", crawledName: "以前の公式名" },
    ];
    let assignments = { original: selected } as Record<string, string | null>;
    for (let index = 0; index < 2; index += 1) {
      const source = courses[courses.length - 1];
      const next = splitCourseAtVertex(courses, source.id, 1);
      assignments = {
        ...assignments,
        ...splitGeometryAssignments(
          source,
          courses,
          next,
          new Map(Object.entries(assignments)),
          new Map([[source.name, "以前の公式名"]]),
        ),
      };
      const reconciled = applyGeometryAssignments(
        reconcileEditedRows(rows, courses, next),
        next,
        assignments,
        true,
      );
      for (const course of next) {
        assert.equal(assignments[course.id], selected);
        assert.equal(
          reconciled.find(row => row.geometryId === course.id)?.crawledName,
          selected,
        );
      }
      // 保存後の読み直しでも、一対多の対応と明示的な未対応を維持する。
      const reloaded = reconcileSavedRows(
        "courses",
        reconciled,
        ["以前の公式名", "手動で選んだ公式コース"],
        next.map(course => course.name),
      );
      assert.deepEqual(
        geometryAssignmentsFromRows(reloaded, next),
        assignments,
      );
      courses = next;
      rows = reconciled;
    }
    assert.equal(courses.length, 3);
  });
}

test("分割元にID対応がなければ名前の対応を引き継ぎ、分割できなければ変更しない", () => {
  const source = { id: "a", name: " A " };
  const byName = new Map([["A", "公式A"]]);
  assert.deepEqual(
    splitGeometryAssignments(
      source,
      [source],
      [source, { id: "b", name: "下部" }],
      new Map(),
      byName,
    ),
    { b: "公式A" },
  );
  assert.deepEqual(
    splitGeometryAssignments(source, [source], [source], new Map(), byName),
    {},
  );
});

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
