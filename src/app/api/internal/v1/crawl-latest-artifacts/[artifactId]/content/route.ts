import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import {
  readStoredArtifact,
  verifyStoredRenderedDom,
} from "@/server/crawl-latest/artifactStorage";
import { getCrawlLatestArtifact } from "@/server/crawl-latest/persistence";
import {
  internalApiError,
  logInternalApiFailure,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const artifactIdSchema = z.string().cuid();

export async function GET(
  request: Request,
  context: { params: Promise<{ artifactId: string }> },
) {
  const authorizationError = requireInternalApiRequest(
    request,
    "diagnostics-read",
  );
  if (authorizationError) return authorizationError;
  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    return internalApiError(400, "INVALID_QUERY", "Unknown query parameter");
  }

  const { artifactId: rawArtifactId } = await context.params;
  const artifactId = artifactIdSchema.safeParse(rawArtifactId);
  if (!artifactId.success) {
    return internalApiError(
      400,
      "INVALID_ARTIFACT_ID",
      "Artifact id is invalid",
    );
  }

  try {
    const artifact = await getCrawlLatestArtifact(artifactId.data);
    if (!artifact) {
      return internalApiError(
        404,
        "ARTIFACT_NOT_FOUND",
        "Artifact was not found",
      );
    }
    if (
      artifact.state !== "AVAILABLE" ||
      !artifact.storageKey ||
      !artifact.sha256 ||
      artifact.contentEncoding !== "gzip"
    ) {
      return internalApiError(
        409,
        "ARTIFACT_NOT_AVAILABLE",
        "Artifact content is not available",
      );
    }

    const content = await readStoredArtifact(artifact.storageKey);
    if (!(await verifyStoredRenderedDom(content, artifact.sha256))) {
      throw new Error("Stored artifact failed integrity verification");
    }
    const compressedSha256 = createHash("sha256").update(content).digest("hex");
    const downloadName = `${path.basename(artifact.pageKey).replace(/[^A-Za-z0-9._-]/gu, "-")}.gz`;
    return new Response(Uint8Array.from(content), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        Vary: "Authorization",
        "Content-Type": artifact.contentType ?? "text/html; charset=utf-8",
        "Content-Encoding": "gzip",
        "Content-Length": String(content.byteLength),
        "Content-Disposition": `attachment; filename="${downloadName}"`,
        "X-Artifact-Html-Sha256": artifact.sha256,
        "X-Artifact-Compressed-Sha256": compressedSha256,
      },
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return internalApiError(
        410,
        "ARTIFACT_FILE_MISSING",
        "Artifact metadata exists but content is missing",
      );
    }
    logInternalApiFailure("Failed to read crawler artifact", error);
    return internalApiError(500, "INTERNAL_ERROR", "Unable to read artifact");
  }
}
