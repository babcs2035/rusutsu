import { gzipSync } from "node:zlib";
import { getDiagnosticArtifacts } from "@/private/scripts/crawl_latest/shared/diagnostics";
import { normalizeCrawlerRunSubmission } from "@/private/scripts/crawl_latest/shared/http-run-finalizer";
import type { CrawlerRunSubmission } from "@/private/scripts/crawl_latest/shared/latest-result-store";
import { saveRenderedDomArtifact } from "./artifactStorage";
import type { CrawlLatestRunInput } from "./contract";

/** The in-app YukiMagi job uses the same DB/artifact boundary without self-HTTP. */
export async function finalizeDiagnosticRunDirect(
  submission: CrawlerRunSubmission,
): Promise<void> {
  const artifacts: CrawlLatestRunInput["artifacts"] = [];
  const normalized = normalizeCrawlerRunSubmission(submission);
  for (const artifact of getDiagnosticArtifacts(submission.idempotencyKey)) {
    for (const [index, page] of artifact.manifest.pages.entries()) {
      const pageKey = `${artifact.manifest.id}-${index + 1}`;
      const common = {
        kind: "RENDERED_DOM" as const,
        pageKey,
        redactionVersion: 1,
        capturedAt: page.capturedAt,
        ...(page.url ? { finalUrl: page.url } : {}),
        issueExternalIds: normalized.issues.flatMap(issue => {
          const details = issue.details;
          return details &&
            typeof details === "object" &&
            !Array.isArray(details) &&
            typeof details.originalExternalId === "string" &&
            page.issueIds.includes(details.originalExternalId) &&
            issue.externalId
            ? [issue.externalId]
            : [];
        }),
      };
      const html = artifact.pages.find(
        candidate => candidate.file === page.file,
      )?.html;
      try {
        if (!html || !page.sha256)
          throw new Error(page.captureError ?? "Rendered DOM unavailable");
        const stored = await saveRenderedDomArtifact({
          producerId: submission.producerId ?? "crawl_latest",
          idempotencyKey: submission.idempotencyKey,
          resortId: submission.resortId,
          manifestId: artifact.manifest.id,
          pageKey,
          compressedHtml: gzipSync(html),
          expectedHtmlSha256: page.sha256,
        });
        const { created: _created, ...metadata } = stored;
        artifacts.push({ ...common, state: "AVAILABLE", ...metadata });
      } catch {
        // Preserve the original issue even when the DOM volume is unavailable.
        artifacts.push({
          ...common,
          state: "FAILED",
          captureError: "Rendered DOM could not be stored",
        });
      }
    }
  }
  const { persistCrawlLatestRun } = await import("./persistence");
  await persistCrawlLatestRun(
    normalizeCrawlerRunSubmission(submission, { remoteArtifacts: artifacts }),
    submission.idempotencyKey,
  );
  const { maybeCollectOrphanedCrawlLatestArtifacts } = await import(
    "./artifactGarbageCollector"
  );
  await maybeCollectOrphanedCrawlLatestArtifacts().catch(() => undefined);
}
