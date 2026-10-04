"use client";

import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { EditorStepContent } from "@/shared/components/resort-editor/EditorStepContent";
import { courseGroupingRoute } from "@/shared/course-lift/identity";
import type { EditorCourse } from "../types";
import {
  applyCourseGroupingPlan,
  courseGroupingBuckets,
  groupingFingerprint,
  groupingNeedsReview,
  suggestCourseRoutes,
} from "../utils/courseGrouping";

type Props = {
  courses: EditorCourse[];
  setCourses: (updater: (courses: EditorCourse[]) => EditorCourse[]) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBack: () => void;
  onProceed: () => void;
};

const NEW_ROUTE = "new";
const SEPARATE = "separate";

/** 保存済みのルート・区間。未確認なら端点のつながりから提案する。 */
function initialRoutes(members: EditorCourse[], reviewed: boolean) {
  const saved = new Map<string, string[]>();
  for (const c of members) {
    if (!c.grouping) continue;
    const key =
      c.grouping.kind === "continuous"
        ? `${c.grouping.id}`
        : `${c.grouping.id}:${courseGroupingRoute(c.grouping)}`;
    saved.set(key, [...(saved.get(key) ?? []), c.id]);
  }
  if (saved.size > 0 || reviewed) return [...saved.values()];
  return suggestCourseRoutes(members).routes;
}

/** ルートと区間の組み合わせを、言葉で確認できるようにする。 */
function describe(routes: string[][]) {
  const count = routes.flat().length;
  if (count === 0) return "まとめずに、すべて別コースとして扱います。";
  if (routes.length === 1)
    return `1本のコースを${count}つの区間に分けた「連続した区間」として扱います。`;
  return `同じコースの別ルートとして扱います（${routes
    .map(
      (route, index) =>
        `ルート${index + 1}: ${route.length > 1 ? `${route.length}区間` : "1本"}`,
    )
    .join("、")}）。`;
}

