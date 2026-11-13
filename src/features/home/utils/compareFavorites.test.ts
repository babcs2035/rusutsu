import assert from "node:assert/strict";
import { test } from "node:test";
import { idsAfterFavoriteCompareTabChange } from "./compareFavorites";

test("favorite comparison retains removed resorts until tab change, then prunes", () => {
  const ids = ["a", "b", "c"];
  // Toggling a heart does not call the sync helper; the current comparison IDs stay intact.
  assert.deepEqual(ids, ["a", "b", "c"]);
  assert.deepEqual(
    idsAfterFavoriteCompareTabChange({ kind: "favorites" }, ids, ["a", "c"]),
    ["a", "c"],
  );
});

test("selection and saved-list comparisons keep their explicit resort IDs", () => {
  const ids = ["a", "b"];
  assert.equal(
    idsAfterFavoriteCompareTabChange({ kind: "selection" }, ids, ["a"]),
    ids,
  );
  assert.equal(
    idsAfterFavoriteCompareTabChange(
      { kind: "list", id: "list-1", name: "週末" },
      ids,
      ["a"],
    ),
    ids,
  );
});
