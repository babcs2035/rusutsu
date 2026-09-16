import path from "node:path";
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

/**
 * 診断DOMを管理者セッションで取り出す中継。
 *
 * 内部APIはBearerトークン必須でブラウザーから直接は叩けないため、ここでサーバー側が
 * 取得して渡す。取得したHTMLは外部サイトの中身なので、必ず添付ファイルとして返し、
 * 管理画面のオリジンでは描画しない。
 */

const artifactIdSchema = z.string().cuid();

const downloadHeaders = (fileName: string) => ({
  "Cache-Control": "private, no-store",
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "sandbox",
  "X-Content-Type-Options": "nosniff",
  "Content-Disposition": `attachment; filename="${fileName}"`,
});

const safeFileName = (pageKey: string) =>
  `${path.basename(pageKey).replace(/[^A-Za-z0-9._-]/gu, "-")}.html`;

const errorResponse = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

export async function GET(
  _request: Request,
  context: { params: Promise<{ artifactId: string }> },
) {
  await requireAdmin();

  const { artifactId: rawArtifactId } = await context.params;
  const artifactId = artifactIdSchema.safeParse(rawArtifactId);
  if (!artifactId.success) {
    return errorResponse(400, "診断DOMのIDが不正です。");
  }

  if (usesRemoteDataApi()) {
    const response = await fetchInternalDataApi(
      `/api/internal/v1/crawl-latest-artifacts/${artifactId.data}/content`,
      {},
      { scope: "diagnostics-read", acceptedErrorStatuses: [404, 409, 410] },
    );
    if (!response.ok) {
      return errorResponse(response.status, "診断DOMを取得できませんでした。");
    }
    // undiciがgzipを解いた本文が返るため、ここでは圧縮ヘッダーを引き継がない。
    return new Response(await response.arrayBuffer(), {
      status: 200,
      headers: downloadHeaders(safeFileName(artifactId.data)),
    });
  }

  const artifact = await getCrawlLatestArtifact(artifactId.data);
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
    return new Response(Uint8Array.from(content), {
      status: 200,
      headers: {
        ...downloadHeaders(safeFileName(artifact.pageKey)),
        "Content-Encoding": "gzip",
      },
    });
  } catch {
    return errorResponse(410, "診断DOMの本体が見つかりません。");
  }
}
