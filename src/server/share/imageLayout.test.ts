import assert from "node:assert/strict";
import { test } from "node:test";
import { shareImageOverlay, shareImageSlots } from "./imageLayout";

test("one through four map slots stay inside image and clear title and footer", () => {
  const image = { width: 1200, height: 630 };
  for (let count = 1; count <= 4; count++) {
    const slots = shareImageSlots(count);
    assert.equal(slots.length, count);
    for (const slot of slots) {
      assert.ok(slot.left >= 0 && slot.top >= 100);
      assert.ok(slot.left + slot.width <= image.width);
      assert.ok(
        slot.top + slot.height <= 558,
        `slot footer clearance for count ${count}`,
      );
    }
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i];
        const b = slots[j];
        assert.ok(
          a.left + a.width <= b.left ||
            b.left + b.width <= a.left ||
            a.top + a.height <= b.top ||
            b.top + b.height <= a.top,
        );
      }
    }
  }
});

test("overlay escapes Japanese resort names and renders expected heading and footer", () => {
  const svg = shareImageOverlay([`雪 & <山>`], 1, false, false).toString();
  assert.match(svg, /ゲレンデマップ/);
  assert.match(svg, /雪 &amp; &lt;山&gt;/);
  assert.match(svg, /国土地理院/);
  assert.doesNotMatch(svg, /雪 & <山>/);
});

test("two maps stack vertically and three maps have a full-width bottom row", () => {
  const pair = shareImageSlots(2);
  assert.equal(pair[0].left, pair[1].left);
  assert.equal(pair[0].width, 1160);
  assert.equal(pair[1].width, pair[0].width);
  assert.ok(pair[1].top > pair[0].top + pair[0].height);

  const triple = shareImageSlots(3);
  assert.equal(triple[0].top, triple[1].top);
  assert.ok(triple[1].left > triple[0].left + triple[0].width);
  assert.equal(triple[2].left, triple[0].left);
  assert.equal(triple[2].width, 1160);
  assert.ok(triple[2].top > triple[0].top + triple[0].height);
});
