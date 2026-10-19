import assert from "node:assert/strict";
import { test } from "node:test";
import { getTopControlOverlapHeight } from "./controlOverlap";

test("比較で縦に並んだ別の地図のボタンを、自分の地図の上余白に数えない", () => {
  const rect = (top: number, height: number) => ({
    top,
    bottom: top + height,
    left: 0,
    right: 400,
    height,
  });
  const controls = [rect(110, 32), rect(460, 32)];
  for (const top of [100, 450]) {
    assert.equal(getTopControlOverlapHeight(rect(top, 300), controls), 42);
  }
  assert.equal(getTopControlOverlapHeight(rect(800, 300), controls), 0);
});
