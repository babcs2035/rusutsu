"use server";

import { prisma } from "@/lib/prisma";
import { queueElevationSync } from "./server/elevationSync";
import { syncOsmSlope10m } from "./server/osmSlopeSampling";
import {
  hashContent,
  parseSlopeBeforeGeojson,
  parseSlopeDetailEntries,
  readSlopeBeforeRaw,
  readSlopeDetailRaw,
  writeSlopeBeforeGeojson,
} from "./server/slopeFiles";
import { validateSaveRequest } from "./server/validateSaveRequest";
import type {
  ApplySlopeFeatureOrderRequest,
  ApplySlopeFeatureOrderResult,
  SaveCoursePayload,
  SaveRequest,
  SaveResult,
  SlopeBeforeFeature,
  SlopeSourceData,
} from "./types";
import { reorderItemsByNameOrder } from "./utils/courseOrder";

export async function applySlopeFeatureOrder(
  request: ApplySlopeFeatureOrderRequest,
): Promise<ApplySlopeFeatureOrderResult> {
  if (request.sourceKind !== "curated" && request.sourceKind !== "osm") {
    return { ok: false, errors: ["不正なコース線の種別です。"] };
  }

  const orderedNames = [
    ...new Set(
      request.orderedGeojsonNames.map(name => name.trim()).filter(Boolean),
    ),
  ];
  if (orderedNames.length === 0) {
    return { ok: false, errors: ["並べ替えるコース線がありません。"] };
  }

  const currentRaw = await readSlopeBeforeRaw(
    request.resortId,
    request.sourceKind,
  );
  const directoryName =
    request.sourceKind === "osm" ? "slope_before_osm" : "slope_before";
  if (currentRaw === null) {
    return {
      ok: false,
      errors: [`${directoryName}/${request.resortId}.geojson がありません。`],
    };
  }
  if (hashContent(currentRaw) !== request.fileHash) {
    return {
      ok: false,
      errors: [
        `読み込み後に ${directoryName} が変更されています。ページを再読み込みして、最新のデータから並べ替えてください。`,
      ],
    };
  }

  const geojson = parseSlopeBeforeGeojson(currentRaw);
  if (!geojson) {
    return { ok: false, errors: ["コース線GeoJSONを解析できませんでした。"] };
  }
  const reordered = {
    ...geojson,
    features: reorderItemsByNameOrder(
      geojson.features,
      orderedNames,
      feature => feature.properties?.name,
    ),
  };
  await writeSlopeBeforeGeojson(
    request.resortId,
    reordered,
    request.sourceKind,
  );
  const writtenRaw = await readSlopeBeforeRaw(
    request.resortId,
    request.sourceKind,
  );
  if (writtenRaw === null) {
    return { ok: false, errors: ["並べ替え結果を読み直せませんでした。"] };
  }

  return {
    ok: true,
    fileHash: hashContent(writtenRaw),
    writtenFile: `${directoryName}/${request.resortId}.geojson`,
  };
}

export async function loadSlopeSourceData(
  resortId: string,
  sourceKind: SaveRequest["sourceKind"] = "curated",
): Promise<SlopeSourceData> {
  const [beforeRaw, detailRaw] = await Promise.all([
    readSlopeBeforeRaw(resortId, sourceKind),
    sourceKind === "curated" ? readSlopeDetailRaw(resortId) : null,
  ]);
  return {
    sourceKind,
    geojson: beforeRaw === null ? null : parseSlopeBeforeGeojson(beforeRaw),
    details: detailRaw === null ? null : parseSlopeDetailEntries(detailRaw),
    fileHash: beforeRaw === null ? null : hashContent(beforeRaw),
    detailFileHash: detailRaw === null ? null : hashContent(detailRaw),
  };
}

// 保存前の slope_before から、コース名ごとの座標をスナップショットしておく。
// 保存後の座標と突き合わせて、実際に線が変わったコースだけを特定するため。
const buildCoordinatesByName = (
  geojson: SlopeSourceData["geojson"],
): Map<string, string> => {
  const coordinatesByName = new Map<string, string>();
  for (const feature of geojson?.features ?? []) {
    const name = feature.properties?.name;
    if (typeof name !== "string" || name === "") continue;
    if (feature.geometry?.type !== "LineString") continue;
    coordinatesByName.set(name, JSON.stringify(feature.geometry.coordinates));
  }
  return coordinatesByName;
};

// 新規追加、または座標が変化したコース名のみを返す（プロパティのみの変更は対象外）。
const findChangedCourseNames = (
  courses: SaveCoursePayload[],
  previousCoordinatesByName: Map<string, string>,
): string[] => {
  const changed = new Set<string>();
  for (const course of courses) {
    const name = course.properties.name;
    if (typeof name !== "string" || name === "") continue;
    const previous = previousCoordinatesByName.get(name);
    const current = JSON.stringify(course.coordinates);
    if (previous !== current) changed.add(name);
  }
  return [...changed];
};

