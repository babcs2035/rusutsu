import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveComposerPanelHeight,
  snapComposerPanelHeight,
} from "./composerPanelHeight";

test("composer height snaps to the two stable positions", () => {
  for (const [input, expected] of [
    [-20, 40],
    [40, 40],
    [54.9, 40],
    [55, 70],
    [70, 70],
    [100, 70],
    [NaN, 70],
  ])
    assert.equal(snapComposerPanelHeight(input), expected);
});

test("a quick upward or downward release can select the next position", () => {
  assert.equal(resolveComposerPanelHeight(45, 0.8, 800), 70);
  assert.equal(resolveComposerPanelHeight(65, -0.8, 800), 40);
  assert.equal(resolveComposerPanelHeight(45, 0, 800), 40);
  assert.equal(resolveComposerPanelHeight(65, 0, 800), 70);
});
