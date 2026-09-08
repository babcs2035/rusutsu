import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmptyLift } from "./liftOps";
import { reorderLiftsByCrawlerOrder, reorderVisibleLifts } from "./liftOrder";

const lift = (id: string, name = id) => ({
  ...createEmptyLift("resort"),
  id,
  name,
});

test("取得順への変更は表示中だけを対象とし、未対応・同名リフトも保持する", () => {
  const items = [
    lift("unmatched"),
    { ...lift("deleted", "A"), isDeleted: true },
    lift("b", "B"),
    { ...lift("other", "A"), skiId: "other-resort" },
    lift("a1", "A"),
    lift("unnamed", ""),
    lift("a2", " A "),
  ];
  const snapshot = structuredClone(items);
  const result = reorderLiftsByCrawlerOrder(
    items,
    ["unmatched", "b", "a1", "unnamed", "a2"],
    ["A", "B"],
  );
  assert.deepEqual(
    result.map(item => item.id),
    ["a1", "deleted", "a2", "other", "b", "unmatched", "unnamed"],
  );
  assert.equal(result[1], items[1]);
  assert.equal(result[3], items[3]);
  assert.deepEqual(items, snapshot);
});

test("手動で並べ替えても非表示リフトの位置を保持し、古いIDは無視する", () => {
  const items = [lift("a"), lift("hidden"), lift("b")];
  assert.deepEqual(reorderVisibleLifts(items, ["b", "missing", "a"]), [
    items[2],
    items[1],
    items[0],
  ]);
});