export async function saveSlopeEdits(
  request: SaveRequest,
): Promise<SaveResult> {
  const errors = validateSaveRequest(request);
  if (errors.length > 0) return { ok: false, errors };

  const requestedResortIds = [
    ...new Set([
      request.resortId,
      ...request.courses.map(course => course.targetSkiId),
    ]),
  ];
  const existingResorts = await prisma.skiResort.findMany({
    where: { id: { in: requestedResortIds } },
    select: { id: true },
  });
  const existingResortIds = new Set(existingResorts.map(resort => resort.id));
  const missingResortIds = requestedResortIds.filter(
    resortId => !existingResortIds.has(resortId),
  );
  if (missingResortIds.length > 0) {
    return {
      ok: false,
      errors: [
        `存在しないスキー場IDが含まれています: ${missingResortIds.join(", ")}`,
      ],
    };
  }

  const [currentBeforeRaw, currentDetailRaw] = await Promise.all([
    readSlopeBeforeRaw(request.resortId, request.sourceKind),
    request.sourceKind === "curated"
      ? readSlopeDetailRaw(request.resortId)
      : null,
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
        `読み込み後に ${request.sourceKind === "osm" ? "slope_before_osm" : "slope_before または slope_detail"} が変更されています。ページを再読み込みして、最新のデータから編集し直してください。`,
      ],
    };
  }

  // 標高再計算をそのコースだけに絞り込むため、書き換え前の座標を控えておく。
  const previousCoordinatesByName = buildCoordinatesByName(
    currentBeforeRaw === null
      ? null
      : parseSlopeBeforeGeojson(currentBeforeRaw),
  );

  const toFeature = (course: SaveCoursePayload): SlopeBeforeFeature => ({
    type: "Feature",
    properties: { ...course.properties, resort: course.targetSkiId },
    geometry: {
      type: "LineString",
      coordinates: course.coordinates,
    },
  });

  const sourceFeatures: SlopeBeforeFeature[] = [];
  const movedByTarget = new Map<string, SlopeBeforeFeature[]>();
  for (const course of request.courses) {
    const feature = toFeature(course);
    if (course.targetSkiId === request.resortId) {
      sourceFeatures.push(feature);
      continue;
    }
    const targetFeatures = movedByTarget.get(course.targetSkiId) ?? [];
    targetFeatures.push(feature);
    movedByTarget.set(course.targetSkiId, targetFeatures);
  }
  sourceFeatures.push(...request.preservedFeatures);

  const writes: Array<{
    resortId: string;
    features: SlopeBeforeFeature[];
  }> = [{ resortId: request.resortId, features: sourceFeatures }];

  for (const [targetId, movedFeatures] of movedByTarget) {
    const targetRaw = await readSlopeBeforeRaw(targetId, request.sourceKind);
    const targetGeojson =
      targetRaw === null ? null : parseSlopeBeforeGeojson(targetRaw);
    if (targetRaw !== null && targetGeojson === null) {
      return {
        ok: false,
        errors: [
          `移動先 ${targetId} の slope_before_osm を解析できないため保存を中止しました。`,
        ],
      };
    }
    const movedOsmIds = new Set(
      movedFeatures.flatMap(feature => {
        const id = feature.properties?.["@id"];
        return typeof id === "string" && id.startsWith("way/") ? [id] : [];
      }),
    );
    const targetFeatures = (targetGeojson?.features ?? []).filter(feature => {
      const id = feature.properties?.["@id"];
      return !(typeof id === "string" && movedOsmIds.has(id));
    });
    writes.push({
      resortId: targetId,
      features: [...targetFeatures, ...movedFeatures],
    });
  }

  for (const write of writes) {
    await writeSlopeBeforeGeojson(
      write.resortId,
      { type: "FeatureCollection", features: write.features },
      request.sourceKind,
    );
  }

  // 保存自体の完了は待たせず、新規追加・線を編集したコースだけを対象に
  // 国土地理院APIでの標高計算（distance_10m_update.py）を裏で走らせる。
  if (request.sourceKind === "osm") {
    await Promise.all(writes.map(write => syncOsmSlope10m(write.resortId)));
  } else {
    queueElevationSync(
      request.resortId,
      findChangedCourseNames(request.courses, previousCoordinatesByName),
    );
  }

  return {
    ok: true,
    writtenFiles: writes.flatMap(write => [
      `${request.sourceKind === "osm" ? "slope_before_osm" : "slope_before"}/${write.resortId}.geojson`,
      ...(request.sourceKind === "osm"
        ? [`slope_10m_osm/${write.resortId}.geojson`]
        : []),
    ]),
  };
}
