/** 公開の推薦検索を session のお気に入りと正本へ接続する． */
import "server-only";
import { z } from "zod";
import { auth } from "@/auth";
import { RECOMMENDATION } from "@/features/course-recommendations/algorithm";
import { favoriteIdsSchema } from "@/features/favorites/storage";
import {
  fetchInternalDataApi,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import { prisma } from "@/lib/prisma";
import {
  type CourseRecommendationIndex,
  getCourseRecommendationIndexDirect,
  type RecommendationScope,
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

/** 推薦インデックスを，ログイン中は本人のお気に入りから構築する． */
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
