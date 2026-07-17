import { UNNAMED_PREFIX } from "../constants";
import type { CourseDetail, EditorCourse, LngLat } from "../types";

export const createEmptyDetail = (): CourseDetail => ({
  level: "",
  distance: "",
  avg: "",
  max: "",
  piste: "",
  morning: "",
  night: "",
});

export const createCourseId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `course-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const createEmptyCourse = (): EditorCourse => ({
  id: createCourseId(),
  name: "",
  unnamed: false,
  coordinates: [],
  detail: createEmptyDetail(),
  detailExtras: null,
  splitGroupId: null,
  splitBaseName: null,
});

// 無名コースへ既存データと同じ「無名_1」形式の名前を割り当てる
export const assignUnnamedCourseNames = (
  courses: EditorCourse[],
): EditorCourse[] => {
  const usedNames = new Set(
    courses.filter(course => course.name !== "").map(course => course.name),
  );
  let sequence = 1;

  return courses.map(course => {
    if (!course.unnamed || course.name !== "") return course;
    let candidate = `${UNNAMED_PREFIX}_${sequence}`;
    while (usedNames.has(candidate)) {
      sequence += 1;
      candidate = `${UNNAMED_PREFIX}_${sequence}`;
    }
    usedNames.add(candidate);
    sequence += 1;
    return { ...course, name: candidate };
  });
};

// 分割数に応じたサフィックス（2: 上部/下部, 3: 上部/中部/下部, 4+: 上部/中部1.../下部）
export const buildSplitSuffixes = (count: number): string[] => {
  if (count <= 1) return [""];
  if (count === 2) return ["上部", "下部"];
  if (count === 3) return ["上部", "中部", "下部"];
  const middles = Array.from(
    { length: count - 2 },
    (_, index) => `中部${index + 1}`,
  );
  return ["上部", ...middles, "下部"];
};

const stripSplitSuffix = (name: string): string => name.replace(/_#.*$/, "");

// 同じ分割グループのコース名をグループ内の並び順で振り直す
const relabelSplitGroup = (
  courses: EditorCourse[],
  groupId: string,
): EditorCourse[] => {
  const members = courses.filter(course => course.splitGroupId === groupId);
  if (members.length === 0) return courses;

  const baseName =
    members[0].splitBaseName ?? stripSplitSuffix(members[0].name);
  const suffixes = buildSplitSuffixes(members.length);
  const nameByCourseId = new Map<string, string>();
  members.forEach((member, index) => {
    nameByCourseId.set(
      member.id,
      suffixes[index] === "" ? baseName : `${baseName}_#${suffixes[index]}`,
    );
  });

  return courses.map(course => {
    const nextName = nameByCourseId.get(course.id);
    if (nextName === undefined) return course;
    return { ...course, name: nextName, splitBaseName: baseName };
  });
};

// コースを頂点 vertexIndex で 2 本に分割する（分割点は両方に含める）
export const splitCourseAtVertex = (
  courses: EditorCourse[],
  courseId: string,
  vertexIndex: number,
): EditorCourse[] => {
  const target = courses.find(course => course.id === courseId);
  if (!target) return courses;
  if (vertexIndex <= 0 || vertexIndex >= target.coordinates.length - 1) {
    return courses;
  }

  const groupId = target.splitGroupId ?? createCourseId();
  const baseName = target.splitBaseName ?? stripSplitSuffix(target.name);
  const upper: EditorCourse = {
    ...target,
    coordinates: target.coordinates.slice(0, vertexIndex + 1),
    splitGroupId: groupId,
    splitBaseName: baseName,
  };
  const lower: EditorCourse = {
    ...target,
    id: createCourseId(),
    coordinates: target.coordinates.slice(vertexIndex),
    detail: { ...target.detail },
    splitGroupId: groupId,
    splitBaseName: baseName,
  };

  const next = courses.flatMap(course =>
    course.id === courseId ? [upper, lower] : [course],
  );
  return relabelSplitGroup(next, groupId);
};

const isSameCoordinate = (a: LngLat, b: LngLat): boolean =>
  a[0] === b[0] && a[1] === b[1];

// 分割グループを 1 本のコースへ結合し直す
export const mergeSplitGroup = (
  courses: EditorCourse[],
  groupId: string,
): EditorCourse[] => {
  const members = courses.filter(course => course.splitGroupId === groupId);
  if (members.length < 2) return courses;

  const coordinates: LngLat[] = [];
  for (const member of members) {
    for (const coordinate of member.coordinates) {
      const last = coordinates[coordinates.length - 1];
      if (last && isSameCoordinate(last, coordinate)) continue;
      coordinates.push(coordinate);
    }
  }

  const first = members[0];
  const merged: EditorCourse = {
    ...first,
    name: first.splitBaseName ?? stripSplitSuffix(first.name),
    coordinates,
    splitGroupId: null,
    splitBaseName: null,
  };

  let inserted = false;
  return courses.flatMap(course => {
    if (course.splitGroupId !== groupId) return [course];
    if (inserted) return [];
    inserted = true;
    return [merged];
  });
};
