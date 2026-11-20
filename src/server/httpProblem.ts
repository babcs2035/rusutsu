/** HTTP API の失敗を RFC 9457 の Problem Details で返す． */
import { STATUS_CODES } from "node:http";

/** 呼び出し元で判断する code と必要な詳細だけを公開する． */
export function httpProblem(
  status: number,
  code: string,
  detail: string,
  headers: HeadersInit,
  details?: unknown,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/problem+json");
  return Response.json(
    {
      type: "about:blank",
      title: STATUS_CODES[status] ?? "Request failed",
      status,
      code,
      detail,
      ...(details === undefined ? {} : { details }),
    },
    { status, headers: responseHeaders },
  );
}
