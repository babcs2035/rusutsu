import {
  type CourseGrouping,
  courseGroupingLabel,
  courseGroupingRoute,
} from "@/shared/course-lift/identity";
import type { EditorCourse } from "../types";

export const ENDPOINT_TOLERANCE_M = 10;
type Line = {
  id: string;
  coordinates: readonly (readonly number[])[];
  rawEndpoints?: readonly (readonly number[])[];
};
export function endpointDistance(a: readonly number[], b: readonly number[]) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 +
    Math.cos(a[1] * rad) *
      Math.cos(b[1] * rad) *
      Math.sin(((b[0] - a[0]) * rad) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Undirected endpoint graph: branches, loops, shared starts/ends are ambiguous. */
export function suggestCourseChain(
  lines: Line[],
  tolerance = ENDPOINT_TOLERANCE_M,
): {
  kind: "continuous" | "independent";
  ids: string[];
  directionKnown: boolean;
  reason: string;
} {
  const fallback = (reason: string) => ({
    kind: "independent" as const,
    ids: lines.map(l => l.id),
    directionKnown: false,
    reason,
  });
  if (lines.length < 2 || lines.some(l => l.coordinates.length < 2))
    return fallback("接続を判断するには2本以上の線が必要です。");
  const edges = lines.map(
    () => [] as { to: number; fromEnd: number; toEnd: number }[],
  );
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i].coordinates,
        b = lines[j].coordinates;
      for (const ae of [0, 1])
        for (const be of [0, 1]) {
          if (
            endpointDistance(
              a[ae ? a.length - 1 : 0],
              b[be ? b.length - 1 : 0],
            ) <= tolerance
          ) {
            edges[i].push({ to: j, fromEnd: ae, toEnd: be });
            edges[j].push({ to: i, fromEnd: be, toEnd: ae });
          }
        }
    }
  if (
    edges.some(
      e => e.length > 2 || (e.length === 2 && e[0].fromEnd === e[1].fromEnd),
    )
  )
    return fallback(
      "分岐・重なりがあるため、連続区間とは自動判定しません。別ルートか確認してください。",
    );
  const ends = edges.flatMap((e, i) => (e.length === 1 ? [i] : []));
  if (ends.length !== 2 || edges.some(e => e.length === 0))
    return fallback("離れた線または循環があります。別コースとして提案します。");
  const walk = (start: number) => {
    const order: number[] = [];
    let prev = -1,
      cur = start;
    while (!order.includes(cur)) {
      order.push(cur);
      const next = edges[cur].find(e => e.to !== prev);
      if (!next) break;
      prev = cur;
      cur = next.to;
    }
    return order;
  };
  let order = walk(ends[0]);
  if (order.length !== lines.length)
    return fallback("すべての線を一続きに並べられません。");
  const outer = (i: number) => {
    const c = lines[i].coordinates;
    const point = c[edges[i][0].fromEnd === 0 ? c.length - 1 : 0];
    return (
      lines[i].rawEndpoints?.find(
        raw => raw[0] === point[0] && raw[1] === point[1],
      ) ?? point
    );
  };
  const a = outer(ends[0]),
    b = outer(ends[1]);
  const known =
    Number.isFinite(a[2]) && Number.isFinite(b[2]) && Math.abs(a[2] - b[2]) > 1;
  if (known && a[2] < b[2]) order = order.reverse();
  return {
    kind: "continuous",
    ids: order.map(i => lines[i].id),
    directionKnown: known,
    reason: `端点が${tolerance}m以内で一続きです。${known ? "標高の高い方から並べました。" : "上下方向は区間順を確認してください。"}`,
  };
}

