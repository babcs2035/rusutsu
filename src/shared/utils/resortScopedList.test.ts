import assert from "node:assert/strict";
import { test } from "node:test";
import { updateResortScopedList } from "./resortScopedList";

const items = [
  { id: "a", skiId: "own" },
  { id: "x", skiId: "other" },
  { id: "b", skiId: "own" },
  { id: "y", skiId: "other" },
];
const ids = (list: Array<{ id: string }>) => list.map(item => item.id);

test("所属要素だけを updater に渡し、別スキー場の要素は位置を保つ", () => {
  let received: string[] = [];
  const result = updateResortScopedList(items, "own", scoped => {
    received = ids(scoped);
    return scoped.map(item => ({ ...item, id: `${item.id}2` }));
  });
  assert.deepEqual(received, ["a", "b"]);
  assert.deepEqual(ids(result), ["a2", "x", "b2", "y"]);
});

test("増えた要素は最後の所属要素の直後、減った分は詰める", () => {
  const added = updateResortScopedList(items, "own", scoped => [
    ...scoped,
    { id: "c", skiId: "own" },
  ]);
  assert.deepEqual(ids(added), ["a", "x", "b", "c", "y"]);

  const removed = updateResortScopedList(items, "own", scoped =>
    scoped.filter(item => item.id !== "a"),
  );
  assert.deepEqual(ids(removed), ["b", "x", "y"]);
});

test("所属要素が無くても追加でき、変更が無ければ同じ配列を返す", () => {
  const others = items.filter(item => item.skiId === "other");
  assert.deepEqual(
    ids(
      updateResortScopedList(others, "own", () => [{ id: "c", skiId: "own" }]),
    ),
    ["c", "x", "y"],
  );
  assert.equal(
    updateResortScopedList(items, "own", scoped => scoped),
    items,
  );
});
