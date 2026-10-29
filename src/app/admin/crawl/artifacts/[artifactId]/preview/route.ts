import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { z } from "zod";
import {
  fetchInternalDataApi,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  readStoredArtifact,
  verifyStoredRenderedDom,
} from "@/server/crawl-latest/artifactStorage";
import { getCrawlLatestArtifact } from "@/server/crawl-latest/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gunzipAsync = promisify(gunzip);
const artifactIdSchema = z.string().cuid();
const httpUrlSchema = z
  .string()
  .url()
  .refine(value => /^https?:\/\//iu.test(value));

const errorResponse = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

async function readArtifactHtml(
  artifactId: string,
): Promise<string | Response> {
  if (usesRemoteDataApi()) {
    const response = await fetchInternalDataApi(
      `/api/internal/v1/crawl-latest-artifacts/${artifactId}/content`,
      {},
      { scope: "diagnostics-read", acceptedErrorStatuses: [404, 409, 410] },
    );
    if (!response.ok) {
      return errorResponse(response.status, "診断DOMを取得できませんでした。");
    }
    return response.text();
  }
  const artifact = await getCrawlLatestArtifact(artifactId);
  if (!artifact) return errorResponse(404, "診断DOMが見つかりません。");
  if (
    artifact.state !== "AVAILABLE" ||
    !artifact.storageKey ||
    !artifact.sha256
  ) {
    return errorResponse(410, "診断DOMは保存期間切れなどで利用できません。");
  }
  try {
    const content = await readStoredArtifact(artifact.storageKey);
    if (!(await verifyStoredRenderedDom(content, artifact.sha256))) {
      return errorResponse(500, "診断DOMの整合性を確認できませんでした。");
    }
    return (await gunzipAsync(content)).toString("utf8");
  } catch {
    return errorResponse(410, "診断DOMの本体が見つかりません。");
  }
}

/** 強調表示だけを行う。ページ自身のスクリプトはCSPで動かない。 */
const highlightScript = (selector: string | null) => `
(() => {
  const selector = ${JSON.stringify(selector)};
  if (!selector) return;
  let nodes = [];
  try { nodes = [...document.querySelectorAll(selector)]; } catch {}
  const banner = document.createElement("div");
  banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:4px 8px;font:12px/1.4 sans-serif;color:#fff;background:" + (nodes.length ? "#b91c1c" : "#525252");
  banner.textContent = nodes.length
    ? "警告の箇所: " + selector + "（" + nodes.length + "件）"
    : "警告の箇所が見つかりません: " + selector;
  document.body.prepend(banner);
  for (const node of nodes) {
    node.style.outline = "3px solid #dc2626";
    node.style.outlineOffset = "2px";
  }
  nodes[0]?.scrollIntoView({ block: "center" });
})();
`;

/**
 * 診断DOMを管理画面の中で見るためのプレビュー。
 *
 * 外部サイトのHTMLなので、CSPのsandboxで別オリジン扱いにし、ページのスクリプトは
 * 止める。相対パスの画像やCSSは取得時のURLを基準に読む。
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ artifactId: string }> },
) {
  await requireAdmin();
  const { artifactId: rawArtifactId } = await context.params;
  const artifactId = artifactIdSchema.safeParse(rawArtifactId);
  if (!artifactId.success) {
    return errorResponse(400, "診断DOMのIDが不正です。");
  }
  const search = new URL(request.url).searchParams;
  const base = httpUrlSchema.safeParse(search.get("base"));
  const selector = search.get("selector")?.slice(0, 1_000) || null;

  const html = await readArtifactHtml(artifactId.data);
  if (html instanceof Response) return html;

  const nonce = randomBytes(16).toString("base64");
  const head = [
    base.success ? `<base href="${base.data.replaceAll('"', "&quot;")}">` : "",
    `<script nonce="${nonce}">document.addEventListener("DOMContentLoaded",()=>{${highlightScript(selector)}});</script>`,
  ].join("");
  const body = html
    .replace(/<script\b[\s\S]*?<\/script>/giu, "")
    .replace(/<meta\b[^>]*http-equiv=["']?refresh[^>]*>/giu, "")
    .replace(/<base\b[^>]*>/giu, "");
  const withHead = /<head\b[^>]*>/iu.test(body)
    ? body.replace(/<head\b[^>]*>/iu, match => `${match}${head}`)
    : `${head}${body}`;

  return new Response(withHead, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": [
        "sandbox allow-scripts",
        "default-src 'none'",
        "img-src * data: blob:",
        "style-src * 'unsafe-inline'",
        "font-src * data:",
        `script-src 'nonce-${nonce}'`,
        "form-action 'none'",
        "frame-ancestors 'self'",
      ].join("; "),
    },
  });
}
