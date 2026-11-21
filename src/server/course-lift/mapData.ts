import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { createMapCourseStatusSummary } from "@/features/resort-detail/utils/courseStatusSummary";
import { CURRENT_MAP_OPERATION_VERSION } from "@/lib/currentMapOperations";
import {
  normalizeCourseFeature,
  normalizeLiftFeature,
} from "@/lib/finalizedMapFeatures";
import type {
  FinalizedCourseFeature,
  FinalizedLiftFeature,
  FinalizedResortMapData,
} from "@/lib/finalizedResortGeojsonShared";
import {
  fetchInternalDataApi,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import { toSourceLabels } from "@/lib/latestStatusFiles";
import { prisma } from "@/lib/prisma";
import { adjustCourseName } from "@/lib/resortMapMerge";
import { entityFeature } from "./canonicalCodec";
import { canonicalMapsEnabled } from "./canonicalDocuments";

/** 地図と revision を同じ読み取りスナップショットから返す． */
async function findCanonicalResortMap(
  tx: Prisma.TransactionClient,
  resortId: string,
): Promise<{
  enabled: boolean;
  data: FinalizedResortMapData | null;
  operationDataVersion?: number;
  revision?: string;
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
  const revision = await buildCanonicalResortMapRevision(tx, resortId, adopted);
  return {
    enabled: true,
    operationDataVersion: CURRENT_MAP_OPERATION_VERSION,
    revision,
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

const CANONICAL_RESORT_MAP_DOCUMENT_FOLDERS = [
  "slope_before",
  "slope_10m",
  "slope_before_osm",
  "slope_10m_osm",
  "lift_before",
  "lift_20m",
  "slope_detail",
  "lift_detail",
  "latest_status_mapping",
] as const;
const RESORT_MAP_REVISION_RESPONSE = z.strictObject({
  enabled: z.boolean(),
  revision: z.string(),
});

/** 地図と照合要求で同じ順序の識別子を使い，応答を固定長にする． */
async function buildCanonicalResortMapRevision(
  tx: Prisma.TransactionClient,
  resortId: string,
  adopted: readonly { kind: string; snapshotId: string }[],
): Promise<string> {
  const keys = CANONICAL_RESORT_MAP_DOCUMENT_FOLDERS.map(
    folder =>
      `resorts-temporary/${folder}/${resortId}.${folder.endsWith("_detail") || folder === "latest_status_mapping" ? "json" : "geojson"}`,
  );
  const documents = await tx.mapDocumentState.findMany({
    where: { key: { in: keys } },
    select: { key: true, hash: true, version: true },
    orderBy: { key: "asc" },
  });
  const currents = adopted
    .map(({ kind, snapshotId }) => ({ kind, snapshotId }))
    .sort((left, right) => left.kind.localeCompare(right.kind));
  return createHash("sha256")
    .update(
      JSON.stringify({
        operationDataVersion: CURRENT_MAP_OPERATION_VERSION,
        documents,
        currents,
      }),
    )
    .digest("hex");
}

/** 本文を取得せずに canonical map の版を照合する． */
async function findCanonicalResortMapRevision(
  tx: Prisma.TransactionClient,
  resortId: string,
): Promise<{ enabled: boolean; revision: string }> {
  if (!(await canonicalMapsEnabled(tx)))
    return { enabled: false, revision: "" };
  const adopted = await tx.crawlLatestCurrent.findMany({
    where: { skiResortId: resortId, kind: { in: ["COURSES", "LIFTS"] } },
    select: { kind: true, snapshotId: true },
  });
  return {
    enabled: true,
    revision: await buildCanonicalResortMapRevision(tx, resortId, adopted),
  };
}

export async function readCanonicalResortMapRevision(resortId: string) {
  if (!usesRemoteDataApi())
    return readCanonicalResortMapRevisionDirect(resortId);
  const query = new URLSearchParams({ resortId, view: "revision" });
  const response = await fetchInternalDataApi(
    `/api/admin/maps/resorts?${query}`,
  );
  return RESORT_MAP_REVISION_RESPONSE.parse(await response.json());
}

export const readCanonicalResortMapRevisionDirect = (resortId: string) =>
  prisma.$transaction(tx => findCanonicalResortMapRevision(tx, resortId), {
    isolationLevel: "RepeatableRead",
  });

export async function readCanonicalResortMap(resortId: string) {
  if (!usesRemoteDataApi()) return readCanonicalResortMapDirect(resortId);
  const response = await fetchInternalDataApi(
    `/api/admin/maps/resorts?resortId=${encodeURIComponent(resortId)}`,
  );
  const result = (await response.json()) as {
    enabled: boolean;
    data: FinalizedResortMapData | null;
    operationDataVersion?: number;
    revision?: string;
  };
  if (!result.enabled || !result.data) return result;
  if (
    result.operationDataVersion !== CURRENT_MAP_OPERATION_VERSION ||
    typeof result.revision !== "string"
  )
    throw new Error("Remote canonical map API version is incompatible");
  return result;
}

export const readCanonicalResortMapDirect = (resortId: string) =>
  prisma.$transaction(tx => findCanonicalResortMap(tx, resortId), {
    isolationLevel: "RepeatableRead",
  });
