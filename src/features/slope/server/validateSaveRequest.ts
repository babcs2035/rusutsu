import type { SaveCoursePayload, SaveRequest } from "../types";
import { isValidResortId } from "./slopeFiles";

const isFinitePair = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1]);

const courseLabel = (course: SaveCoursePayload, index: number): string => {
  const name = course.properties.name;
  return typeof name === "string" && name !== ""
    ? `「${name}」`
    : `${index + 1} 番目のコース`;
};

export const validateSaveRequest = (request: SaveRequest): string[] => {
  const errors: string[] = [];
  if (request.sourceKind !== "curated" && request.sourceKind !== "osm") {
    errors.push("保存元データの種類が不正です。");
  }
  if (!isValidResortId(request.resortId)) {
    errors.push(`不正なスキー場IDです: ${request.resortId}`);
  }
  if (!Array.isArray(request.courses) || request.courses.length === 0) {
    errors.push("コースデータがありません。");
    return errors;
  }
  if (!Array.isArray(request.preservedFeatures)) {
    errors.push("保持対象 feature の形式が不正です。");
  }
  if (!Array.isArray(request.preservedDetails)) {
    errors.push("保持対象の詳細情報の形式が不正です。");
  }

  request.courses.forEach((course, index) => {
    const label = courseLabel(course, index);
    if (
      course.properties === null ||
      typeof course.properties !== "object" ||
      Array.isArray(course.properties)
    ) {
      errors.push(`${label}: properties の形式が不正です。`);
    }
    if (!isValidResortId(course.targetSkiId)) {
      errors.push(
        `${label}: 所属スキー場IDが不正です（${course.targetSkiId}）。`,
      );
    }
    if (
      request.sourceKind === "curated" &&
      course.targetSkiId !== request.resortId
    ) {
      errors.push(
        `${label}: 確認済みデータは別スキー場へ移動できません。OSMデータの所属変更画面を使用してください。`,
      );
    }
    if (
      !Array.isArray(course.coordinates) ||
      course.coordinates.length < 2 ||
      course.coordinates.some(pair => !isFinitePair(pair))
    ) {
      errors.push(
        `${label}: 座標が不正です（2 点以上の [経度, 緯度] が必要）。`,
      );
    }
    if (
      course.detail === null ||
      typeof course.detail !== "object" ||
      Array.isArray(course.detail)
    ) {
      errors.push(`${label}: 詳細情報の形式が不正です。`);
    }
  });
  return errors;
};
