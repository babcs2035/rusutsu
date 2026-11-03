import assert from "node:assert/strict";
import test from "node:test";
import {
  createOperationStatusResolver,
  operationStatusSymbol,
} from "./operationStatusResolver";

test("accepted operation symbols normalize and malformed values stay unknown", () => {
  for (const value of ["○", "〇", "◯"]) {
    assert.equal(operationStatusSymbol(value), "○");
  }
  assert.equal(operationStatusSymbol(" △ "), "△");
  for (const value of ["×", "✕", "✖"]) {
    assert.equal(operationStatusSymbol(value), "×");
  }
  for (const value of [null, undefined, 1, "", "-", "営業", "休止", "○△"]) {
    assert.equal(operationStatusSymbol(value), null);
  }
});

test("a single crawler row referenced by duplicate normalized aliases resolves once", () => {
  const resolve = createOperationStatusResolver([
    { name: "第1リフト 下部", status: "○" },
  ]);
  const result = resolve([
    "第1リフト 下部",
    "第1リフト下部",
    " 第1リフト 下部 ",
  ]);
  assert.equal(result.reason, "matched");
  assert.equal(result.status, "○");
  assert.equal(result.references.length, 1);
});

test("multiple rows with a normalized name conflict are ambiguous", () => {
  const resolve = createOperationStatusResolver([
    { name: "第1リフト 下部", status: "○" },
    { name: "第1リフト下部", status: "×" },
  ]);
  const result = resolve(["第1リフト 下部"]);
  assert.equal(result.reason, "ambiguous");
  assert.equal(result.status, null);
});

test("distinct aliases resolve by OR when they identify one crawler row", () => {
  const resolve = createOperationStatusResolver([
    { name: "第1リフト", status: "△" },
  ]);
  const result = resolve(["旧名称", "第1リフト"]);
  // A stale alias does not prevent another alias from resolving the row.
  assert.equal(result.reason, "matched");
  assert.equal(result.status, "△");
});

test("missing and invalid statuses never become a closed status", () => {
  for (const [status, reason] of [
    [null, "status-missing"],
    ["", "status-missing"],
    ["営業中", "status-invalid"],
    ["休止", "status-invalid"],
  ] as const) {
    const result = createOperationStatusResolver([
      { name: "第1リフト", status },
    ])(["第1リフト"]);
    assert.equal(result.reason, reason);
    assert.equal(result.status, null);
  }
});
