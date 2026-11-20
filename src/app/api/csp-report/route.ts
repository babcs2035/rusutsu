// Content-Security-Policy (Report-Only) の違反レポートを受け取る公開 endpoint。
// ブラウザが CSP 違反を検出すると自動的に POST する。報告は監視目的のみで、
// 認証・認可を必要としない（どのブラウザからも送られるため）。
// URL・入力文字列をログに残さず，検証済みの分類だけを記録する．
import { RequestBodyError, readRequestBytes } from "@/server/readRequestBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REPORT_BYTES = 64 * 1024;

const REPORT_TIMEOUT_MS = 10_000;
const LOG_INTERVAL_MS = 60_000;
const knownDirectives = new Set([
  "base-uri",
  "child-src",
  "connect-src",
  "default-src",
  "font-src",
  "form-action",
  "frame-ancestors",
  "frame-src",
  "img-src",
  "object-src",
  "script-src",
  "script-src-attr",
  "script-src-elem",
  "style-src",
  "style-src-attr",
  "style-src-elem",
  "worker-src",
]);
let latestLog = 0;

/** 公開の報告を受け，URL や内容を保存せずに CSP の調整に使う． */
export async function POST(request: Request): Promise<Response> {
  if (
    request.headers.get("content-type")?.split(";", 1)[0].trim() !==
    "application/csp-report"
  ) {
    return new Response(null, { status: 415 });
  }
  let bytes: Buffer;
  try {
    bytes = await readRequestBytes(
      request,
      MAX_REPORT_BYTES,
      REPORT_TIMEOUT_MS,
    );
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return new Response(null, { status: error.status });
    }
    throw error;
  }
  try {
    const report: unknown = JSON.parse(bytes.toString("utf8"));
    if (
      typeof report !== "object" ||
      report === null ||
      !("csp-report" in report)
    )
      return new Response(null, { status: 400 });
    const csp = report["csp-report"];
    if (
      typeof csp !== "object" ||
      csp === null ||
      !("effective-directive" in csp)
    )
      return new Response(null, { status: 400 });
    const directive = csp["effective-directive"];
    const now = Date.now();
    if (
      typeof directive === "string" &&
      knownDirectives.has(directive) &&
      now - latestLog >= LOG_INTERVAL_MS
    ) {
      latestLog = now;
      console.warn("CSP violation", { directive });
    }
  } catch {
    return new Response(null, { status: 400 });
  }
  return new Response(null, { status: 204 });
}
