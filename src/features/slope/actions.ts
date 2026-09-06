"use server";

import { requireAdmin } from "@/lib/requireAdmin";
import { readExistingSkiResortIds } from "@/lib/skiResortData";
import {
  getDataDocument,
  writeDataDocuments,
} from "@/server/data-documents/client";
import { DataDocumentConflictError } from "@/server/data-documents/contract";
import { synchronizeDerivedGeometry } from "@/server/derivedGeometry";
import {
  osmSlope10mDocumentKey,
  parseSlopeBeforeGeojson,
  parseSlopeDetailEntries,
  readSlopeBeforeDocument,
  readSlopeDetailDocument,
  serializeSlopeGeojson,
  slope10mDocumentKey,
  slopeBeforeDocumentKey,
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
  await requireAdmin();
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

  const currentDocument = await readSlopeBeforeDocument(
    request.resortId,
    request.sourceKind,
  );
  const directoryName =
    request.sourceKind === "osm" ? "slope_before_osm" : "slope_before";
  if (currentDocument === null) {
    return {
      ok: false,
      errors: [`${directoryName}/${request.resortId}.geojson がありません。`],
    };
  }
  if (currentDocument.hash !== request.fileHash) {
    return {
      ok: false,
      errors: [
        `読み込み後に ${directoryName} が変更されています。ページを再読み込みして、最新のデータから並べ替えてください。`,
      ],
    };
  }

  const currentRaw = currentDocument.content;
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
  const derivedKey =
    request.sourceKind === "osm"
      ? osmSlope10mDocumentKey(request.resortId)
      : slope10mDocumentKey(request.resortId);
  const derivedDocument = await getDataDocument(derivedKey);
  const existingDerived = derivedDocument
    ? parseSlopeBeforeGeojson(derivedDocument.content)
    : null;
  const synchronizedDerived = synchronizeDerivedGeometry({
    previousBefore: geojson,
    nextBefore: reordered,
    existingDerived,
    intervalM: 10,
    kind: "slope",
  });
  let writtenHash: string;
  try {
    const beforeKey = slopeBeforeDocumentKey(
      request.resortId,
      request.sourceKind,
    );
    const written = await writeDataDocuments([
      {
        key: beforeKey,
        content: serializeSlopeGeojson(reordered),
        mediaType: "application/geo+json",
        expectedHash: request.fileHash,
      },
      {
        key: derivedKey,
        content: serializeSlopeGeojson(synchronizedDerived),
        mediaType: "application/geo+json",
        expectedHash: derivedDocument?.hash ?? null,
      },
    ]);
    const writtenBefore = written.find(document => document.key === beforeKey);
    if (!writtenBefore) {
      throw new Error("slope_before の並べ替え結果がありません。");
    }
    writtenHash = writtenBefore.hash;
  } catch (error) {
    if (error instanceof DataDocumentConflictError) {
      return {
        ok: false,
        errors: [
          `読み込み後に ${directoryName} または公開用GeoJSONが変更されています。ページを再読み込みして、最新のデータから並べ替えてください。`,
        ],
      };
    }
    throw error;
  }

  return {
    ok: true,
    fileHash: writtenHash,
    writtenFile: `${directoryName}/${request.resortId}.geojson`,
  };
}

export async function loadSlopeSourceData(
  resortId: string,
  sourceKind: SaveRequest["sourceKind"] = "curated",
): Promise<SlopeSourceData> {
  await requireAdmin();
  const [beforeDocument, detailDocument] = await Promise.all([
    readSlopeBeforeDocument(resortId, sourceKind),
    sourceKind === "curated" ? readSlopeDetailDocument(resortId) : null,
  ]);
  const beforeRaw = beforeDocument?.content ?? null;
  const detailRaw = detailDocument?.content ?? null;
  return {
    sourceKind,
    geojson: beforeRaw === null ? null : parseSlopeBeforeGeojson(beforeRaw),
    details: detailRaw === null ? null : parseSlopeDetailEntries(detailRaw),
    fileHash: beforeDocument?.hash ?? null,
    detailFileHash: detailDocument?.hash ?? null,
  };
}

