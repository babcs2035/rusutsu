export const DEFAULT_CRAWLER_ARTIFACT_RETENTION_DAYS = 30;

export function artifactRetentionCutoff(
  env: Readonly<Record<string, string | undefined>> = process.env,
  now = Date.now(),
): Date {
  const days = Number(
    env.CRAWLER_ARTIFACT_RETENTION_DAYS ??
      DEFAULT_CRAWLER_ARTIFACT_RETENTION_DAYS,
  );
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650)
    throw new Error(
      "CRAWLER_ARTIFACT_RETENTION_DAYS must be an integer from 1 to 3650",
    );
  return new Date(now - days * 86_400_000);
}

type ExpiredArtifact = { id: string; storageKey: string | null };
export interface ArtifactRetentionRepository {
  listExpired(cutoff: Date, limit: number): Promise<ExpiredArtifact[]>;
  expire(ids: string[], cutoff: Date): Promise<number>;
}

/** Detach expired DOM only; keep runs/issues/hash so failures remain auditable. */
export async function expireReferencedArtifacts(
  repository: ArtifactRetentionRepository,
  cutoff: Date,
): Promise<number> {
  let expired = 0;
  for (let batch = 0; batch < 40; batch += 1) {
    const rows = await repository.listExpired(cutoff, 500);
    if (!rows.length) break;
    const changed = await repository.expire(
      rows.map(row => row.id),
      cutoff,
    );
    expired += changed;
    if (changed === 0 || rows.length < 500) break;
  }
  return expired;
}

export async function expireReferencedArtifactsDirect(): Promise<number> {
  const { prisma } = await import("@/lib/prisma");
  return expireReferencedArtifacts(
    {
      listExpired: (cutoff, take) =>
        prisma.crawlLatestArtifact.findMany({
          where: { storageKey: { not: null }, capturedAt: { lt: cutoff } },
          select: { id: true, storageKey: true },
          orderBy: { capturedAt: "asc" },
          take,
        }),
      expire: async (ids, cutoff) =>
        (
          await prisma.crawlLatestArtifact.updateMany({
            where: {
              id: { in: ids },
              storageKey: { not: null },
              capturedAt: { lt: cutoff },
            },
            data: {
              storageKey: null,
              state: "FAILED",
              captureError: "Rendered DOM expired under retention policy",
            },
          })
        ).count,
    },
    artifactRetentionCutoff(),
  );
}
