import {
  type Grooming,
  groomingCompatible,
  RECOMMENDATION,
  type RecommendationCandidate,
  rankCourses,
} from "@/features/course-recommendations/algorithm";
import type { SelectedMapFeature } from "@/features/map/types";
import { prisma } from "@/lib/prisma";
import { getResortLabelName } from "@/lib/resortAliases";

type Unavailable =
  | "no_favorites"
  | "source_unavailable"
  | "no_other_favorites"
  | "candidates_unavailable";

/** Two indexed reads for the whole resort, not one query per selected course. */
async function loadRecommendationPool(resortId: string, favoriteIds: string[]) {
  if (!favoriteIds.length) return { status: "no_favorites" as const };
  const resorts = await prisma.skiResort.findMany({
    where: { id: { in: [...new Set([resortId, ...favoriteIds])] } },
    select: {
      id: true,
      nameJa: true,
      shortName: true,
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
  if (!sourceResort) return { status: "source_unavailable" as const };
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
  if (!byCanonical.size) return { status: "no_other_favorites" as const };
  const stored = await prisma.courseRecommendationFeature.findMany({
    where: {
      resortId: { in: [sourceId, ...byCanonical.keys()] },
      calculationVersion: RECOMMENDATION.version,
    },
  });
  // Missing metrics are never interpreted as flat terrain.
  const rows = stored.filter(
    row =>
      row.steepSlope !== null &&
      Number.isFinite(row.steepSlope) &&
      row.steepDistance !== null &&
      Number.isFinite(row.steepDistance),
  );
  // 地図のラベルと同じ省略名にする
  const labelName = (r: (typeof resorts)[number]) =>
    getResortLabelName(r.id, r.nameJa, r.shortName);
  const convert = (row: (typeof rows)[number]): RecommendationCandidate => ({
    ...row,
    steepSlope: row.steepSlope as number,
    steepDistance: row.steepDistance as number,
    shape: row.shape as "normal" | "winding",
    grooming: row.grooming as Grooming,
    resortName: labelName(byCanonical.get(row.resortId) ?? sourceResort),
  });
  const sources = rows.filter(row => row.resortId === sourceId).map(convert);
  if (!sources.length) return { status: "source_unavailable" as const };
  const targets = rows.filter(row => row.resortId !== sourceId).map(convert);
  if (!targets.length) return { status: "candidates_unavailable" as const };
  const rank = (source: RecommendationCandidate) =>
    rankCourses(source, targets).map(row => ({
      resortId: byCanonical.get(row.resortId)?.id ?? row.resortId,
      resortName: row.resortName,
      key: row.key,
      name: row.name,
      distance: row.distance,
      meanSlope: row.meanSlope,
      steepSlope: row.steepSlope,
      steepDistance: row.steepDistance,
      shapeDifferent: row.shape !== source.shape,
      groomingDifferent: !groomingCompatible(source.grooming, row.grooming),
      score: row.score,
      slopeDifference: row.slopeDifference,
      steepSlopeDifference: row.steepSlopeDifference,
      steepDistanceDifference: row.steepDistanceDifference,
      lengthDifference: row.lengthDifference,
      selected: {
        kind: "course" as const,
        id: row.groupId,
        ...(row.routeKey ? { routeId: row.routeKey } : {}),
      },
    }));
  return { status: "ready" as const, sources, rank };
}

export async function searchCourseRecommendationsDirect(
  resortId: string,
  selected: SelectedMapFeature,
  favoriteIds: string[],
) {
  if (selected.kind !== "course")
    return { status: "source_unavailable" as const, recommendations: [] };
  const pool = await loadRecommendationPool(resortId, favoriteIds);
  if (pool.status !== "ready")
    return { status: pool.status, recommendations: [] };
  const source = pool.sources.find(row =>
    selected.routeId
      ? row.routeKey === selected.routeId
      : row.groupId === selected.id || row.courseIds.includes(selected.id),
  );
  // Never replace a secondary route selection with a main route.
  if (
    !source ||
    (!selected.routeId && source.routeKey && source.groupId === selected.id)
  )
    return { status: "source_unavailable" as const, recommendations: [] };
  const recommendations = pool.rank(source);
  return {
    status: recommendations.length ? ("ready" as const) : ("no_match" as const),
    recommendations,
  };
}

/** Warm all course results while opening the resort, before a course is selected. */
export async function getCourseRecommendationIndexDirect(
  resortId: string,
  favoriteIds: string[],
) {
  const pool = await loadRecommendationPool(resortId, favoriteIds);
  if (pool.status !== "ready") return { status: pool.status, courses: [] };
  return {
    status: "ready" as const,
    courses: pool.sources.map(source => ({
      groupId: source.groupId,
      routeKey: source.routeKey,
      courseIds: source.courseIds,
      recommendations: pool.rank(source),
    })),
  };
}
export async function recommendCoursesDirect(
  resortId: string,
  selected: SelectedMapFeature,
  favoriteIds: string[],
) {
  return (
    await searchCourseRecommendationsDirect(resortId, selected, favoriteIds)
  ).recommendations;
}
export type CourseRecommendationSearch = Awaited<
  ReturnType<typeof searchCourseRecommendationsDirect>
>;
export type CourseRecommendation =
  CourseRecommendationSearch["recommendations"][number];
export type CourseRecommendationIndex = Awaited<
  ReturnType<typeof getCourseRecommendationIndexDirect>
>;
export type CourseRecommendationStatus =
  | Unavailable
  | "ready"
  | "no_match"
  | "api_outdated";
