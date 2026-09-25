import assert from "node:assert/strict";
import test from "node:test";
import { reconcileEditedRows } from "./editedRows";
import {
  applyGeometryAssignments,
  geometryAssignmentsFromRows,
} from "./geometryAssignments";

test("editing curated rows retains unrelated OSM fixed IDs", () => {
  const rows = [
    { geometryId: "osm", geojsonName: "X", crawledName: "osm-source" },
    { geometryId: "curated", geojsonName: "X", crawledName: null },
  ];
  const result = reconcileEditedRows(
    rows,
    [{ id: "curated", name: "X" }],
    [{ id: "curated", name: "Y" }],
  );
  assert.deepEqual(result[0], rows[0]);
  assert.equal(result[1].geojsonName, "Y");
});
test("identical names retain different crawler assignments after rename and reorder", () => {
  const geometries = [
    { id: "a", name: "X" },
    { id: "b", name: "X" },
  ];
  const rows = applyGeometryAssignments(
    [],
    geometries,
    { a: "upper", b: null },
    true,
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(geometryAssignmentsFromRows(rows, geometries), {
    a: "upper",
    b: null,
  });
  const next = [
    { id: "b", name: "X" },
    { id: "a", name: "new" },
  ];
  const renamed = reconcileEditedRows(rows, geometries, next);
  assert.deepEqual(geometryAssignmentsFromRows(renamed, next), {
    a: "upper",
    b: null,
  });
});
