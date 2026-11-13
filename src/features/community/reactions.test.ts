import assert from "node:assert/strict";
import { test } from "node:test";
import type { PostReaction } from "./contract";
import { reactionKindsFor } from "./contract";
import { applyReaction, formatMonthDay, latestExistence } from "./reactions";

const reaction = (
  kind: PostReaction["kind"],
  count = 0,
  mine = false,
  latestAt: string | null = null,
): PostReaction => ({ kind, count, mine, latestAt });
const now = new Date("2026-11-13T03:00:00.000Z");

test("コブ・パークだけ「まだあった／なかった」を付けられる", () => {
  assert.deepEqual(reactionKindsFor("COURSE"), ["LIKE", "HELPFUL"]);
  assert.deepEqual(reactionKindsFor("LIFT"), ["LIKE", "HELPFUL"]);
  assert.deepEqual(reactionKindsFor("MOGUL"), [
    "LIKE",
    "HELPFUL",
    "STILL_THERE",
    "GONE",
  ]);
  assert.deepEqual(reactionKindsFor("ITEM").slice(2), ["STILL_THERE", "GONE"]);
});

test("押すと件数と自分の状態が変わり、もう一度押すと戻る", () => {
  const before = [reaction("LIKE", 2), reaction("HELPFUL", 1)];
  const liked = applyReaction(before, "LIKE", true, now);
  assert.deepEqual(liked[0], {
    kind: "LIKE",
    count: 3,
    mine: true,
    latestAt: now.toISOString(),
  });
  assert.deepEqual(liked[1], before[1]);
  const undone = applyReaction(liked, "LIKE", false, now);
  assert.equal(undone[0].count, 2);
  assert.equal(undone[0].mine, false);
  // 同じ状態への指定では数えない
  assert.equal(applyReaction(liked, "LIKE", true, now)[0].count, 3);
  assert.equal(applyReaction(before, "LIKE", false, now)[0].count, 2);
});

test("「まだあった」と「なかった」は片方だけ残る", () => {
  const before = [
    reaction("LIKE", 1, true),
    reaction("STILL_THERE", 2, true, "2026-11-10T00:00:00.000Z"),
    reaction("GONE", 0),
  ];
  const after = applyReaction(before, "GONE", true, now);
  assert.deepEqual(
    after.map(item => [item.kind, item.count, item.mine]),
    [
      ["LIKE", 1, true],
      ["STILL_THERE", 1, false],
      ["GONE", 1, true],
    ],
  );
  // いいねを押しても確認は変わらない
  assert.deepEqual(
    applyReaction(after, "LIKE", false, now).slice(1),
    after.slice(1),
  );
});

test("いちばん新しい確認を選ぶ", () => {
  assert.equal(
    latestExistence([reaction("LIKE", 3, false, "2026-11-12")]),
    null,
  );
  assert.deepEqual(
    latestExistence([
      reaction("STILL_THERE", 2, false, "2026-11-10T00:00:00.000Z"),
      reaction("GONE", 1, false, "2026-11-12T00:00:00.000Z"),
    ]),
    { kind: "GONE", at: "2026-11-12T00:00:00.000Z" },
  );
  // 取り消されて0件になった種類は確認として扱わない
  assert.deepEqual(
    latestExistence([
      reaction("STILL_THERE", 1, false, "2026-11-10T00:00:00.000Z"),
      reaction("GONE", 0, false, "2026-11-12T00:00:00.000Z"),
    ]),
    { kind: "STILL_THERE", at: "2026-11-10T00:00:00.000Z" },
  );
});

test("確認日は日本時間の月日で出す", () => {
  assert.equal(formatMonthDay("2026-11-12T15:30:00.000Z"), "11/13");
  assert.equal(formatMonthDay("2026-11-12T14:59:00.000Z"), "11/12");
});
