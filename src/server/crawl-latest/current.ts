import "server-only";

import type { CrawlLatestCategoryKind } from "@prisma/client";
import type {
  LatestStatusKind,
  LatestSuccessfulStatus,
} from "@/lib/latestStatusFiles";
import { prisma } from "@/lib/prisma";

const categoryKind = (kind: LatestStatusKind): CrawlLatestCategoryKind =>
  kind === "courses" ? "COURSES" : "LIFTS";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeItems = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          isRecord(item) &&
          typeof item.name === "string" &&
          item.name.trim() !== "",
      )
    : [];

export async function findCurrentCrawlLatestStatusDirect(
  resortId: string,
  kind: LatestStatusKind,
): Promise<LatestSuccessfulStatus | null> {
  const current = await prisma.crawlLatestCurrent.findUnique({
    where: {
      skiResortId_kind: {
        skiResortId: resortId,
        kind: categoryKind(kind),
      },
    },
    select: {
      snapshot: {
        select: {
          id: true,
          data: true,
          sourceUrls: true,
          run: { select: { observedAt: true } },
        },
      },
    },
  });
  if (!current) return null;

  const items = normalizeItems(current.snapshot.data);
  if (items.length === 0) return null;
  return {
    fileName: `db-${current.snapshot.run.observedAt
      .toISOString()
      .replace(/[-:.TZ]/gu, "")}-${current.snapshot.id}.json`,
    time: current.snapshot.run.observedAt.toISOString(),
    items,
    sourceUrls: current.snapshot.sourceUrls,
  };
}

export async function listCurrentCrawlLatestResortIdsDirect(
  kind: LatestStatusKind,
): Promise<string[]> {
  const currents = await prisma.crawlLatestCurrent.findMany({
    where: { kind: categoryKind(kind) },
    select: { skiResortId: true },
    orderBy: { skiResortId: "asc" },
  });
  return currents.map(current => current.skiResortId);
}
