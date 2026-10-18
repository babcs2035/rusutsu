import type { Prisma } from "@prisma/client";
import { createCourseStatusSummary } from "@/lib/courseStatusSummary";
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
import { combineLatestStatuses } from "@/lib/linkedAreaStatus";
import { prisma } from "@/lib/prisma";
import { adjustCourseName } from "@/lib/resortMapMerge";
import { entityFeature, record } from "./canonicalCodec";
import { canonicalMapsEnabled } from "./canonicalDocuments";
import { readLegacyOperationStatus } from "./legacyStatus";

export async function findCanonicalResortMap(
  tx: Prisma.TransactionClient,
  resortId: string,
): Promise<{ enabled: boolean; data: FinalizedResortMapData | null }> {
  if (!(await canonicalMapsEnabled(tx))) return { enabled: false, data: null };
  const courses = await tx.mapCourse.findMany({
    where: { resortId, archivedAt: null, geometryType: "LineString" },
    orderBy: [{ sourceKind: "asc" }, { sourceIndex: "asc" }],
  });
  const lifts = await tx.mapLift.findMany({
    where: { resortId, archivedAt: null, geometryType: "LineString" },
    orderBy: { sourceIndex: "asc" },
  });
  const projected = (
    row: (typeof courses)[number] | (typeof lifts)[number],
  ) => {
    const base = entityFeature(row);
    const derived = row.derivedIndex === null ? null : entityFeature(row, true);
    return {
      ...base,
      geometry: derived?.geometry ?? base.geometry,
      properties: {
        ...base.properties,
        ...derived?.properties,
        name: adjustCourseName(row.name ?? "名前不明"),
        source_name: row.name,
        status: row.status,
        update: row.officialUpdatedAt,
        latest_note: row.latestNote,
        latest_status_name: row.statusName,
        status_mapping_names: row.crawledNames,
      },
    };
  };
  const courseFeatures = courses
    .map((row, index) =>
      normalizeCourseFeature(
        projected(row),
        index,
        row.sourceKind === "osm" ? "unverified" : "verified",
        row.statusSourceUrls,
      ),
    )
    .filter((feature): feature is FinalizedCourseFeature => feature !== null);
  const liftFeatures = lifts
    .map((row, index) => normalizeLiftFeature(projected(row), index))
    .filter((feature): feature is FinalizedLiftFeature => feature !== null);
  const latest = (rows: Array<{ statusObservedAt: Date | null }>) =>
    rows.reduce<string | null>(
      (time, row) =>
        row.statusObservedAt &&
        (!time || row.statusObservedAt.toISOString() > time)
          ? row.statusObservedAt.toISOString()
          : time,
      null,
    );
  const urls = (rows: Array<{ statusSourceUrls: string[] }>) => [
    ...new Set(rows.flatMap(row => row.statusSourceUrls)),
  ];
  const members = await tx.skiResort.findMany({
    where: { mergedIntoId: resortId, mergedInto: { linkKind: "LINKED" } },
    select: { id: true, nameJa: true },
  });
  const sourceIds = members.length
    ? members.map(member => member.id)
    : [resortId];
  const currents = await tx.crawlLatestCurrent.findMany({
    where: { skiResortId: { in: sourceIds }, kind: "COURSES" },
    include: {
      snapshot: { include: { run: { select: { observedAt: true } } } },
    },
  });
  const captures = await Promise.all(
    sourceIds.map(async id => {
      const snapshot = currents.find(
        current => current.skiResortId === id,
      )?.snapshot;
      return snapshot
        ? {
            fileName: snapshot.id,
            time: snapshot.run.observedAt.toISOString(),
            sourceUrls: snapshot.sourceUrls,
            items: Array.isArray(snapshot.data)
              ? snapshot.data.map(record)
              : [],
          }
        : readLegacyOperationStatus(id, "courses");
    }),
  );
  const courseStatus = combineLatestStatuses(
    captures,
    sourceIds.map(id => members.find(member => member.id === id)?.nameJa),
  );
  const courseStatusSummary = createCourseStatusSummary(
    courseStatus,
    courseFeatures.map(feature => feature.latestStatusName),
    courses.some(row => row.crawledNames.length > 0),
  );
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
          sourceUrls: urls(courses),
          observedAt: latest(courses),
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
          sourceUrls: urls(lifts),
          observedAt: latest(lifts),
          features: liftFeatures,
        }
      : null,
    courseStatusSummary,
  };
  return {
    enabled: true,
    data: data.courses || data.lifts || courseStatusSummary ? data : null,
  };
}
export async function readCanonicalResortMap(resortId: string) {
  if (!usesRemoteDataApi()) return readCanonicalResortMapDirect(resortId);
  try {
    const response = await fetchInternalDataApi(
      `/api/internal/v1/resort-map?resortId=${encodeURIComponent(resortId)}`,
    );
    return (await response.json()) as {
      enabled: boolean;
      data: FinalizedResortMapData | null;
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
