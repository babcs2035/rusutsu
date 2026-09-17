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

// 管理画面の名称対応付け専用。現在値テーブルや公開の営業状態は変更しない。
const archiveWhere = (kind: LatestStatusKind) => ({
  kind: categoryKind(kind),
  state: "SUCCESS" as const,
  validationState: { in: ["VALID", "WARNING"] as ("VALID" | "WARNING")[] },
  usableItemCount: { gt: 0 },
  run: {
    sourceMode: "WAYBACK_VALIDATION" as const,
    archiveTimestamp: { not: null },
  },
});

export async function findArchivedCrawlLatestStatusDirect(
  resortId: string,
  kind: LatestStatusKind,
): Promise<LatestSuccessfulStatus | null> {
  const snapshot = await prisma.crawlLatestCategorySnapshot.findFirst({
    where: { ...archiveWhere(kind), skiResortId: resortId },
    orderBy: [
      { run: { archiveTimestamp: "desc" } },
      { run: { observedAt: "desc" } },
      { id: "desc" },
    ],
    select: {
      id: true,
      data: true,
      sourceUrls: true,
      run: { select: { archiveTimestamp: true, observedAt: true } },
    },
  });
  if (!snapshot) return null;
  const items = normalizeItems(snapshot.data);
  if (!items.length) return null;
  return {
    fileName: `wayback-${snapshot.run.archiveTimestamp}-${snapshot.id}.json`,
    time: snapshot.run.observedAt.toISOString(),
    archiveTimestamp: snapshot.run.archiveTimestamp,
    items,
    sourceUrls: snapshot.sourceUrls,
  };
}

export async function listArchivedCrawlLatestResortIdsDirect(
  kind: LatestStatusKind,
): Promise<string[]> {
  const snapshots = await prisma.crawlLatestCategorySnapshot.findMany({
    where: archiveWhere(kind),
    distinct: ["skiResortId"],
    select: { skiResortId: true },
    orderBy: { skiResortId: "asc" },
  });
  return snapshots.map(snapshot => snapshot.skiResortId);
}
