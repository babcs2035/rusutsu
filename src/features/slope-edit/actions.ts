"use server";

import {
  hashContent,
  isValidResortId,
  parseSlopeBeforeGeojson,
  parseSlopeDetailEntries,
  readSlopeBeforeRaw,
  readSlopeDetailRaw,
  writeSlopeBeforeGeojson,
} from "./server/slopeFiles";
import type {
  SaveCoursePayload,
  SaveRequest,
  SaveResult,
  SlopeBeforeFeature,
  SlopeSourceData,
} from "./types";

export async function loadSlopeSourceData(
  resortId: string,
): Promise<SlopeSourceData> {
  const [beforeRaw, detailRaw] = await Promise.all([
    readSlopeBeforeRaw(resortId),
    readSlopeDetailRaw(resortId),
  ]);
  return {
    geojson: beforeRaw === null ? null : parseSlopeBeforeGeojson(beforeRaw),
    details: detailRaw === null ? null : parseSlopeDetailEntries(detailRaw),
    fileHash: beforeRaw === null ? null : hashContent(beforeRaw),
    detailFileHash: detailRaw === null ? null : hashContent(detailRaw),
  };
}

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

const validateSaveRequest = (request: SaveRequest): string[] => {
  const errors: string[] = [];
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

export async function saveSlopeEdits(
  request: SaveRequest,
): Promise<SaveResult> {
  const errors = validateSaveRequest(request);
  if (errors.length > 0) return { ok: false, errors };

  const [currentBeforeRaw, currentDetailRaw] = await Promise.all([
    readSlopeBeforeRaw(request.resortId),
    readSlopeDetailRaw(request.resortId),
  ]);
  const currentBeforeHash =
    currentBeforeRaw === null ? null : hashContent(currentBeforeRaw);
  const currentDetailHash =
    currentDetailRaw === null ? null : hashContent(currentDetailRaw);
  if (
    currentBeforeHash !== request.fileHash ||
    currentDetailHash !== request.detailFileHash
  ) {
    return {
      ok: false,
      errors: [
        "読み込み後に slope_before または slope_detail が変更されています。ページを再読み込みして、最新のデータから編集し直してください。",
      ],
    };
  }

  const features: SlopeBeforeFeature[] = [
    ...request.courses.map(course => ({
      type: "Feature" as const,
      properties: course.properties,
      geometry: {
        type: "LineString",
        coordinates: course.coordinates,
      },
    })),
    ...request.preservedFeatures,
  ];
  await writeSlopeBeforeGeojson(request.resortId, {
    type: "FeatureCollection",
    features,
  });

  return {
    ok: true,
    writtenFiles: [`slope_before/${request.resortId}.geojson`],
  };
}
