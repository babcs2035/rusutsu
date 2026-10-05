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
  recommendCoursesDirect,
} from "@/server/course-recommendations/repository";

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
  if (!ids.length) return [];
  if (usesRemoteDataApi()) {
    const response = await fetchInternalDataApi(
      "/api/internal/v1/course-recommendations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resortId, selected: feature, favoriteIds: ids }),
      },
    );
    const result: { recommendations: CourseRecommendation[] } =
      await response.json();
    return result.recommendations;
  }
  return recommendCoursesDirect(resortId, feature, ids);
}
