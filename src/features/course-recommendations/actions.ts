"use server";
import { z } from "zod";
import { auth } from "@/auth";
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
  searchCourseRecommendationsDirect,
} from "@/server/course-recommendations/repository";
import { RECOMMENDATION } from "./algorithm";

export async function getCourseRecommendations(
  resortId: string,
  selected: z.infer<typeof featureSchema>,
  guestFavorites: string[],
) {
  z.string().min(1).max(200).parse(resortId);
  const feature = featureSchema.parse(selected);
  const requested = favoriteIdsSchema.parse(guestFavorites);
  const session = await auth();
  const ids = session?.user?.id
    ? (
        await prisma.favorite.findMany({
          where: { userId: session.user.id },
          select: { skiResortId: true },
        })
      ).map(f => f.skiResortId)
    : requested;
  if (!ids.length)
    return { status: "no_favorites" as const, recommendations: [] };
  if (usesRemoteDataApi()) {
    const response = await fetchInternalDataApi(
      "/api/internal/v1/course-recommendations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resortId, selected: feature, favoriteIds: ids }),
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
  return searchCourseRecommendationsDirect(resortId, feature, ids);
}

export async function getCourseRecommendationIndex(
  resortId: string,
  guestFavorites: string[],
) {
  z.string().min(1).max(200).parse(resortId);
  const requested = favoriteIdsSchema.parse(guestFavorites);
  const session = await auth();
  const ids = session?.user?.id
    ? (
        await prisma.favorite.findMany({
          where: { userId: session.user.id },
          select: { skiResortId: true },
        })
      ).map(f => f.skiResortId)
    : requested;
  if (!usesRemoteDataApi())
    return getCourseRecommendationIndexDirect(resortId, ids);
  const response = await fetchInternalDataApi(
    "/api/internal/v1/course-recommendations",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resortId, favoriteIds: ids }),
      signal: AbortSignal.timeout(2500),
    },
    { acceptedErrorStatuses: [400] },
  );
  if (response.status === 400)
    return { status: "api_outdated" as const, courses: [] };
  const result: CourseRecommendationIndex & { calculationVersion?: number } =
    await response.json();
  if (result.calculationVersion !== RECOMMENDATION.version)
    return { status: "api_outdated" as const, courses: [] };
  return result;
}
export type RecommendationIndexResult = Awaited<
  ReturnType<typeof getCourseRecommendationIndex>
>;
