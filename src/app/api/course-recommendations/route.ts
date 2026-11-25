import { z } from "zod";
import { favoriteIdsSchema } from "@/features/favorites/storage";
import { getCourseRecommendationIndex } from "@/server/course-recommendations/queries";
import { httpProblem } from "@/server/httpProblem";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";

const schema = z.object({
  resortId: z.string().min(1).max(200),
  guestFavorites: favoriteIdsSchema,
  scope: z.enum(["favorites", "all"]).default("favorites"),
});
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

/** 既存の error 欄を保ち，共通の Problem Details を返す． */
function recommendationProblem(
  status: number,
  code: string,
  error: string,
): Response {
  return httpProblem(status, code, error, headers, { error });
}

// A separate read request avoids the client's serialized Server Action queue.
// The service resolves authenticated favorites from the session, never the body.
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = schema.safeParse(await readRequestJson(request, 2_000_000));
    if (!parsed.success)
      return recommendationProblem(400, "INVALID_QUERY", "Invalid request");
    const { resortId, guestFavorites, scope } = parsed.data;
    return Response.json(
      await getCourseRecommendationIndex(resortId, guestFavorites, scope),
      { headers },
    );
  } catch (error) {
    return recommendationProblem(
      error instanceof RequestBodyError ? error.status : 503,
      error instanceof RequestBodyError ? error.code : "QUERY_UNAVAILABLE",
      "Recommendations unavailable",
    );
  }
}
