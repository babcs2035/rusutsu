import {
  type Grooming,
  RECOMMENDATION,
  type RecommendationCandidate,
  rankCourses,
} from "@/features/course-recommendations/algorithm";
import type { SelectedMapFeature } from "@/features/map/types";
import { prisma } from "@/lib/prisma";

export async function recommendCoursesDirect(
  resortId: string,
  selected: SelectedMapFeature,
  favoriteIds: string[],
) {
  if (selected.kind !== "course" || !favoriteIds.length) return [];
  const resorts = await prisma.skiResort.findMany({
    where: { id: { in: [...new Set([resortId, ...favoriteIds])] } },
    select: {
      id: true,
      nameJa: true,
      mergedIntoId: true,
      sourceResortIds: true,
      isActive: true,
      mergedInto: {
        select: { id: true, linkKind: true, sourceResortIds: true },
      },
    },
  });
  const canonical = (r: (typeof resorts)[number]) =>
    r.mergedInto?.linkKind === "LINKED" ? r.mergedInto.id : r.id;
  const sourceResort = resorts.find(r => r.id === resortId);
  if (!sourceResort) return [];
  const sourceId = canonical(sourceResort);
  const sourceMembers = new Set([
    resortId,
    sourceId,
    ...sourceResort.sourceResortIds,
    ...(sourceResort.mergedInto?.sourceResortIds ?? []),
  ]);
  const candidates = resorts.filter(
    r =>
      favoriteIds.includes(r.id) &&
      r.isActive &&
      ![
        r.id,
        canonical(r),
        ...r.sourceResortIds,
        ...(r.mergedInto?.sourceResortIds ?? []),
      ].some(id => sourceMembers.has(id)),
  );
  const byCanonical = new Map<string, (typeof resorts)[number]>();
  for (const r of candidates.sort((a, b) => a.id.localeCompare(b.id, "en")))
    if (!byCanonical.has(canonical(r))) byCanonical.set(canonical(r), r);
  const rows = await prisma.courseRecommendationFeature.findMany({
    where: {
      resortId: { in: [sourceId, ...byCanonical.keys()] },
      calculationVersion: RECOMMENDATION.version,
    },
  });
  const convert = (row: (typeof rows)[number]): RecommendationCandidate => ({
    ...row,
    shape: row.shape as "normal" | "winding",
    grooming: row.grooming as Grooming,
    resortName: byCanonical.get(row.resortId)?.nameJa ?? sourceResort.nameJa,
  });
  // Never fall back from a non-main route selection to the group's main route.
  const source = rows.find(
    row =>
      row.resortId === sourceId &&
      (selected.routeId
        ? row.routeKey === selected.routeId
        : row.groupId === selected.id || row.courseIds.includes(selected.id)),
  );
  if (
    !source ||
    (!selected.routeId && source.routeKey && source.groupId === selected.id)
  )
    return [];
  const results = rankCourses(
    convert(source),
    rows.filter(row => row.resortId !== sourceId).map(convert),
  );
  return results.map(row => {
    const visible = byCanonical.get(row.resortId);
    return {
      resortId: visible?.id ?? row.resortId,
      resortName: row.resortName,
      key: row.key,
      name: row.name,
      distance: row.distance,
      meanSlope: row.meanSlope,
      score: row.score,
      slopeDifference: row.slopeDifference,
      lengthDifference: row.lengthDifference,
      selected: {
        kind: "course" as const,
        id: row.groupId,
        ...(row.routeKey ? { routeId: row.routeKey } : {}),
      },
    };
  });
}
export type CourseRecommendation = Awaited<
  ReturnType<typeof recommendCoursesDirect>
>[number];
