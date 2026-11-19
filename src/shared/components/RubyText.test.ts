import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowRuby } from "./RubyText";

test("shows ruby only over segments containing kana or kanji", () => {
  assert.equal(shouldShowRuby({ text: "湯沢", ruby: "ゆざわ" }), true);
  assert.equal(shouldShowRuby({ text: "第2", ruby: "だいに" }), true);
  assert.equal(shouldShowRuby({ text: "GALA", ruby: "がーら" }), false);
  assert.equal(shouldShowRuby({ text: "2000", ruby: "にせん" }), false);
  assert.equal(shouldShowRuby({ text: "１", ruby: "いち" }), false);
  assert.equal(shouldShowRuby({ text: "Mt.", ruby: "まうんと" }), false);
  assert.equal(shouldShowRuby({ text: "スキー" }), false);
});
