import { z } from "zod";
import { favoriteIdsSchema } from "@/features/favorites/storage";
import { featureSchema } from "@/features/map/session/storage";
import { searchCourseRecommendationsDirect } from "@/server/course-recommendations/repository";
import { requireInternalApiRequest } from "@/server/internalApiHttp";

const schema = z.object({
  resortId: z.string().min(1).max(200),
  selected: featureSchema,
  favoriteIds: favoriteIdsSchema,
});
export async function POST(request: Request) {
  const denied = requireInternalApiRequest(request, "admin-data");
  if (denied) return denied;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Invalid request" }, { status: 400 });
  const { resortId, selected, favoriteIds } = parsed.data;
  return Response.json(
    await searchCourseRecommendationsDirect(resortId, selected, favoriteIds),
    { headers: { "Cache-Control": "no-store" } },
  );
}
