import { z } from "zod";
import { RECOMMENDATION } from "@/features/course-recommendations/algorithm";
import { favoriteIdsSchema } from "@/features/favorites/storage";
import { getCourseRecommendationIndexDirect } from "@/server/course-recommendations/repository";
import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";

const maxQueryBytes = 2 * 1024 * 1024;
const schema = z.strictObject({
  resortId: z.string().min(1).max(200),
  favoriteIds: favoriteIdsSchema,
  scope: z.enum(["favorites", "all"]).default("favorites"),
});
/** 正本の推薦インデックスを，認証済みのサーバーへ返す． */
export async function POST(request: Request): Promise<Response> {
  const denied = requireInternalApiRequest(request);
  if (denied) return denied;
  try {
    const parsed = schema.safeParse(
      await readRequestJson(request, maxQueryBytes),
    );
    if (!parsed.success)
      return internalApiError(
        400,
        "INVALID_QUERY",
        "Invalid recommendation query",
      );
    const { resortId, favoriteIds, scope } = parsed.data;
    return internalApiJson({
      ...(await getCourseRecommendationIndexDirect(
        resortId,
        favoriteIds,
        scope,
      )),
      calculationVersion: RECOMMENDATION.version,
    });
  } catch (error) {
    if (error instanceof RequestBodyError)
      return internalApiError(error.status, error.code, error.message);
    logInternalApiFailure("Failed to read recommendation index", error);
    return internalApiError(
      503,
      "INTERNAL_ERROR",
      "Recommendations unavailable",
    );
  }
}
