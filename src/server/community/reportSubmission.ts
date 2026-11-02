import type { ActionResult } from "@/features/community/contract";
import type { ReportSubmission } from "@/features/community/submitReport";
import { RequestBodyError, readRequestBytes } from "@/server/readRequestBody";
import { commandSchema, MAX_MULTIPART_BYTES } from "./remoteContract";

type Dependencies = {
  /** 逆プロキシの内部Hostとは別に、配備設定の公開URLを照合する。 */
  publicOrigin?: string;
  authenticate: () => Promise<boolean>;
  execute: (
    command: ReportSubmission,
    photos: FormData,
  ) => Promise<ActionResult<{ id: string }>>;
};

export async function handleReportSubmission(
  request: Request,
  deps: Dependencies,
) {
  const respond = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  // このヘッダーはcross-originフォームからは送れず、CORSも許可しない。
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try {
    sameOrigin =
      !!origin &&
      (new URL(origin).host ===
        (request.headers.get("host") ?? new URL(request.url).host) ||
        (!!deps.publicOrigin &&
          new URL(origin).origin === new URL(deps.publicOrigin).origin));
  } catch {
    /* 不正なOriginは拒否する。 */
  }
  if (
    !sameOrigin ||
    request.headers.get("x-community-request") !== "1" ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return respond({ ok: false }, 403);
  try {
    if (!(await deps.authenticate())) return respond({ ok: false }, 401);
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data;"))
      return respond({ ok: false }, 415);
    const bytes = await readRequestBytes(request, MAX_MULTIPART_BYTES, 60_000);
    const form = await new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": contentType },
    }).formData();
    if (
      form.getAll("command").length !== 1 ||
      typeof form.get("command") !== "string"
    )
      return respond({
        ok: false,
        error: "投稿の入力形式を確認してください。",
      });
    const parsed = commandSchema.safeParse(
      JSON.parse(form.get("command") as string),
    );
    if (
      !parsed.success ||
      (parsed.data.operation !== "publish" &&
        parsed.data.operation !== "update")
    )
      return respond({
        ok: false,
        error: parsed.success
          ? "投稿の操作を確認してください。"
          : (parsed.error.issues[0]?.message ?? "入力を確認してください。"),
      });
    form.delete("command");
    return respond(await deps.execute(parsed.data, form));
  } catch (error) {
    if (error instanceof RequestBodyError)
      return respond({ ok: false }, error.status);
    if (error instanceof SyntaxError || error instanceof TypeError)
      return respond({
        ok: false,
        error: "投稿の送信形式を確認してください。",
      });
    console.error("Community report request failed");
    return respond({ ok: false }, 500);
  }
}