export async function saveSlopeEdits(
  request: SaveRequest,
): Promise<SaveResult> {
  await requireAdmin();
  const errors = validateSaveRequest(request);
  if (errors.length > 0) return { ok: false, errors };

  const requestedResortIds = [
    ...new Set([
      request.resortId,
      ...request.courses.map(course => course.targetSkiId),
    ]),
  ];
  const existingResortIds = new Set(
    await readExistingSkiResortIds(requestedResortIds),
  );
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

  const [currentBeforeDocument, currentDetailDocument] = await Promise.all([
    readSlopeBeforeDocument(request.resortId, request.sourceKind),
    request.sourceKind === "curated"
      ? readSlopeDetailDocument(request.resortId)
      : null,
  ]);
  const currentBeforeHash = currentBeforeDocument?.hash ?? null;
  const currentDetailHash = currentDetailDocument?.hash ?? null;
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
    expectedHash: string | null;
    previousGeojson: ReturnType<typeof parseSlopeBeforeGeojson>;
  }> = [
    {
      resortId: request.resortId,
      features: sourceFeatures,
      expectedHash: currentBeforeHash,
      previousGeojson: currentBeforeDocument
        ? parseSlopeBeforeGeojson(currentBeforeDocument.content)
        : null,
    },
  ];

  for (const [targetId, movedFeatures] of movedByTarget) {
    const targetDocument = await readSlopeBeforeDocument(
      targetId,
      request.sourceKind,
    );
    const targetRaw = targetDocument?.content ?? null;
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
      expectedHash: targetDocument?.hash ?? null,
      previousGeojson: targetGeojson,
    });
  }

  const proposedGeojson = writes.map(write => ({
    ...write,
    geojson: {
      type: "FeatureCollection" as const,
      features: write.features,
    },
  }));
  const derivedDocuments = await Promise.all(
    proposedGeojson.map(async write => {
      const key =
        request.sourceKind === "osm"
          ? osmSlope10mDocumentKey(write.resortId)
          : slope10mDocumentKey(write.resortId);
      const current = await getDataDocument(key);
      return {
        key,
        current,
        geojson: synchronizeDerivedGeometry({
          previousBefore: write.previousGeojson,
          nextBefore: write.geojson,
          existingDerived: current
            ? parseSlopeBeforeGeojson(current.content)
            : null,
          intervalM: 10,
          kind: "slope",
        }),
      };
    }),
  );

  try {
    await writeDataDocuments([
      ...proposedGeojson.map(write => ({
        key: slopeBeforeDocumentKey(write.resortId, request.sourceKind),
        content: serializeSlopeGeojson(write.geojson),
        mediaType: "application/geo+json",
        expectedHash: write.expectedHash,
      })),
      ...derivedDocuments.map(document => ({
        key: document.key,
        content: serializeSlopeGeojson(document.geojson),
        mediaType: "application/geo+json",
        expectedHash: document.current?.hash ?? null,
      })),
    ]);
  } catch (error) {
    if (error instanceof DataDocumentConflictError) {
      return {
        ok: false,
        errors: [
          `読み込み後に ${request.sourceKind === "osm" ? "slope_before_osm" : "slope_before または slope_detail"} か公開用GeoJSONが変更されています。ページを再読み込みして、最新のデータから編集し直してください。`,
        ],
      };
    }
    throw error;
  }

  return {
    ok: true,
    writtenFiles: writes.flatMap(write => [
      `${request.sourceKind === "osm" ? "slope_before_osm" : "slope_before"}/${write.resortId}.geojson`,
      `${request.sourceKind === "osm" ? "slope_10m_osm" : "slope_10m"}/${write.resortId}.geojson`,
    ]),
  };
}
