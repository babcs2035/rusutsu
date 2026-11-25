import {
  type Grooming,
  groomingCompatible,
  RECOMMENDATION,
  type RecommendationCandidate,
  rankCourses,
} from "@/features/course-recommendations/algorithm";
import { prisma } from "@/lib/prisma";
import { getResortLabelName } from "@/lib/resortAliases";
import { publicResortWhere } from "@/server/ski-resorts/publicProjection";

type Unavailable =
  | "no_favorites"
  | "source_unavailable"
  | "no_other_favorites"
  | "candidates_unavailable";

export type RecommendationScope = "favorites" | "all";
const resortSelect = {
  id: true,
  nameJa: true,
  shortName: true,
  sourceResortIds: true,
} as const;
type PoolResort = Awaited<
  ReturnType<typeof prisma.skiResort.findMany<{ select: typeof resortSelect }>>
>[number];
type PoolRow = Awaited<
  ReturnType<typeof prisma.courseRecommendationFeature.findMany>
>[number];

// Missing metrics are never interpreted as flat terrain.
const validRow = (row: PoolRow) =>
  Number.isFinite(row.maxSlope) &&
  row.slopeDistances.length === RECOMMENDATION.profileDegrees + 1 &&
  row.slopeDistances.every(Number.isFinite);

/**
 * 全スキー場から探すときの特徴量（約1,600コース・1.6MB）。
 * 毎回DBから読むと数百msかかるので、プロセス内に60秒だけ持つ。
 */
const ALL_POOL_TTL = 60_000;
let allPool: {
  expires: number;
  promise: Promise<PoolRow[]>;
} | null = null;
/** 特徴量だけを再利用し，公開状態は毎回正本で確認する． */
function loadAllPool(): Promise<PoolRow[]> {
  if (allPool && allPool.expires > Date.now()) return allPool.promise;
  const entry = {
    expires: Number.POSITIVE_INFINITY,
    promise: prisma.courseRecommendationFeature
      .findMany({
        where: { calculationVersion: RECOMMENDATION.version },
      })
      .then(rows => rows.filter(validRow)),
  };
  allPool = entry;
  entry.promise.then(
    () => {
      entry.expires = Date.now() + ALL_POOL_TTL;
    },
    () => {
      if (allPool === entry) allPool = null;
    },
  );
  return entry.promise;
}

async function loadScopedRows(
  resortId: string,
  favoriteIds: string[],
  scope: RecommendationScope,
) {
  const resortsQuery = prisma.skiResort.findMany({
    where:
      scope === "all"
        ? publicResortWhere
        : {
            ...publicResortWhere,
            id: { in: [...new Set([resortId, ...favoriteIds])] },
          },
    select: resortSelect,
  });
  if (scope === "all") {
    const [resorts, rows] = await Promise.all([resortsQuery, loadAllPool()]);
    return { resorts, rows };
  }
  const resorts = await resortsQuery;
  const ids = resorts.map(r => r.id);
  const rows = await prisma.courseRecommendationFeature.findMany({
    where: {
      resortId: { in: ids },
      calculationVersion: RECOMMENDATION.version,
    },
  });
  return { resorts, rows: rows.filter(validRow) };
}

/** お気に入りだけ、または全スキー場を候補にする。検索元のスキー場は常に除く */
async function loadRecommendationPool(
  resortId: string,
  favoriteIds: string[],
  scope: RecommendationScope,
) {
  if (scope === "favorites" && !favoriteIds.length)
    return { status: "no_favorites" as const };
  const { resorts, rows: allRows } = await loadScopedRows(
    resortId,
    favoriteIds,
    scope,
  );
  const sourceResort = resorts.find(r => r.id === resortId);
  if (!sourceResort) return { status: "source_unavailable" as const };
  const sourceId = sourceResort.id;
  const sourceMembers = new Set([resortId, ...sourceResort.sourceResortIds]);
  const favorites = new Set(favoriteIds);
  const candidates = resorts.filter(
    r =>
      (scope === "all" || favorites.has(r.id)) &&
      ![r.id, ...r.sourceResortIds].some(id => sourceMembers.has(id)),
  );
  const byCanonical = new Map<string, PoolResort>();
  for (const r of candidates.sort((a, b) => a.id.localeCompare(b.id, "en")))
    byCanonical.set(r.id, r);
  if (!byCanonical.size) return { status: "no_other_favorites" as const };
  const rows = allRows.filter(
    row => row.resortId === sourceId || byCanonical.has(row.resortId),
  );
  // 地図のラベルと同じ省略名にする
  const labelName = (r: PoolResort) =>
    getResortLabelName(r.id, r.nameJa, r.shortName);
  const convert = (row: (typeof rows)[number]): RecommendationCandidate => ({
    ...row,
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
      maxSlope: row.maxSlope,
      steepThreshold: row.steepThreshold,
      sourceSteepDistance: row.sourceSteepDistance,
      candidateSteepDistance: row.candidateSteepDistance,
      groomingDifferent: !groomingCompatible(source.grooming, row.grooming),
      score: row.score,
      slopeDifference: row.slopeDifference,
      maxSlopeDifference: row.maxSlopeDifference,
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

/** Warm all course results while opening the resort, before a course is selected. */
export async function getCourseRecommendationIndexDirect(
  resortId: string,
  favoriteIds: string[],
  scope: RecommendationScope = "favorites",
) {
  const pool = await loadRecommendationPool(resortId, favoriteIds, scope);
  if (pool.status !== "ready") return { status: pool.status, courses: [] };
  return {
    status: "ready" as const,
    courses: pool.sources.map(source => ({
      groupId: source.groupId,
      routeKey: source.routeKey,
      isMainRoute: source.isMainRoute,
      courseIds: source.courseIds,
      recommendations: pool.rank(source),
    })),
  };
}
export type CourseRecommendationIndex = Awaited<
  ReturnType<typeof getCourseRecommendationIndexDirect>
>;
export type CourseRecommendation = Extract<
  CourseRecommendationIndex,
  { status: "ready" }
>["courses"][number]["recommendations"][number];
export type CourseRecommendationStatus =
  | Unavailable
  | "ready"
  | "no_match"
  | "api_outdated";
