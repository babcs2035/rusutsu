import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  LiftTicketConflictError,
  type LiftTicketSeason,
  type LiftTicketSeasonSummary,
  type LiftTicketSeasonWrite,
  liftTicketSeasonSchema,
  liftTicketSeasonSummarySchema,
  liftTicketSeasonWriteSchema,
  statusOfLiftTicket,
} from "./contract";

const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

const summarySelect = {
  skiResortId: true,
  seasonId: true,
  status: true,
  version: true,
  updatedAt: true,
} satisfies Prisma.LiftTicketSeasonSelect;
const seasonSelect = {
  ...summarySelect,
  data: true,
} satisfies Prisma.LiftTicketSeasonSelect;

type SummaryRow = Prisma.LiftTicketSeasonGetPayload<{
  select: typeof summarySelect;
}>;
type SeasonRow = Prisma.LiftTicketSeasonGetPayload<{
  select: typeof seasonSelect;
}>;

const toSummary = (row: SummaryRow): LiftTicketSeasonSummary =>
  liftTicketSeasonSummarySchema.parse({
    resortId: row.skiResortId,
    seasonId: row.seasonId,
    status: row.status,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  });

const toSeason = (row: SeasonRow): LiftTicketSeason =>
  liftTicketSeasonSchema.parse({ ...toSummary(row), data: row.data });

export async function listLiftTicketSeasonsDirect(): Promise<
  LiftTicketSeasonSummary[]
> {
  const rows = await prisma.liftTicketSeason.findMany({
    select: summarySelect,
    orderBy: [{ skiResortId: "asc" }, { seasonId: "desc" }],
  });
  return rows.map(toSummary);
}

export async function getLiftTicketSeasonDirect(
  resortId: string,
  seasonId: string,
): Promise<LiftTicketSeason | null> {
  const row = await prisma.liftTicketSeason.findUnique({
    where: { skiResortId_seasonId: { skiResortId: resortId, seasonId } },
    select: seasonSelect,
  });
  return row === null ? null : toSeason(row);
}

/** 公開画面用。指定スキー場の全シーズンを新しい順に返す。 */
export async function findLiftTicketSeasonsDirect(
  resortIds: readonly string[],
): Promise<LiftTicketSeason[]> {
  if (resortIds.length === 0) return [];
  const rows = await prisma.liftTicketSeason.findMany({
    where: { skiResortId: { in: [...resortIds] } },
    select: seasonSelect,
    orderBy: [{ skiResortId: "asc" }, { seasonId: "desc" }],
  });
  return rows.map(toSeason);
}

/**
 * 読んだ時点の version と一致するときだけ保存する。
 * 管理画面と `mise run lift-ticket:publish` が同じ規則で競合を検出する。
 */
export async function writeLiftTicketSeasonDirect(
  input: LiftTicketSeasonWrite,
): Promise<LiftTicketSeason> {
  const write = liftTicketSeasonWriteSchema.parse(input);
  const key = { skiResortId: write.resortId, seasonId: write.seasonId };
  const status = statusOfLiftTicket(write.data);
  const data = write.data as Prisma.InputJsonObject;

  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt++
  ) {
    try {
      return await prisma.$transaction(
        async transaction => {
          const current = await transaction.liftTicketSeason.findUnique({
            where: { skiResortId_seasonId: key },
            select: { version: true },
          });
          const actualVersion = current?.version ?? null;
          if (actualVersion !== write.expectedVersion)
            throw new LiftTicketConflictError(actualVersion);
          const row = await transaction.liftTicketSeason.upsert({
            where: { skiResortId_seasonId: key },
            create: { ...key, status, data },
            update: { status, data, version: { increment: 1 } },
            select: seasonSelect,
          });
          return toSeason(row);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30_000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        // 同じ未登録シーズンの並行作成は一意制約違反(P2002)になることがある。
        (error.code === "P2034" || error.code === "P2002") &&
        attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS
      )
        continue;
      throw error;
    }
  }
  throw new Error("Serializable lift ticket transaction retry limit exceeded");
}