function GroupEditor({
  members,
  ...props
}: Props & { members: EditorCourse[] }) {
  const proposal = suggestCourseRoutes(members);
  const reviewed = members.every(
    c => c.groupingReviewed === groupingFingerprint(members),
  );
  const [routes, setRoutes] = useState<string[][]>(() =>
    initialRoutes(members, reviewed),
  );
  const [name, setName] = useState(
    members.find(c => c.grouping)?.grouping?.name ?? members[0].name,
  );
  const separate = members.filter(c => !routes.some(r => r.includes(c.id)));
  const invalidate = () =>
    props.setCourses(current =>
      current.map(c =>
        members.some(m => m.id === c.id)
          ? { ...c, groupingReviewed: undefined }
          : c,
      ),
    );
  const update = (updater: (routes: string[][]) => string[][]) => {
    invalidate();
    // 線がなくなったルートは消す
    setRoutes(previous => updater(previous).filter(r => r.length > 0));
  };
  const moveTo = (id: string, target: string) =>
    update(previous => {
      const next = previous.map(r => r.filter(other => other !== id));
      if (target === NEW_ROUTE) return [...next, [id]];
      if (target === SEPARATE) return next;
      return next.map((r, index) =>
        String(index) === target ? [...r, id] : r,
      );
    });
  const move = (routeIndex: number, index: number, delta: number) =>
    update(previous =>
      previous.map((r, other) => {
        const target = index + delta;
        if (other !== routeIndex || target < 0 || target >= r.length) return r;
        const next = [...r];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      }),
    );
  const grouped = routes.flat().length;
  const problems = [
    ...(grouped === 1
      ? [
          "まとめる線は2本以上にしてください。1本だけなら「別コース」にしてください。",
        ]
      : []),
    ...(grouped > 0 && !name.trim()
      ? ["まとめて表示する名前を入力してください。"]
      : []),
  ];

  const membership = (c: EditorCourse, current: string) => (
    <select
      aria-label={`${c.name || "名前不明"}の扱い`}
      className="min-w-0 flex-1 rounded border bg-background p-2 text-sm"
      value={current}
      onChange={e => moveTo(c.id, e.target.value)}
    >
      {routes.map((route, index) => (
        <option key={route.join(":")} value={String(index)}>
          ルート{index + 1}に入れる
        </option>
      ))}
      <option value={NEW_ROUTE}>
        {routes.length === 0 ? "まとめる（ルート1）" : "新しいルートにする"}
      </option>
      <option value={SEPARATE}>別コース（まとめない）</option>
    </select>
  );
  /** 名前を上、扱い・並べ替えを下に置く。名前部分を押すと地図で赤く表示する */
  const lineRow = (
    c: EditorCourse,
    prefix: string,
    current: string,
    controls?: ReactNode,
  ) => {
    const selected = c.id === props.selectedId;
    return (
      <li
        key={c.id}
        className={`space-y-2 rounded border p-2 ${
          selected
            ? "border-red-500 bg-red-50"
            : "border-transparent bg-muted/50"
        }`}
      >
        <button
          type="button"
          aria-pressed={selected}
          className="block w-full text-left text-sm"
          onClick={() => props.onSelect(c.id)}
        >
          <span className="font-medium">
            {prefix}
            {c.name || "名前不明"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {c.detail.level || "難易度未設定"}・
            {selected ? "地図で赤く表示中" : "押すと地図で表示"}
          </span>
        </button>
        <div className="flex items-center gap-1">
          {membership(c, current)}
          {controls}
        </div>
      </li>
    );
  };

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div className="flex justify-between gap-2">
        <h3 className="font-semibold">
          {members[0].name || members[0].grouping?.name}（{members.length}本）
        </h3>
        <span className={reviewed ? "text-green-700" : "text-amber-700"}>
          {reviewed ? "確認済み" : "要確認"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{proposal.reason}</p>
      <p className="text-xs text-muted-foreground">
        つながって1本のコースになる線は同じルートに入れ、上から区間順に並べます。並行する別の道は別のルートにします。
      </p>
      {grouped > 0 && (
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
      {routes.map((route, routeIndex) => (
        <div
          key={route.join(":")}
          className="space-y-2 rounded border bg-muted/20 p-2"
        >
          <p className="text-sm font-semibold">
            ルート{routeIndex + 1}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {route.length > 1 ? `${route.length}区間（上から順）` : "1本"}
            </span>
          </p>
          <ol className="space-y-2">
            {route.map((id, index) => {
              const c = members.find(m => m.id === id);
              if (!c) return null;
              return lineRow(
                c,
                route.length > 1 ? `区間${index + 1}：` : "",
                String(routeIndex),
                route.length > 1 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`ルート${routeIndex + 1}の区間${index + 1}を上へ`}
                      disabled={index === 0}
                      onClick={() => move(routeIndex, index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`ルート${routeIndex + 1}の区間${index + 1}を下へ`}
                      disabled={index === route.length - 1}
                      onClick={() => move(routeIndex, index, 1)}
                    >
                      ↓
                    </Button>
                  </>
                ),
              );
            })}
          </ol>
          {route.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                update(previous =>
                  previous.map((r, other) =>
                    other === routeIndex ? [...r].reverse() : r,
                  ),
                )
              }
            >
              区間の順序を反転
            </Button>
          )}
        </div>
      ))}
      {separate.length > 0 && (
        <div className="space-y-2 rounded border p-2">
          <p className="text-sm font-semibold">
            別コース（名前が同じだけで、まとめない線）
          </p>
          <ul className="space-y-2">
            {separate.map(c => lineRow(c, "", SEPARATE))}
          </ul>
        </div>
      )}
      <p className="rounded bg-muted/40 p-2 text-sm">{describe(routes)}</p>
      {problems.map(problem => (
        <p key={problem} className="text-xs text-amber-700">
          {problem}
        </p>
      ))}
      <Button
        size="sm"
        disabled={problems.length > 0}
        onClick={() =>
          props.setCourses(current =>
            applyCourseGroupingPlan(
              current,
              members.map(c => c.id),
              routes.flat().length > 0 ? { name, routes } : null,
            ),
          )
        }
      >
        このまとめ方で確定
      </Button>
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
