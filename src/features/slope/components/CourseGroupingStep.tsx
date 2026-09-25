"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EditorStepContent } from "@/shared/components/resort-editor/EditorStepContent";
import type { EditorCourse } from "../types";
import {
  applyCourseGrouping,
  courseGroupingBuckets,
  groupingFingerprint,
  groupingNeedsReview,
  suggestCourseChain,
} from "../utils/courseGrouping";

type Props = {
  courses: EditorCourse[];
  setCourses: (updater: (courses: EditorCourse[]) => EditorCourse[]) => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  onProceed: () => void;
};
function GroupEditor({
  members,
  ...props
}: Props & { members: EditorCourse[] }) {
  const proposal = suggestCourseChain(members);
  const saved = members[0].grouping;
  const [kind, setKind] = useState<"continuous" | "routes" | "independent">(
    saved?.kind ??
      (members.every(c => c.groupingReviewed === groupingFingerprint(members))
        ? "independent"
        : proposal.kind),
  );
  const [name, setName] = useState(saved?.name ?? members[0].name);
  const [ids, setIds] = useState(saved ? members.map(c => c.id) : proposal.ids);
  const reviewed = members.every(
    c => c.groupingReviewed === groupingFingerprint(members),
  );
  const invalidate = () =>
    props.setCourses(current =>
      current.map(c =>
        members.some(m => m.id === c.id)
          ? { ...c, groupingReviewed: undefined }
          : c,
      ),
    );
  const move = (index: number, delta: number) => {
    invalidate();
    setIds(previous => {
      const next = [...previous];
      const target = index + delta;
      if (target >= 0 && target < next.length)
        [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div className="flex justify-between gap-2">
        <h3 className="font-semibold">
          {saved?.name ?? members[0].name}（{members.length}本）
        </h3>
        <span className={reviewed ? "text-green-700" : "text-amber-700"}>
          {reviewed ? "確認済み" : "要確認"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{proposal.reason}</p>
      <label className="block text-sm">
        扱い
        <select
          aria-label="扱い"
          className="mt-1 block w-full rounded border bg-background p-2"
          value={kind}
          onChange={e => {
            invalidate();
            setKind(e.target.value as typeof kind);
          }}
        >
          <option value="continuous">連続した区間</option>
          <option value="routes">同じコースの別ルート</option>
          <option value="independent">名前が同じ別コース</option>
        </select>
      </label>
      {kind !== "independent" && (
        <label className="block text-sm">
          まとめて表示する名前
          <input
            className="mt-1 block w-full rounded border p-2"
            value={name}
            onChange={e => {
              invalidate();
              setName(e.target.value);
            }}
          />
        </label>
      )}
      <ol className="space-y-2">
        {ids.map((id, index) => {
          const c = members.find(m => m.id === id);
          if (!c) return null;
          return (
            <li
              key={id}
              className="flex items-center gap-1 rounded bg-muted/50 p-2"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left text-sm"
                onClick={() => props.onSelect(id)}
              >
                {kind === "continuous"
                  ? "区間"
                  : kind === "routes"
                    ? "ルート"
                    : "線"}
                {index + 1}：{c.name || "名前不明"}
                <span className="block text-xs text-muted-foreground">
                  {c.detail.level || "難易度未設定"}・地図で確認
                </span>
              </button>
              <Button
                variant="outline"
                size="sm"
                aria-label={`${index + 1}番目を上へ`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                ↑
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label={`${index + 1}番目を下へ`}
                disabled={index === ids.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </Button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            invalidate();
            setIds(previous => [...previous].reverse());
          }}
        >
          順序を反転
        </Button>
        <Button
          size="sm"
          disabled={kind !== "independent" && !name.trim()}
          onClick={() =>
            props.setCourses(current =>
              applyCourseGrouping(current, ids, kind, name),
            )
          }
        >
          この扱い・順序で確定
        </Button>
      </div>
    </section>
  );
}
export function CourseGroupingStep(props: Props) {
  const buckets = courseGroupingBuckets(props.courses);
  return (
    <EditorStepContent>
      <h2 className="text-lg font-bold">コースのまとめ方</h2>
      <p className="text-sm text-muted-foreground">
        同じ名前の線を地図で確認してください。まとめた後も、詳細情報とクローラー対応は線ごとに編集します。座標は変更しません。
      </p>
      {buckets.length === 0 ? (
        <p className="rounded border p-4 text-sm">
          確認が必要な同名コースはありません。
        </p>
      ) : (
        buckets.map(members => (
          <GroupEditor
            key={`${members.map(c => c.id).join(":")}:${groupingFingerprint(members)}`}
            {...props}
            members={members}
          />
        ))
      )}
      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={props.onBack}>
          線の編集へ戻る
        </Button>
        <Button
          disabled={groupingNeedsReview(props.courses)}
          onClick={props.onProceed}
        >
          各線の詳細編集へ
        </Button>
      </div>
    </EditorStepContent>
  );
}
