import type { Prisma } from "@prisma/client";
import { createMapCourseStatusSummary } from "@/features/resort-detail/utils/courseStatusSummary";
import {
  applyCurrentMapOperations,
  CURRENT_MAP_OPERATION_VERSION,
} from "@/lib/currentMapOperations";
import {
  normalizeCourseFeature,
  normalizeLiftFeature,
} from "@/lib/finalizedResortGeojson";
import type {
  FinalizedCourseFeature,
  FinalizedLiftFeature,
  FinalizedResortMapData,
} from "@/lib/finalizedResortGeojsonShared";
import {
  fetchInternalDataApi,
  InternalDataApiError,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import { toSourceLabels } from "@/lib/latestStatusFiles";
import { prisma } from "@/lib/prisma";
import { adjustCourseName } from "@/lib/resortMapMerge";
import { entityFeature } from "./canonicalCodec";
import { canonicalMapsEnabled } from "./canonicalDocuments";

export async function findCanonicalResortMap(
  tx: Prisma.TransactionClient,
  resortId: string,
): Promise<{
  enabled: boolean;
  data: FinalizedResortMapData | null;
  operationDataVersion?: number;
}> {
  if (!(await canonicalMapsEnabled(tx))) return { enabled: false, data: null };
  const courses = await tx.mapCourse.findMany({
    where: { resortId, archivedAt: null, geometryType: "LineString" },
    orderBy: [{ sourceKind: "asc" }, { sourceIndex: "asc" }],
  });
  const lifts = await tx.mapLift.findMany({
    where: { resortId, archivedAt: null, geometryType: "LineString" },
    orderBy: { sourceIndex: "asc" },
  });
  const adopted = await tx.crawlLatestCurrent.findMany({
    where: { skiResortId: resortId, kind: { in: ["COURSES", "LIFTS"] } },
    select: {
      kind: true,
      snapshotId: true,
      snapshot: {
        select: {
          id: true,
          sourceUrls: true,
          sourceLabels: true,
          run: { select: { observedAt: true } },
        },
      },
    },
  });
  const current = (kind: "COURSES" | "LIFTS") =>
    adopted.find(row => row.kind === kind)?.snapshot;
  const projected = (
    row: (typeof courses)[number] | (typeof lifts)[number],
    kind: "COURSES" | "LIFTS",
  ) => {
    const base = entityFeature(row);
    const derived = row.derivedIndex === null ? null : entityFeature(row, true);
    const snapshot = current(kind);
    // 状態は更新時に反映済み。現在の取得結果と識別子が合う値だけ読める。
    const usable = Boolean(snapshot && row.statusSnapshotId === snapshot.id);
    return {
      ...base,
      geometry: derived?.geometry ?? base.geometry,
      properties: {
        ...base.properties,
        ...derived?.properties,
        name: adjustCourseName(row.name ?? "名前不明"),
        source_name: row.name,
        status: usable ? row.status : null,
        update: usable ? row.officialUpdatedAt : null,
        latest_note: usable ? row.latestNote : null,
        latest_status_name: usable ? row.statusName : null,
        status_snapshot_id: usable ? row.statusSnapshotId : null,
        status_mapping_names: row.crawledNames,
      },
    };
  };
  const courseFeatures = courses
    .map((row, index) =>
      normalizeCourseFeature(
        projected(row, "COURSES"),
        index,
        row.sourceKind === "osm" ? "unverified" : "verified",
        current("COURSES")?.sourceUrls ?? [],
      ),
    )
    .filter((feature): feature is FinalizedCourseFeature => feature !== null);
  const liftFeatures = lifts
    .map((row, index) => normalizeLiftFeature(projected(row, "LIFTS"), index))
    .filter((feature): feature is FinalizedLiftFeature => feature !== null);
  const data: FinalizedResortMapData = {
    courses: courseFeatures.length
      ? {
          source: courses.some(row => row.sourceKind === "osm")
            ? "mixed"
            : courses.every(row => row.elevationReady)
              ? "slope_10m"
              : "slope_before",
          baseSource: "slope_before",
          fileName: `${resortId}.geojson`,
          sourceUrls: current("COURSES")?.sourceUrls ?? [],
          observedAt: current("COURSES")?.run.observedAt.toISOString() ?? null,
          features: courseFeatures,
        }
      : null,
    lifts: liftFeatures.length
      ? {
          source: lifts.every(row => row.elevationReady)
            ? "lift_20m"
            : "lift_before",
          baseSource: "lift_before",
          fileName: `${resortId}.geojson`,
          sourceUrls: current("LIFTS")?.sourceUrls ?? [],
          observedAt: current("LIFTS")?.run.observedAt.toISOString() ?? null,
          features: liftFeatures,
        }
      : null,
  };
  const courseSummary = createMapCourseStatusSummary(data.courses);
  return {
    enabled: true,
    operationDataVersion: CURRENT_MAP_OPERATION_VERSION,
    data:
      data.courses || data.lifts
        ? {
            ...data,
            courseStatusSummary: courseSummary
              ? {
                  ...courseSummary,
                  sourceLabels: toSourceLabels(
                    current("COURSES")?.sourceUrls ?? [],
                    current("COURSES")?.sourceLabels,
                  ),
                }
              : null,
          }
        : null,
  };
}
export async function readCanonicalResortMap(resortId: string) {
  if (!usesRemoteDataApi()) return readCanonicalResortMapDirect(resortId);
  try {
    const response = await fetchInternalDataApi(
      `/api/internal/v1/resort-map?resortId=${encodeURIComponent(resortId)}`,
    );
    const result = (await response.json()) as {
      enabled: boolean;
      data: FinalizedResortMapData | null;
      operationDataVersion?: number;
    };
    if (!result.enabled || !result.data) return result;
    // 同じ版のAPIはトランザクション内で現在値を照合済み。追加通信しない。
    if (result.operationDataVersion === CURRENT_MAP_OPERATION_VERSION)
      return result;
    // APIが旧版でも、地図の保存値へフォールバックさせない。
    const { readCurrentCrawlLatestStatus } = await import(
      "@/lib/crawlLatestCurrent"
    );
    const [courses, lifts] = await Promise.all([
      readCurrentCrawlLatestStatus(resortId, "courses"),
      readCurrentCrawlLatestStatus(resortId, "lifts"),
    ]);
    return {
      ...result,
      data: applyCurrentMapOperations(result.data, { courses, lifts }),
    };
  } catch (error) {
    // The local UI can still read an older data API while the server is upgraded.
    if (error instanceof InternalDataApiError && error.status === 404)
      return { enabled: false, data: null };
    throw error;
  }
}

export const readCanonicalResortMapDirect = (resortId: string) =>
  prisma.$transaction(tx => findCanonicalResortMap(tx, resortId), {
    isolationLevel: "RepeatableRead",
  });
