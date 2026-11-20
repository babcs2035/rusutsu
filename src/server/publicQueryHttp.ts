// 公開 query の本文・失敗・cache 方針を揃え，業務処理は各 service に委ねる．
import type { z } from "zod";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";

const maxQueryBytes = 256 * 1024;
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

/** 解析済み入力だけを service へ渡し，内部例外を公開しない． */
export async function respondToPublicQuery<Input, Output>(
  request: Request,
  schema: z.ZodType<Input>,
  execute: (input: Input) => Promise<Output>,
): Promise<Response> {
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
    "application/json"
  ) {
    return Response.json(
      { code: "UNSUPPORTED_MEDIA_TYPE", detail: "JSON body required" },
      { status: 415, headers },
    );
  }
  try {
    const parsed = schema.safeParse(
      await readRequestJson(request, maxQueryBytes),
    );
    if (!parsed.success)
      return Response.json(
        { code: "INVALID_QUERY", detail: "Invalid query" },
        { status: 400, headers },
      );
    return Response.json(await execute(parsed.data), { headers });
  } catch (error) {
    const status = error instanceof RequestBodyError ? error.status : 503;
    if (!(error instanceof RequestBodyError))
      console.error("Public query failed", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
    return Response.json(
      { code: "QUERY_UNAVAILABLE", detail: "Unable to read requested data" },
      { status, headers },
    );
  }
}
