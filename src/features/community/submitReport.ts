import type { CommunityCommand } from "@/server/community/remoteContract";
import type { ActionResult } from "./contract";

export type ReportSubmission = Extract<
  CommunityCommand,
  { operation: "publish" | "update" }
>;
export const REPORT_SEND_TIMEOUT_MS = 90_000;

export function reportHttpError(status: number): string {
  if (status === 401)
    return "ログインの有効期限が切れました。ログインし直してから投稿してください。";
  if (status === 403)
    return "投稿が送信先で拒否されました。入力内容は残っています。時間を置いてもう一度お試しください。";
  if (status === 413)
    return "送信するデータが大きすぎます。写真のサイズを小さくして、もう一度お試しください。";
  if (status === 408 || status === 504)
    return "送信の確認に時間がかかっています。投稿一覧に反映されていないことを確認してから、もう一度お試しください。";
  if (status === 429)
    return "投稿が集中しています。少し待ってからもう一度お試しください。";
  return "送信先でエラーが発生しました。入力内容は残っています。時間を置いてもう一度お試しください。";
}

/** Server Actionsの待ち行列から分離し、HTTP拒否と応答待ちを判別する。 */
export async function submitReport(
  command: ReportSubmission,
  photos: FormData,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<ActionResult<{ id: string }>> {
  const form = new FormData();
  form.set("command", JSON.stringify(command));
  for (const [key, value] of photos) form.append(key, value);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? REPORT_SEND_TIMEOUT_MS,
  );
  try {
    const response = await (options.fetch ?? fetch)(
      "/rusutsu/api/community/report",
      {
        method: "POST",
        headers: { "X-Community-Request": "1" },
        body: form,
        credentials: "same-origin",
        signal: controller.signal,
      },
    );
    // 拒否ページのHTMLや終わらない本文を読み終えるまで待たない。
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return { ok: false, error: reportHttpError(response.status) };
    }
    const result: unknown = await response.json();
    if (result && typeof result === "object" && "ok" in result) {
      if (
        result.ok === false &&
        "error" in result &&
        typeof result.error === "string"
      )
        return { ok: false, error: result.error };
      if (
        result.ok === true &&
        "data" in result &&
        result.data &&
        typeof result.data === "object" &&
        "id" in result.data &&
        typeof result.data.id === "string"
      )
        return { ok: true, data: { id: result.data.id } };
    }
    return {
      ok: false,
      error:
        "送信結果を確認できませんでした。投稿一覧を確認してから、もう一度お試しください。",
    };
  } catch {
    return {
      ok: false,
      error: controller.signal.aborted
        ? reportHttpError(408)
        : "送信結果を受け取れませんでした。入力内容は残っています。投稿一覧を確認してから、もう一度お試しください。",
    };
  } finally {
    clearTimeout(timer);
  }
}
