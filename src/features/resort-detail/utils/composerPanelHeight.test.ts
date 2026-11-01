import assert from "node:assert/strict";
import test from "node:test";
import { snapComposerPanelHeight } from "./composerPanelHeight";

test("composer height snaps to the closest of three stops", () => {
  for (const [input, expected] of [
    [-20, 30],
    [30, 30],
    [39.9, 30],
    [40, 50],
    [50, 50],
    [59.9, 50],
    [60, 70],
    [70, 70],
    [100, 70],
    [NaN, 70],
  ])
    assert.equal(snapComposerPanelHeight(input), expected);
});
