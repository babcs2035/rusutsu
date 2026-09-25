import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_RESORT_LINKS } from "@/features/lift/constants";
import { liftDraftContentKey } from "@/features/lift/utils/draftContent";
import { createEmptyLift } from "@/features/lift/utils/liftOps";
import { createEmptyCourse } from "@/features/slope/utils/courseOps";
import { slopeDraftContentKey } from "@/features/slope/utils/draftContent";
import { hasLinkDraftChanges } from "./editorDraft";

test("コースは画面用IDを無視し、属性・位置・追加・削除・順序の変更と取り消しを判定する", () => {
  const course = { ...createEmptyCourse(), name: "A", skiId: "test" };
  const key = (courses: (typeof course)[]) =>
    slopeDraftContentKey(courses, [], []);
  const baseline = key([course]);
  assert.equal(
    key([{ ...course, id: "別の画面ID", splitGroupId: "UI" }]),
    baseline,
  );
  for (const changed of [
    { ...course, name: "B" },
    { ...course, skiId: "other" },
    { ...course, coordinates: [[139, 35] as [number, number]] },
    { ...course, detail: { ...course.detail, distance: "入力途中" } },
  ]) {
    assert.notEqual(key([changed]), baseline);
    assert.equal(key([structuredClone(course)]), baseline);
  }
  const another = { ...course, name: "B" };
  assert.notEqual(key([]), baseline);
  assert.notEqual(key([course, another]), baseline);
  assert.notEqual(key([course, another]), key([another, course]));
});

test("リフトはUI状態を無視し、保存ID・位置・中間駅・削除の差分を判定する", () => {
  const lift = createEmptyLift("test");
  const baseline = liftDraftContentKey([lift]);
  assert.equal(
    liftDraftContentKey([{ ...lift, isNew: false, sourceIndex: 10 }]),
    baseline,
  );
  // id は保存される entityId でもあるため、変更を差分として扱う。
  assert.notEqual(liftDraftContentKey([{ ...lift, id: "別ID" }]), baseline);
  assert.notEqual(
    liftDraftContentKey([{ ...lift, midstation: [139, 35] }]),
    baseline,
  );
  assert.notEqual(
    liftDraftContentKey([
      {
        ...lift,
        coordinates: [
          [139, 35],
          [139, 36],
        ],
      },
    ]),
    baseline,
  );
  assert.notEqual(
    liftDraftContentKey([{ ...lift, isDeleted: true }]),
    baseline,
  );
  assert.equal(
    liftDraftContentKey([
      lift,
      { ...createEmptyLift("test"), isDeleted: true },
    ]),
    baseline,
  );
});

test("リンクは読み込みのみ・元に戻した場合に差分なしと判定する", () => {
  const baseline = structuredClone(EMPTY_RESORT_LINKS);
  const links = structuredClone(baseline);
  assert.equal(hasLinkDraftChanges(), false);
  assert.equal(hasLinkDraftChanges({ baseline, links }), false);
  links.youtubeUrls = [{ url: "https://www.youtube.com/watch?v=test" }];
  assert.equal(hasLinkDraftChanges({ baseline, links }), true);
  links.youtubeUrls = baseline.youtubeUrls;
  assert.equal(hasLinkDraftChanges({ baseline, links }), false);
});
