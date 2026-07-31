import {
  JAPAN_BOUNDS,
  REQUIRED_COURSE_FIELD_LABELS,
  REQUIRED_COURSE_FIELDS,
} from "../constants";
import type { EditorCourse, LngLat, ValidationResult } from "../types";

const isFiniteLngLat = (coordinate: LngLat): boolean =>
  Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]);

const isInsideJapan = (coordinate: LngLat): boolean =>
  coordinate[0] >= JAPAN_BOUNDS.minLng &&
  coordinate[0] <= JAPAN_BOUNDS.maxLng &&
  coordinate[1] >= JAPAN_BOUNDS.minLat &&
  coordinate[1] <= JAPAN_BOUNDS.maxLat;

// 座標が [latitude, longitude] の順で入っている疑いがあるか
const looksLatLngSwapped = (coordinate: LngLat): boolean =>
  !isInsideJapan(coordinate) && isInsideJapan([coordinate[1], coordinate[0]]);

export const courseDisplayName = (
  course: EditorCourse,
  index: number,
): string => {
  if (course.name !== "") return course.name;
  if (course.unnamed) return `無名コース（${index + 1}番目）`;
  return `名前未入力のコース（${index + 1}番目）`;
};

export const getEmptyRequiredCourseFields = (
  course: EditorCourse,
): Array<(typeof REQUIRED_COURSE_FIELDS)[number]> =>
  REQUIRED_COURSE_FIELDS.filter(key => {
    const value = key === "name" ? course.name : course.detail[key];
    return value.trim() === "";
  });

// Step 2 → Step 3 へ進む前のバリデーション
export const validateCourses = (
  courses: EditorCourse[],
  includeRequiredWarnings = false,
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (courses.length === 0) {
    errors.push(
      "コースが 1 本もありません。地図上でコース線を作成してください。",
    );
    return { errors, warnings };
  }

  courses.forEach((course, index) => {
    const label = courseDisplayName(course, index);

    if (course.coordinates.length < 2) {
      errors.push(
        `「${label}」の点が ${course.coordinates.length} 個しかありません。2 点以上打ってください。`,
      );
    }
    if (course.name === "" && !course.unnamed) {
      errors.push(
        `「${label}」のコース名が未入力です。名前を入力するか「名前なし」を選んでください。`,
      );
    }
    const emptyFields = getEmptyRequiredCourseFields(course);
    if (includeRequiredWarnings && emptyFields.length > 0) {
      warnings.push(
        `「${label}」の ${emptyFields
          .map(key => REQUIRED_COURSE_FIELD_LABELS[key])
          .join("、")} が未入力です。`,
      );
    }
    if (course.coordinates.some(coordinate => !isFiniteLngLat(coordinate))) {
      errors.push(`「${label}」に不正な座標が含まれています。`);
      return;
    }
    if (course.coordinates.some(looksLatLngSwapped)) {
      warnings.push(
        `「${label}」の座標が [経度, 緯度] の順になっていない可能性があります（緯度経度が逆かもしれません）。`,
      );
    } else if (
      course.coordinates.some(coordinate => !isInsideJapan(coordinate))
    ) {
      warnings.push(
        `「${label}」に日本周辺から明らかに外れた座標が含まれています。`,
      );
    }
  });

  return { errors, warnings };
};
