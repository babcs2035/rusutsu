"use client";

import { type DragEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { EditorStepContent } from "@/shared/components/resort-editor/EditorStepContent";
import { courseGroupingRoute } from "@/shared/course-lift/identity";
import { updateDefaultSearchWord } from "@/shared/utils/searchWord";
import type { EditorCourse } from "../types";
import {
  applyCourseGroupingPlan,
  courseGroupingBuckets,
  groupingFingerprint,
  groupingNeedsReview,
  lineLength,
  suggestCourseRoutes,
} from "../utils/courseGrouping";

type Props = {
  courses: EditorCourse[];
  setCourses: (updater: (courses: EditorCourse[]) => EditorCourse[]) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  resortSearchNameFor: (course: EditorCourse) => string;
  onBack: () => void;
  onProceed: () => void;
};

const NEW_ROUTE = "new";
const SEPARATE = "separate";

type Drag = { type: "line"; id: string } | { type: "route"; index: number };
type DropTarget =
  | { type: "line"; id: string; after: boolean }
  | { type: "route"; index: number; after: boolean }
  | { type: "zone"; zone: string };

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
        `${index === 0 ? "メイン" : `ルート${index + 1}`}: ${route.length > 1 ? `${route.length}区間` : "1本"}`,
    )
    .join("、")}）。`;
}

const isAfter = (event: DragEvent<HTMLElement>) => {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientY >= bounds.top + bounds.height / 2;
};

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
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const separate = members
    .filter(c => !routes.some(r => r.includes(c.id)))
    .sort((a, b) => lineLength(b) - lineLength(a));
  const single = routes.length === 1;
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
  /** 線を移す。target はルート番号（0始まり）・新しいルート・別コース。 */
  const moveLine = (
    id: string,
    target: number | typeof NEW_ROUTE | typeof SEPARATE,
    beside?: { id: string; after: boolean },
  ) =>
    update(previous => {
      const next = previous.map(r => r.filter(other => other !== id));
      if (target === NEW_ROUTE) return [...next, [id]];
      if (target === SEPARATE) return next;
      return next.map((r, index) => {
        if (index !== target) return r;
        const at = beside ? r.indexOf(beside.id) : -1;
        if (at < 0) return [...r, id];
        const copy = [...r];
        copy.splice(at + (beside?.after ? 1 : 0), 0, id);
        return copy;
      });
    });
  const moveRoute = (from: number, to: number, after: boolean) =>
    update(previous => {
      const next = [...previous];
      const [route] = next.splice(from, 1);
      const at = to > from ? to - 1 : to;
      next.splice(at + (after ? 1 : 0), 0, route);
      return next;
    });
  const clearDrag = () => {
    setDrag(null);
    setDropTarget(null);
  };
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
  const routeTitle = (index: number) =>
    single
      ? "区間（上から順）"
      : index === 0
        ? "ルート1（メイン）"
        : `ルート${index + 1}`;

  const membership = (c: EditorCourse, current: string) => (
    <select
      aria-label={`${c.name || "名前不明"}の扱い`}
      className="min-w-0 flex-1 rounded border bg-background p-2 text-sm"
      value={current}
      onChange={e => {
        const value = e.target.value;
        moveLine(
          c.id,
          value === NEW_ROUTE || value === SEPARATE ? value : Number(value),
        );
      }}
    >
      {routes.map((route, index) => (
        <option key={route.join(":")} value={String(index)}>
          {single ? "このコースの区間にする" : `${routeTitle(index)}に入れる`}
        </option>
      ))}
      <option value={NEW_ROUTE}>
        {routes.length === 0 ? "まとめる" : "別ルートにする"}
      </option>
      <option value={SEPARATE}>別コース（まとめない）</option>
    </select>
  );
  const dropLine = (route: number | typeof SEPARATE, c: EditorCourse) => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (drag?.type !== "line" || drag.id === c.id) return;
      event.preventDefault();
      event.stopPropagation();
      setDropTarget({ type: "line", id: c.id, after: isAfter(event) });
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (drag?.type !== "line") return;
      event.preventDefault();
      event.stopPropagation();
      if (drag.id !== c.id)
        moveLine(
          drag.id,
          route,
          route === SEPARATE ? undefined : { id: c.id, after: isAfter(event) },
        );
      clearDrag();
    },
  });
  const dropZone = (zone: string, onDropLine: (id: string) => void) => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (drag?.type !== "line") return;
      event.preventDefault();
      setDropTarget({ type: "zone", zone });
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (drag?.type !== "line") return;
      event.preventDefault();
      onDropLine(drag.id);
      clearDrag();
    },
  });
  const zoneActive = (zone: string) =>
    dropTarget?.type === "zone" && dropTarget.zone === zone;

  /** 名前を上、扱い・並べ替えを下に置く。名前部分を押すと地図で赤く表示する */
  const lineRow = (
    c: EditorCourse,
    prefix: string,
    current: string,
    route: number | typeof SEPARATE,
    controls?: ReactNode,
  ) => {
    const selected = c.id === props.selectedId;
    const target =
      dropTarget?.type === "line" && dropTarget.id === c.id ? dropTarget : null;
    return (
      <li
        key={c.id}
        draggable
        onDragStart={event => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", c.id);
          setDrag({ type: "line", id: c.id });
        }}
        onDragEnd={clearDrag}
        {...dropLine(route, c)}
        className={`space-y-2 rounded border p-2 ${
          selected
            ? "border-red-500 bg-red-50"
            : "border-transparent bg-muted/50"
        } ${drag?.type === "line" && drag.id === c.id ? "opacity-40" : ""} ${
          target
            ? target.after
              ? "border-b-2 border-b-blue-600"
              : "border-t-2 border-t-blue-600"
            : ""
        }`}
      >
        <div className="flex items-start gap-2">
          <span
            aria-hidden="true"
            className="cursor-grab select-none text-lg leading-5 text-muted-foreground active:cursor-grabbing"
          >
            ⠿
          </span>
          <button
            type="button"
            aria-pressed={selected}
            className="block min-w-0 flex-1 text-left text-sm"
            onClick={() => props.onSelect(c.id)}
          >
            <span className="font-medium">
              {prefix}
              {c.name || "名前不明"}
            </span>
            <span className="block text-xs text-muted-foreground">
              {c.detail.level || "難易度未設定"}・{Math.round(lineLength(c))}m・
              {selected ? "地図で赤く表示中" : "押すと地図で表示"}
            </span>
          </button>
        </div>
        <div className="flex items-center gap-1">
          {membership(c, current)}
          {controls}
        </div>
      </li>
    );
  };
  const arrows = (
    label: string,
    index: number,
    length: number,
    onMove: (delta: number) => void,
  ) => (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label={`${label}を上へ`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        ↑
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-label={`${label}を下へ`}
        disabled={index === length - 1}
        onClick={() => onMove(1)}
      >
        ↓
      </Button>
    </>
  );

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
        つながって1本のコースになる線は同じルートに入れ、上から区間順に並べます。並行する別の道は別ルートにし、メインのコースを1番上にします。⠿をドラッグして並べ替えられます。
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
          <span className="mt-1 block text-xs text-muted-foreground">
            確定すると、まとめた線の名前もこの名前にそろえます。
          </span>
        </label>
      )}
      {routes.map((route, routeIndex) => {
        const routeTarget =
          dropTarget?.type === "route" && dropTarget.index === routeIndex
            ? dropTarget
            : null;
        return (
          <section
            aria-label={routeTitle(routeIndex)}
            key={route.join(":")}
            className={`space-y-2 rounded border p-2 ${
              zoneActive(String(routeIndex))
                ? "border-blue-600 bg-blue-50"
                : "bg-muted/20"
            } ${
              routeTarget
                ? routeTarget.after
                  ? "border-b-4 border-b-blue-600"
                  : "border-t-4 border-t-blue-600"
                : ""
            } ${drag?.type === "route" && drag.index === routeIndex ? "opacity-40" : ""}`}
            onDragOver={event => {
              if (drag?.type === "route") {
                if (drag.index === routeIndex) return;
                event.preventDefault();
                setDropTarget({
                  type: "route",
                  index: routeIndex,
                  after: isAfter(event),
                });
                return;
              }
              dropZone(String(routeIndex), () => {}).onDragOver(event);
            }}
            onDrop={event => {
              if (drag?.type === "route") {
                event.preventDefault();
                if (drag.index !== routeIndex)
                  moveRoute(drag.index, routeIndex, isAfter(event));
                clearDrag();
                return;
              }
              dropZone(String(routeIndex), id =>
                moveLine(id, routeIndex),
              ).onDrop(event);
            }}
          >
            {/* biome-ignore lint/a11y/noStaticElementInteractions: ↑↓ボタンでもルートを並べ替えられる */}
            <div
              className={`flex items-center gap-2 ${single ? "" : "cursor-grab active:cursor-grabbing"}`}
              draggable={!single}
              onDragStart={event => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", `route:${routeIndex}`);
                setDrag({ type: "route", index: routeIndex });
              }}
              onDragEnd={clearDrag}
            >
              {!single && (
                <span
                  aria-hidden="true"
                  className="select-none text-lg leading-none text-muted-foreground"
                >
                  ⠿
                </span>
              )}
              <p className="flex-1 text-sm font-semibold">
                {routeTitle(routeIndex)}
                {!single && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {route.length > 1 ? `${route.length}区間` : "1本"}
                  </span>
                )}
              </p>
              {!single &&
                arrows(
                  `ルート${routeIndex + 1}`,
                  routeIndex,
                  routes.length,
                  delta => moveRoute(routeIndex, routeIndex + delta, delta > 0),
                )}
            </div>
            <ol className="space-y-2">
              {route.map((id, index) => {
                const c = members.find(m => m.id === id);
                if (!c) return null;
                return lineRow(
                  c,
                  route.length > 1 ? `区間${index + 1}：` : "",
                  String(routeIndex),
                  routeIndex,
                  route.length > 1 &&
                    arrows(
                      `${routeTitle(routeIndex)}の区間${index + 1}`,
                      index,
                      route.length,
                      delta =>
                        moveLine(id, routeIndex, {
                          id: route[index + delta],
                          after: delta > 0,
                        }),
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
          </section>
        );
      })}
      {drag?.type === "line" && (
        <div
          className={`rounded border-2 border-dashed p-3 text-center text-sm ${
            zoneActive(NEW_ROUTE)
              ? "border-blue-600 bg-blue-50"
              : "text-muted-foreground"
          }`}
          {...dropZone(NEW_ROUTE, id => moveLine(id, NEW_ROUTE))}
        >
          ここにドロップして
          {routes.length === 0 ? "まとめる" : "別ルートにする"}
        </div>
      )}
      {(separate.length > 0 || drag?.type === "line") && (
        <div
          className={`space-y-2 rounded border p-2 ${
            zoneActive(SEPARATE) ? "border-blue-600 bg-blue-50" : ""
          }`}
          {...dropZone(SEPARATE, id => moveLine(id, SEPARATE))}
        >
          <p className="text-sm font-semibold">
            別コース（名前が同じだけで、まとめない線）
          </p>
          <ul className="space-y-2">
            {separate.map(c => lineRow(c, "", SEPARATE, SEPARATE))}
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
          props.setCourses(current => {
            const trimmed = name.trim();
            const grouped = new Set(routes.flat());
            // まとめた線の名前を、まとめて表示する名前にそろえる
            const renamed = current.map(c =>
              grouped.has(c.id) && c.name !== trimmed
                ? {
                    ...c,
                    name: trimmed,
                    unnamed: false,
                    detail: {
                      ...c.detail,
                      searchWord: updateDefaultSearchWord(
                        c.detail.searchWord,
                        props.resortSearchNameFor(c),
                        c.name,
                        trimmed,
                      ),
                    },
                  }
                : c,
            );
            return applyCourseGroupingPlan(
              renamed,
              members.map(c => c.id),
              grouped.size > 0 ? { name: trimmed, routes } : null,
            );
          })
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
