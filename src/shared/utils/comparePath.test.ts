import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCompareUrlCodec,
  encodeCompareCodes,
  encodeUrlCode,
  parseCompareIds,
} from "./comparePath";

const resorts = [
  { id: "rusutsu", urlCode: 1 },
  { id: "niseko", urlCode: 36 },
  { id: "kiroro", urlCode: 1295 },
];
const codec = createCompareUrlCodec(resorts);

test("番号は2桁の36進数で、範囲外は作らない", () => {
  assert.equal(encodeUrlCode(1), "01");
  assert.equal(encodeUrlCode(36), "10");
  assert.equal(encodeUrlCode(1295), "zz");
  assert.equal(encodeUrlCode(0), null);
  assert.equal(encodeUrlCode(1296), null);
  assert.equal(encodeUrlCode(1.5), null);
});

test("比較URLは番号を区切りなしで連結し、他のクエリを残す", () => {
  const url = codec.write(
    new URL("https://example.com/rusutsu?tab=weather&c=zz"),
    ["niseko", "rusutsu", "niseko", "unknown"],
  );
  assert.equal(url.searchParams.get("tab"), "weather");
  assert.equal(url.searchParams.get("c"), "1001");
  assert.equal(
    codec
      .write(new URL("https://example.com/rusutsu?c=01"), [])
      .searchParams.has("c"),
    false,
  );
  assert.equal(encodeCompareCodes([...resorts, resorts[0]]), "0110zz");
});

test("比較URLを順番どおり重複なしで読み、未知の番号は捨てる", () => {
  assert.deepEqual(
    codec.read(new URL("https://example.com/rusutsu?c=10011099ZZ")),
    ["niseko", "rusutsu", "kiroro"],
  );
});

test("c が無いことと、不正・未知だけの c を区別する", () => {
  assert.equal(codec.read(new URL("https://example.com/rusutsu")), null);
  assert.deepEqual(codec.read(new URL("https://example.com/rusutsu?c=")), []);
  assert.deepEqual(
    codec.read(new URL("https://example.com/rusutsu?c=011")),
    [],
  );
  assert.deepEqual(codec.read(new URL("https://example.com/rusutsu?c=0-")), []);
  assert.deepEqual(codec.read(new URL("https://example.com/rusutsu?c=99")), []);
});

test("共有画像用のIDリストは検証・重複排除して順番を保つ", () => {
  const known = new Set(["rusutsu", "niseko", "kiroro"]);
  assert.deepEqual(
    parseCompareIds("niseko,rusutsu,niseko,unknown,INVALID", known),
    ["niseko", "rusutsu"],
  );
  assert.deepEqual(parseCompareIds(null, known), []);
  assert.deepEqual(parseCompareIds("x".repeat(402_001), known), []);
});
