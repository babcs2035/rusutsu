// Content-Security-Policy (Report-Only) の違反レポートを受け取る公開 endpoint。
// ブラウザが CSP 違反を検出すると自動的に POST する。報告は監視目的のみで、
// 認証・認可を必要としない（どのブラウザからも送られるため）。
// レポートには秘密情報が含まれないが、ボディは上限付きで読み、ログに出す。
import { RequestBodyError, readRequestBytes } from "@/server/readRequestBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REPORT_BYTES = 64 * 1024;

type CspReport = {
  "csp-report"?: {
    "blocked-uri"?: string;
    "effective-directive"?: string;
    disposition?: string;
    "document-uri"?: string;
  };
};

export async function POST(request: Request) {
  let bytes: Buffer;
  try {
    bytes = await readRequestBytes(request, MAX_REPORT_BYTES, 10_000);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return new Response(null, { status: error.status });
    }
    throw error;
  }
  try {
    const report = JSON.parse(bytes.toString("utf8")) as CspReport;
    const csp = report["csp-report"];
    if (!csp) return new Response(null, { status: 204 });
    // 違反した URI・ディレクティブ・対象ページを記録する。document-uri は
    // 公開ページ URL のみで、クエリに秘密を含む可能性を避けるため除去する。
    const documentUri = csp["document-uri"]
      ? new URL(csp["document-uri"]).origin +
        new URL(csp["document-uri"]).pathname
      : "unknown";
    console.warn(
      "CSP violation",
      JSON.stringify({
        blocked: csp["blocked-uri"] ?? "",
        directive: csp["effective-directive"] ?? "",
        disposition: csp["disposition"] ?? "",
        page: documentUri,
      }),
    );
  } catch {
    // 不正形式のレポートは破棄する。処理を止めない。
  }
  return new Response(null, { status: 204 });
}
