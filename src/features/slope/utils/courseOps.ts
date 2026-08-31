import {
  buildDefaultSearchWord,
  updateDefaultSearchWord,
} from "@/shared/utils/searchWord";
import { UNNAMED_PREFIX } from "../constants";
import type { CourseDetail, EditorCourse, LngLat } from "../types";
import type { LinePosition, LineSide } from "./lineGeometry";
import { joinLines } from "./lineGeometry";

export const createEmptyDetail = (): CourseDetail => ({
  level: "",
  distance: "",
  avg: "",
  max: "",
  piste: "",
  morning: "",
  night: "",
  image: "",
  searchWord: "",
});

export const createCourseId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `course-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const createEmptyCourse = (): EditorCourse => ({
  id: createCourseId(),
  skiId: "",
  originalSkiId: "",
  name: "",
  unnamed: false,
  coordinates: [],
  detail: createEmptyDetail(),
  beforeExtras: {},
  detailExtras: null,
  splitGroupId: null,
  splitBaseName: null,
});

export const fillEmptyCourseSearchWords = (
  courses: EditorCourse[],
  resortName: string | ((course: EditorCourse) => string),
): EditorCourse[] =>
  courses.map(course =>
    course.detail.searchWord.trim() === ""
      ? {
          ...course,
          detail: {
            ...course.detail,
            searchWord: buildDefaultSearchWord(
              typeof resortName === "function"
                ? resortName(course)
                : resortName,
              course.name,
            ),
          },
        }
      : course,
  );

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
  resortName = "",
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
    return {
      ...course,
      name: nextName,
      detail: {
        ...course.detail,
        searchWord: updateDefaultSearchWord(
          course.detail.searchWord,
          resortName,
          course.name,
          nextName,
        ),
      },
      splitBaseName: baseName,
    };
  });
};

// コースを頂点 vertexIndex で 2 本に分割する（分割点は両方に含める）
export const splitCourseAtVertex = (
  courses: EditorCourse[],
  courseId: string,
  vertexIndex: number,
  resortName = "",
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
  return relabelSplitGroup(next, groupId, resortName);
};

const isSameCoordinate = (a: LngLat, b: LngLat): boolean =>
  a[0] === b[0] && a[1] === b[1];

// 分割グループを 1 本のコースへ結合し直す
export const mergeSplitGroup = (
  courses: EditorCourse[],
  groupId: string,
  resortName = "",
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
  const mergedName = first.splitBaseName ?? stripSplitSuffix(first.name);
  const merged: EditorCourse = {
    ...first,
    name: mergedName,
    detail: {
      ...first.detail,
      searchWord: updateDefaultSearchWord(
        first.detail.searchWord,
        resortName,
        first.name,
        mergedName,
      ),
    },
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

// 結合で残す側と、結合後にどちらの詳細情報を引き継ぐか
export type MergeAnchor = {
  courseId: string;
  position: LinePosition;
  keep: LineSide;
};

export type MergeCoursesOptions = {
  name: string;
  // 詳細情報（難易度・斜度など）をどちらのコースから引き継ぐか
  detailFrom: "first" | "second";
};

const stripSplitSuffixForMerge = (name: string): string =>
  name.replace(/_#.*$/, "");

/**
 * 分割グループから 1 本抜けたあとの後始末。
 * 残り 1 本になったグループは、グループとして扱う意味がないので解除する。
 */
const dissolveEmptySplitGroups = (courses: EditorCourse[]): EditorCourse[] => {
  const counts = new Map<string, number>();
  for (const course of courses) {
    if (!course.splitGroupId) continue;
    counts.set(course.splitGroupId, (counts.get(course.splitGroupId) ?? 0) + 1);
  }
  return courses.map(course =>
    course.splitGroupId && (counts.get(course.splitGroupId) ?? 0) < 2
      ? { ...course, splitGroupId: null, splitBaseName: null }
      : course,
  );
};

/**
 * 2 本のコースを、それぞれの指定位置でつないで 1 本にする。
 *
 * 端どうしだけでなく、コースの途中どうしもつなげる。1 本目の枠（id・所属・
 * 元 properties）をそのまま使い、2 本目は一覧から取り除く。
 * 分割グループに属していたコースを結合した場合はグループから外す
 * （名前の付け直しはしない。勝手に改名すると追跡できなくなるため）。
 */
export const mergeCourses = (
  courses: EditorCourse[],
  first: MergeAnchor,
  second: MergeAnchor,
  options: MergeCoursesOptions,
  resortName = "",
): EditorCourse[] => {
  if (first.courseId === second.courseId) return courses;
  const firstCourse = courses.find(course => course.id === first.courseId);
  const secondCourse = courses.find(course => course.id === second.courseId);
  if (!firstCourse || !secondCourse) return courses;

  const coordinates = joinLines(
    {
      coordinates: firstCourse.coordinates,
      position: first.position,
      keep: first.keep,
    },
    {
      coordinates: secondCourse.coordinates,
      position: second.position,
      keep: second.keep,
    },
  );
  if (coordinates.length < 2) return courses;

  const detailSource =
    options.detailFrom === "second" ? secondCourse : firstCourse;
  const nextName = options.name.trim();
  const merged: EditorCourse = {
    ...firstCourse,
    name: nextName,
    unnamed: nextName === "" ? firstCourse.unnamed : false,
    coordinates,
    detail: {
      ...detailSource.detail,
      searchWord: updateDefaultSearchWord(
        detailSource.detail.searchWord,
        resortName,
        detailSource.name,
        nextName,
      ),
    },
    detailExtras: detailSource.detailExtras,
    splitGroupId: null,
    splitBaseName: null,
  };

  return dissolveEmptySplitGroups(
    courses.flatMap(course => {
      if (course.id === second.courseId) return [];
      return [course.id === first.courseId ? merged : course];
    }),
  );
};

/** 結合後の既定のコース名。分割サフィックスは落として素の名前へ戻す */
export const suggestMergedName = (
  first: EditorCourse,
  second: EditorCourse,
): string => {
  const firstName = stripSplitSuffixForMerge(first.name).trim();
  if (firstName !== "") return firstName;
  return stripSplitSuffixForMerge(second.name).trim();
};
