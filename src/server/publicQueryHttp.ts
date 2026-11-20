// 公開 query の本文・失敗・cache 方針を揃え，業務処理は各 service に委ねる．
import type { z } from "zod";
import { httpProblem } from "@/server/httpProblem";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";

const maxQueryBytes = 256 * 1024;
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

/** 解析済み入力だけを service へ渡し，内部例外を公開しない． */
export async function respondToPublicQuery<Input, Output>(
  request: Request,
  schema: z.ZodType<Input>,
  execute: (input: Input) => Promise<Output>,
): Promise<Response> {
  try {
    const parsed = schema.safeParse(
      await readRequestJson(request, maxQueryBytes),
    );
    if (!parsed.success)
      return httpProblem(400, "INVALID_QUERY", "Invalid query", headers);
    return Response.json(await execute(parsed.data), { headers });
  } catch (error) {
    if (error instanceof RequestBodyError)
      return httpProblem(error.status, error.code, error.message, headers);
    console.error("Public query failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return httpProblem(
      503,
      "QUERY_UNAVAILABLE",
      "Unable to read requested data",
      headers,
    );
  }
}
