import assert from "node:assert/strict";
import { test } from "node:test";
import { FAVORITES_KEY, parseLocalFavorites, setFavorite } from "./storage";

test("first use has no selected method; browser choice persists without a time limit", () => {
  assert.deepEqual(parseLocalFavorites(null), {
    version: 1,
    method: null,
    ids: [],
  });
  const saved = parseLocalFavorites(
    JSON.stringify({ version: 1, method: "browser", ids: ["a", "b", "a"] }),
  );
  assert.deepEqual(saved, { version: 1, method: "browser", ids: ["a", "b"] });
  assert.ok(!FAVORITES_KEY.startsWith("rusutsu:home:"));
  assert.deepEqual(parseLocalFavorites("invalid"), parseLocalFavorites(null));
});
test("favorites deduplicate additions and removal leaves independent compare state untouched", () => {
  const comparison = ["a", "b"];
  assert.deepEqual(setFavorite(["a"], "a", true), ["a"]);
  assert.deepEqual(setFavorite(comparison, "a", false), ["b"]);
  assert.deepEqual(comparison, ["a", "b"]);
});
