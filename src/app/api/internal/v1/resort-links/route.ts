import { z } from "zod";
import {
  internalApiError,
  internalApiJson,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";
import {
  RESORT_LINK_MAX_BODY_BYTES,
  resortLinkReplaceSchema,
  resortLinkSourceSchema,
  UnknownResortLinkResortError,
} from "@/server/resort-links/contract";
import {
  findResortLinksBySourceDirect,
  findResortLinksDirect,
  replaceResortLinksDirect,
  summarizeResortLinksDirect,
} from "@/server/resort-links/repository";
import { skiResortIdSchema } from "@/server/ski-resorts/adminContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RESORT_IDS = 100;
const resortIdListSchema = z
  .string()
  .transform(value => value.split(","))
  .pipe(z.array(skiResortIdSchema).min(1).max(MAX_RESORT_IDS));

const issuesOf = (error: z.ZodError) =>
  error.issues
    .map(issue => `${issue.path.join(".")}: ${issue.message}`)
    .slice(0, 12)
    .join("\n");

/**
 * - クエリなし: 出どころ×種類ごとの件数
 * - resortIds（カンマ区切り）: 指定スキー場のリンク
 * - source: その出どころの全スキー場分のリンク
 */
export async function GET(request: Request) {
  const denied = requireInternalApiRequest(request, "admin-data");
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const keys = [...params.keys()].sort().join(",");

  try {
    if (keys === "")
      return internalApiJson({ summary: await summarizeResortLinksDirect() });
    if (keys === "resortIds") {
      const resortIds = resortIdListSchema.safeParse(params.get("resortIds"));
      if (!resortIds.success)
        return internalApiError(400, "INVALID_QUERY", "Invalid resortIds");
      return internalApiJson({
        links: await findResortLinksDirect(resortIds.data),
      });
    }
    if (keys === "source") {
      const source = resortLinkSourceSchema.safeParse(params.get("source"));
      if (!source.success)
        return internalApiError(400, "INVALID_QUERY", "Invalid source");
      return internalApiJson({
        links: await findResortLinksBySourceDirect(source.data),
      });
    }
    return internalApiError(400, "INVALID_QUERY", "Unknown query parameter");
  } catch (error) {
    logInternalApiFailure("Failed to read resort links", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to read data");
  }
}

/** 範囲（1スキー場の出どころ、または出どころ全体）の自動の行を入れ替える */
export async function PUT(request: Request) {
  const denied = requireInternalApiRequest(request, "admin-data");
  if (denied) return denied;
  try {
    const write = resortLinkReplaceSchema.parse(
      await readRequestJson(request, RESORT_LINK_MAX_BODY_BYTES),
    );
    return internalApiJson({ result: await replaceResortLinksDirect(write) });
  } catch (error) {
    if (error instanceof z.ZodError)
      return internalApiError(422, "INVALID_RESORT_LINKS", issuesOf(error));
    if (error instanceof RequestBodyError)
      return internalApiError(error.status, error.code, error.message);
    if (error instanceof UnknownResortLinkResortError)
      return internalApiError(
        422,
        "UNKNOWN_RESORT",
        `スキー場IDが存在しません: ${error.resortIds.slice(0, 20).join(", ")}`,
      );
    logInternalApiFailure("Resort link write failed", error);
    return internalApiError(
      500,
      "INTERNAL_ERROR",
      "リンクを保存できませんでした。",
    );
  }
}