export function groupingFingerprint(courses: EditorCourse[]): string {
  const value = JSON.stringify(
    courses
      .map(c => [c.id, c.skiId, c.name, c.coordinates])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
  let hash = 2166136261;
  for (const char of value)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${value.length}:${hash >>> 0}`;
}
export function courseGroupingBuckets(courses: EditorCourse[]) {
  // 線の名前・グループ名・グループIDのどれかが共通する線を1つの確認単位にする。
  // 同名の線の一部だけをまとめたグループと、残りの単独の線を一緒に見直せる。
  const parent = courses.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const firstByKey = new Map<string, number>();
  courses.forEach((c, index) => {
    const keys = [
      c.name.trim() && `name:${c.name.trim()}`,
      c.grouping && `name:${c.grouping.name.trim()}`,
      c.grouping && `group:${c.grouping.id}`,
    ];
    for (const key of keys) {
      if (!key) continue;
      const scoped = `${c.skiId}:${key}`;
      const first = firstByKey.get(scoped);
      if (first === undefined) firstByKey.set(scoped, index);
      else parent[find(index)] = find(first);
    }
  });
  const groups = new Map<number, EditorCourse[]>();
  courses.forEach((c, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), c]);
  });
  return [...groups.values()]
    .filter(g => g.length > 1)
    .map(g => {
      const groupIds = [...new Set(g.flatMap(c => c.grouping?.id ?? []))];
      return g.sort(
        (a, b) =>
          (a.grouping ? groupIds.indexOf(a.grouping.id) : groupIds.length) -
            (b.grouping ? groupIds.indexOf(b.grouping.id) : groupIds.length) ||
          (a.grouping?.order ?? 0) - (b.grouping?.order ?? 0),
      );
    });
}

/** 線の長さ（m）。 */
export function lineLength(line?: Pick<Line, "coordinates">) {
  const c = line?.coordinates ?? [];
  let total = 0;
  for (let i = 1; i < c.length; i++) total += endpointDistance(c[i - 1], c[i]);
  return total;
}

/** 1つのコースとしてまとめる線。ルートごとに、上から区間順に線IDを並べる。 */
export type CourseGroupDraft = {
  name: string;
  routes: string[][];
};

/**
 * 端点が一続きにつながる線を1つのルート（連続区間）とし、
 * 残りの線はそれぞれ別ルートとして提案する。同じ名前の線を
 * 「別コース」として提案することはない。
 */
export function suggestCourseRoutes(
  lines: Line[],
  tolerance = ENDPOINT_TOLERANCE_M,
): { routes: string[][]; reason: string } {
  const whole = suggestCourseChain(lines, tolerance);
  if (whole.kind === "continuous")
    return { routes: [whole.ids], reason: whole.reason };
  const parent = lines.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) index = parent[index];
    return index;
  };
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i].coordinates,
        b = lines[j].coordinates;
      if (a.length < 2 || b.length < 2) continue;
      const touches = [a[0], a[a.length - 1]].some(p =>
        [b[0], b[b.length - 1]].some(q => endpointDistance(p, q) <= tolerance),
      );
      if (touches) parent[find(j)] = find(i);
    }
  const components = new Map<number, Line[]>();
  lines.forEach((line, index) => {
    const root = find(index);
    components.set(root, [...(components.get(root) ?? []), line]);
  });
  const routes = [...components.values()].flatMap(component => {
    if (component.length < 2) return [component.map(line => line.id)];
    const chain = suggestCourseChain(component, tolerance);
    return chain.kind === "continuous"
      ? [chain.ids]
      : component.map(line => [line.id]);
  });
  // 長いルートほどメインのコースとみなし、上に並べる
  const length = (route: string[]) =>
    route.reduce(
      (sum, id) => sum + lineLength(lines.find(line => line.id === id)),
      0,
    );
  routes.sort((a, b) => length(b) - length(a));
  return {
    routes,
    reason: routes.some(route => route.length > 1)
      ? `端点が${tolerance}m以内で一続きになる線を1つのルートにし、ほかの線を別ルートとして提案しました。`
      : `端点がつながっていないため、それぞれを別ルートとして提案しました。`,
  };
}

/** 確認単位の線を、1つのコース（ルート・区間）と別コースの線に振り分けて確定する。 */
export function applyCourseGroupingPlan(
  courses: EditorCourse[],
  memberIds: string[],
  group: CourseGroupDraft | null,
): EditorCourse[] {
  const members = courses.filter(c => memberIds.includes(c.id));
  if (new Set(members.map(c => c.skiId)).size > 1)
    throw new Error("異なるスキー場の線はまとめられません。");
  const routes = (group?.routes ?? []).filter(route => route.length > 0);
  const assigned = routes.flat();
  if (
    new Set(assigned).size !== assigned.length ||
    assigned.some(id => !memberIds.includes(id))
  )
    throw new Error("同じ線を複数のルートに入れることはできません。");
  if (assigned.length > 0 && !group?.name.trim())
    throw new Error("まとめて表示する名前が必要です。");
  const kind = routes.length > 1 ? "routes" : "continuous";
  const id =
    assigned
      .map(lineId => members.find(c => c.id === lineId)?.grouping?.id)
      .find(Boolean) ?? crypto.randomUUID();
  const fingerprint = groupingFingerprint(members);
  return courses.map(c => {
    if (!memberIds.includes(c.id)) return c;
    const route = routes.findIndex(r => r.includes(c.id));
    if (route < 0 || !group)
      return { ...c, grouping: null, groupingReviewed: fingerprint };
    const section = routes[route].indexOf(c.id) + 1;
    return {
      ...c,
      grouping: {
        id,
        name: group.name.trim(),
        kind,
        order: assigned.indexOf(c.id) + 1,
        ...(kind === "routes"
          ? {
              route: route + 1,
              ...(routes[route].length > 1 ? { section } : {}),
            }
          : {}),
      },
      groupingReviewed: fingerprint,
    };
  });
}
export function applyCourseGrouping(
  courses: EditorCourse[],
  ids: string[],
  kind: CourseGrouping["kind"] | "independent",
  name: string,
): EditorCourse[] {
  return applyCourseGroupingPlan(
    courses,
    ids,
    kind === "independent"
      ? null
      : { name, routes: kind === "continuous" ? [ids] : ids.map(id => [id]) },
  );
}
export function groupingNeedsReview(courses: EditorCourse[]) {
  return courseGroupingBuckets(courses).some(bucket =>
    bucket.some(c => c.groupingReviewed !== groupingFingerprint(bucket)),
  );
}
const baseName = (name: string) => name.replace(/_#.*$/u, "").trim();

/**
 * 保存済みのまとめ方を、いまの線に合わせて整える。
 * - 線の名前がそろっていれば、まとめて表示する名前もその名前にする
 *   （線の名前を変えたのに、まとめた名前だけ古いまま残らないように）
 * - 別ルートが1つしか残っていなければ連続した区間に戻し、ルート番号を詰める
 */
export function normalizeCourseGroupings(
  courses: EditorCourse[],
): EditorCourse[] {
  const membersById = new Map<string, EditorCourse[]>();
  for (const c of courses)
    if (c.grouping)
      membersById.set(c.grouping.id, [
        ...(membersById.get(c.grouping.id) ?? []),
        c,
      ]);
  const next = new Map<string, CourseGrouping>();
  for (const members of membersById.values()) {
    const sorted = [...members].sort(
      (a, b) => (a.grouping?.order ?? 0) - (b.grouping?.order ?? 0),
    );
    const names = new Set(sorted.map(c => baseName(c.name)));
    const [common] = names;
    const name =
      names.size === 1 && common ? common : (sorted[0].grouping?.name ?? "");
    const routeNumbers = [
      ...new Set(
        sorted.map(c =>
          c.grouping ? courseGroupingRoute(c.grouping) : Number.NaN,
        ),
      ),
    ].sort((a, b) => a - b);
    const routes =
      sorted[0].grouping?.kind === "routes" && routeNumbers.length > 1
        ? routeNumbers.map(route =>
            sorted.filter(
              c => c.grouping && courseGroupingRoute(c.grouping) === route,
            ),
          )
        : [sorted];
    const ordered = routes.flat();
    for (const [routeIndex, route] of routes.entries())
      for (const [sectionIndex, c] of route.entries()) {
        if (!c.grouping) continue;
        next.set(c.id, {
          id: c.grouping.id,
          name,
          kind: routes.length > 1 ? "routes" : "continuous",
          order: ordered.indexOf(c) + 1,
          ...(routes.length > 1
            ? {
                route: routeIndex + 1,
                ...(route.length > 1 ? { section: sectionIndex + 1 } : {}),
              }
            : {}),
        });
      }
  }
  let changed = false;
  const result = courses.map(c => {
    const grouping = next.get(c.id);
    if (!grouping || JSON.stringify(grouping) === JSON.stringify(c.grouping))
      return c;
    changed = true;
    return { ...c, grouping };
  });
  return changed ? result : courses;
}

export function courseEditorLabel(course: EditorCourse) {
  if (!course.grouping) return course.name || "名前不明";
  return `${course.grouping.name} / ${courseGroupingLabel(course.grouping)}`;
}
