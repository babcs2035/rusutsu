import assert from "node:assert/strict";
import test from "node:test";
import { evaluateOperationCoverage } from "./operationCoverage";

const rows = [
  { id: "map-a", crawledNames: ["A"], mappingAssigned: true },
  { id: "map-b", crawledNames: ["B"], mappingAssigned: true },
];

test("aliases shared by multiple map geometries resolve once and count as covered", () => {
  const result = evaluateOperationCoverage(
    [
      { id: "map-a", crawledNames: ["A", "A alias"], mappingAssigned: true },
      { id: "map-b", crawledNames: ["A alias", "A"], mappingAssigned: true },
    ],
    [{ name: "A", status: "○" }],
  );
  assert.deepEqual(result.gaps, []);
  assert.deepEqual(
    result.resolved.map(row => row.resolution.status),
    ["○", "○"],
  );
});

test("unassigned and explicitly excluded map rows are reported separately, not as run gaps", () => {
  const result = evaluateOperationCoverage(
    [
      { id: "unassigned", crawledNames: [] },
      { id: "excluded", crawledNames: [], mappingAssigned: true },
    ],
    [],
  );
  assert.deepEqual(result.gaps, []);
  assert.equal(result.unassigned, 1);
  assert.equal(result.excluded, 1);
});

test("operating-only suppresses missing references for a nonempty valid listing", () => {
  const result = evaluateOperationCoverage(rows, [{ name: "A", status: "○" }], {
    listingMode: "operating-only",
    listingState: "listed",
  });
  assert.deepEqual(result.gaps, []);
});

test("explicit not-published operating-only listing suppresses missing references", () => {
  const result = evaluateOperationCoverage(rows, [], {
    listingMode: "operating-only",
    listingState: "not-published",
  });
  assert.deepEqual(result.gaps, []);
});

test("empty unproven operating-only listing leaves missing references as warnings", () => {
  const result = evaluateOperationCoverage(rows, [], {
    listingMode: "operating-only",
    listingState: "listed",
  });
  assert.deepEqual(
    result.gaps.map(gap => gap.reason),
    ["missing", "missing"],
  );
});

test("malformed nonempty payload is not a valid operating-only listing", () => {
  const result = evaluateOperationCoverage(rows, [null, { status: "○" }], {
    listingMode: "operating-only",
    listingState: "listed",
  });
  assert.deepEqual(
    result.gaps.map(gap => gap.reason),
    ["missing", "missing"],
  );
});

test("operating-only never hides missing, ambiguous, or invalid statuses", () => {
  const result = evaluateOperationCoverage(
    [
      { id: "missing-status", crawledNames: ["A"] },
      { id: "ambiguous", crawledNames: ["B"] },
      { id: "invalid", crawledNames: ["C"] },
    ],
    [
      { name: "A", status: null },
      { name: "B", status: "○" },
      { name: "B", status: "×" },
      { name: "C", status: "営業中" },
    ],
    { listingMode: "operating-only", listingState: "listed" },
  );
  assert.deepEqual(result.gaps.map(gap => gap.reason).sort(), [
    "ambiguous",
    "status-invalid",
    "status-missing",
  ]);
});

test("a failed listing cannot use row presence to waive missing references", () => {
  const result = evaluateOperationCoverage(rows, [{ name: "A", status: "○" }], {
    listingMode: "operating-only",
    listingState: "failed",
  });
  assert.deepEqual(
    result.gaps.map(gap => gap.reason),
    ["missing"],
  );
});
