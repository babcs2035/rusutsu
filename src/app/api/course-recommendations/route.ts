import { z } from "zod";
import { getCourseRecommendationIndex } from "@/features/course-recommendations/actions";
import { favoriteIdsSchema } from "@/features/favorites/storage";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";

const schema = z.object({
  resortId: z.string().min(1).max(200),
  guestFavorites: favoriteIdsSchema,
});
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

// A separate read request avoids the client's serialized Server Action queue.
// The action resolves authenticated favorites from the session, never the body.
export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await readRequestJson(request, 2_000_000));
    if (!parsed.success)
      return Response.json(
        { error: "Invalid request" },
        { status: 400, headers },
      );
    const { resortId, guestFavorites } = parsed.data;
    return Response.json(
      await getCourseRecommendationIndex(resortId, guestFavorites),
      { headers },
    );
  } catch (error) {
    return Response.json(
      { error: "Recommendations unavailable" },
      {
        status: error instanceof RequestBodyError ? error.status : 503,
        headers,
      },
    );
  }
}
