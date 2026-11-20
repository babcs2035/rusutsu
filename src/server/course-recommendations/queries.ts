/** 公開の推薦検索を session のお気に入りと正本へ接続する． */
import "server-only";
import { z } from "zod";
import { auth } from "@/auth";
import { RECOMMENDATION } from "@/features/course-recommendations/algorithm";
import { favoriteIdsSchema } from "@/features/favorites/storage";
import { featureSchema } from "@/features/map/session/storage";
import {
  fetchInternalDataApi,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import { prisma } from "@/lib/prisma";
import {
  type CourseRecommendation,
  type CourseRecommendationIndex,
  type CourseRecommendationSearch,
  getCourseRecommendationIndexDirect,
  type RecommendationScope,
  searchCourseRecommendationsDirect,
} from "@/server/course-recommendations/repository";

const scopeSchema = z.enum(["favorites", "all"]);
async function favoriteIdsFor(guestFavorites: string[]) {
  const requested = favoriteIdsSchema.parse(guestFavorites);
  const session = await auth();
  return session?.user?.id
    ? (
        await prisma.favorite.findMany({
          where: { userId: session.user.id },
          select: { skiResortId: true },
        })
      ).map(f => f.skiResortId)
    : requested;
}
/** お気に入りが無ければ、選択に関係なく全スキー場から探す */
const effectiveScope = (
  scope: RecommendationScope,
  ids: string[],
): RecommendationScope => (ids.length ? scope : "all");

export async function getCourseRecommendations(
  resortId: string,
  selected: z.infer<typeof featureSchema>,
  guestFavorites: string[],
  requestedScope: RecommendationScope = "favorites",
) {
  z.string().min(1).max(200).parse(resortId);
  const feature = featureSchema.parse(selected);
  const ids = await favoriteIdsFor(guestFavorites);
  const scope = effectiveScope(scopeSchema.parse(requestedScope), ids);
  if (usesRemoteDataApi()) {
    const response = await fetchInternalDataApi(
      "/api/admin/course-recommendations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resortId,
          selected: feature,
          favoriteIds: ids,
          scope,
        }),
        signal: AbortSignal.timeout(2500),
      },
    );
    const result: {
      recommendations: CourseRecommendation[];
      status?: CourseRecommendationSearch["status"];
      calculationVersion?: number;
    } = await response.json();
    if (result.calculationVersion !== RECOMMENDATION.version)
      return { status: "api_outdated" as const, recommendations: [] };
    // Allow the client and canonical API to be deployed in either order.
    return {
      ...result,
      status:
        result.status ?? (result.recommendations.length ? "ready" : "no_match"),
    };
  }
  return searchCourseRecommendationsDirect(resortId, feature, ids, scope);
}

export async function getCourseRecommendationIndex(
  resortId: string,
  guestFavorites: string[],
  requestedScope: RecommendationScope = "favorites",
) {
  z.string().min(1).max(200).parse(resortId);
  const ids = await favoriteIdsFor(guestFavorites);
  const scope = effectiveScope(scopeSchema.parse(requestedScope), ids);
  if (!usesRemoteDataApi())
    return {
      ...(await getCourseRecommendationIndexDirect(resortId, ids, scope)),
      scope,
    };
  const response = await fetchInternalDataApi(
    "/api/admin/course-recommendations",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resortId, favoriteIds: ids, scope }),
      signal: AbortSignal.timeout(2500),
    },
    { acceptedErrorStatuses: [400] },
  );
  if (response.status === 400)
    return { status: "api_outdated" as const, courses: [], scope };
  const result: CourseRecommendationIndex & { calculationVersion?: number } =
    await response.json();
  if (result.calculationVersion !== RECOMMENDATION.version)
    return { status: "api_outdated" as const, courses: [], scope };
  return { ...result, scope };
}
export type RecommendationIndexResult = Awaited<
  ReturnType<typeof getCourseRecommendationIndex>
>;
