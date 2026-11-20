/** サインインした本人の比較リストだけを，ブラウザーの操作後に返す． */
import { z } from "zod";
import { auth } from "@/auth";
import { readCompareListsForUser } from "@/server/compare-lists/repository";
import { httpProblem } from "@/server/httpProblem";
import { RequestBodyError, readRequestJson } from "@/server/readRequestBody";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const maxBodyBytes = 1024;
const schema = z.strictObject({ expectedUserId: z.string().min(1).max(200) });

/** セッションが要求中に切り替わったときは別アカウントの一覧を返さない． */
export async function POST(request: Request): Promise<Response> {
  try {
    const id = (await auth())?.user?.id;
    if (!id)
      return httpProblem(401, "UNAUTHORIZED", "Sign in required", headers);
    const inputs = schema.safeParse(
      await readRequestJson(request, maxBodyBytes),
    );
    if (!inputs.success)
      return httpProblem(
        400,
        "INVALID_QUERY",
        "Invalid comparison list query",
        headers,
      );
    if (inputs.data.expectedUserId !== id)
      return httpProblem(
        403,
        "ACCOUNT_CHANGED",
        "Signed-in account changed",
        headers,
      );
    return Response.json(await readCompareListsForUser(id), { headers });
  } catch (error) {
    if (error instanceof RequestBodyError)
      return httpProblem(error.status, error.code, error.message, headers);
    console.error("Failed to read comparison lists", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return httpProblem(
      503,
      "QUERY_UNAVAILABLE",
      "Comparison lists unavailable",
      headers,
    );
  }
}
