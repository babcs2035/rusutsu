import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCompareIds, writeCompareIds } from "./comparePath";

const known = new Set(["rusutsu", "niseko", "kiroro"]);

test("compare URL IDs are validated, deduplicated, and kept in order", () => {
  assert.deepEqual(
    parseCompareIds("niseko,rusutsu,niseko,unknown,INVALID", known),
    ["niseko", "rusutsu"],
  );
});

test("missing compare is distinct from malformed or unknown-only compare", () => {
  assert.deepEqual(parseCompareIds(null, known), []);
  assert.deepEqual(parseCompareIds("", known), []);
  assert.deepEqual(parseCompareIds("unknown,INVALID", known), []);
  assert.deepEqual(parseCompareIds("x".repeat(402_001), known), []);
});

test("compare URL writing preserves other query values and bounds the list", () => {
  const url = writeCompareIds(
    new URL("https://example.com/rusutsu?tab=weather&compare=old"),
    ["niseko", "rusutsu", "niseko"],
  );
  assert.equal(url.searchParams.get("tab"), "weather");
  assert.equal(url.searchParams.get("compare"), "niseko,rusutsu");
  assert.equal(
    writeCompareIds(
      new URL("https://example.com/rusutsu"),
      [],
    ).searchParams.has("compare"),
    false,
  );
});
