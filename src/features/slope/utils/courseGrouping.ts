import type { CourseGrouping } from "@/shared/course-lift/identity";
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
  const groups = new Map<string, EditorCourse[]>();
  for (const c of courses) {
    const key = c.grouping
      ? `${c.skiId}:name:${c.grouping.name.trim()}`
      : `${c.skiId}:name:${c.name.trim() || c.id}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups.values()]
    .filter(g => g.length > 1 || g[0].grouping)
    .map(g =>
      g.sort((a, b) => (a.grouping?.order ?? 0) - (b.grouping?.order ?? 0)),
    );
}
export function applyCourseGrouping(
  courses: EditorCourse[],
  ids: string[],
  kind: CourseGrouping["kind"] | "independent",
  name: string,
): EditorCourse[] {
  const members = courses.filter(c => ids.includes(c.id));
  if (new Set(members.map(c => c.skiId)).size > 1)
    throw new Error("異なるスキー場の線はまとめられません。");
  const existing = members.find(c => c.grouping)?.grouping;
  const id = existing?.id ?? crypto.randomUUID();
  const fingerprint = groupingFingerprint(members);
  return courses.map(c =>
    ids.includes(c.id)
      ? {
          ...c,
          grouping:
            kind === "independent"
              ? null
              : { id, name: name.trim(), kind, order: ids.indexOf(c.id) + 1 },
          groupingReviewed: fingerprint,
        }
      : c,
  );
}
export function groupingNeedsReview(courses: EditorCourse[]) {
  return courseGroupingBuckets(courses).some(bucket =>
    bucket.some(c => c.groupingReviewed !== groupingFingerprint(bucket)),
  );
}
export function courseEditorLabel(course: EditorCourse) {
  if (!course.grouping) return course.name || "名前不明";
  return `${course.grouping.name} / ${course.grouping.kind === "continuous" ? "区間" : "ルート"}${course.grouping.order}`;
}
