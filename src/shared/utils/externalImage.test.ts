import assert from "node:assert/strict";
import { test } from "node:test";
import { getExternalImageUrl } from "./externalImage";

test("http(s) の絶対 URL はそのまま通す", () => {
  assert.equal(
    getExternalImageUrl("https://www.dynaland.co.jp/assets/img/a.jpg"),
    "https://www.dynaland.co.jp/assets/img/a.jpg",
  );
  assert.equal(
    getExternalImageUrl("http://example.com/a.jpg"),
    "http://example.com/a.jpg",
  );
});

test("前後の空白は落とす", () => {
  assert.equal(
    getExternalImageUrl("  https://example.com/a.jpg \n"),
    "https://example.com/a.jpg",
  );
});

test("空・未設定・相対パス・不正な値は null", () => {
  assert.equal(getExternalImageUrl(""), null);
  assert.equal(getExternalImageUrl("   "), null);
  assert.equal(getExternalImageUrl(null), null);
  assert.equal(getExternalImageUrl(undefined), null);
  assert.equal(getExternalImageUrl("assets/img/a.jpg"), null);
  // プロトコル相対 URL は next/image が受け付けない
  assert.equal(getExternalImageUrl("//example.com/a.jpg"), null);
});

test("http(s) 以外のスキームは通さない", () => {
  assert.equal(getExternalImageUrl("javascript:alert(1)"), null);
  assert.equal(getExternalImageUrl("data:image/png;base64,AAAA"), null);
});
