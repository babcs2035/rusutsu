import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type DisplayGroup,
  type DisplayGroupDeleteRequest,
  type DisplayGroupDeleteResult,
  type DisplayGroupSaveRequest,
  type DisplayGroupSaveResult,
  displayGroupDeleteRequestSchema,
  displayGroupSaveRequestSchema,
} from "./displayGroupContract";
import { publicResortWhere } from "./repository";

const groupInclude = {
  members: {
    orderBy: { position: "asc" },
    select: {
      skiResort: { select: { id: true, nameJa: true, shortName: true } },
    },
  },
} satisfies Prisma.ResortDisplayGroupInclude;

type GroupRow = Prisma.ResortDisplayGroupGetPayload<{
  include: typeof groupInclude;
}>;

const serialize = (row: GroupRow): DisplayGroup => ({
  id: row.id,
  label: row.label,
  members: row.members.map(member => member.skiResort),
  updatedAt: row.updatedAt.toISOString(),
});

/** 管理画面用。すべての組 */
export async function listDisplayGroupsDirect(): Promise<DisplayGroup[]> {
  const rows = await prisma.resortDisplayGroup.findMany({
    include: groupInclude,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(serialize);
}

/** 詳細画面用。そのスキー場が入っている組 */
export async function listDisplayGroupsForResortDirect(
  resortId: string,
): Promise<DisplayGroup[]> {
  const rows = await prisma.resortDisplayGroup.findMany({
    where: { members: { some: { skiResortId: resortId } } },
    include: groupInclude,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(serialize);
}

class DisplayGroupConflict extends Error {}

/** 組を作る・置き換える。所属スキー場は渡した順に並べる。 */
export async function saveDisplayGroupDirect(
  rawRequest: DisplayGroupSaveRequest,
): Promise<DisplayGroupSaveResult> {
  const request = displayGroupSaveRequestSchema.parse(rawRequest);
  try {
    return await prisma.$transaction(
      async transaction => {
        // 公開中の単位（完全統合の子は除き、連携エリアの子は含む）だけを組にできる
        const resorts = await transaction.skiResort.findMany({
          where: { ...publicResortWhere, id: { in: request.resortIds } },
          select: { id: true },
        });
        if (resorts.length !== request.resortIds.length)
          return { status: "invalid_resorts" as const };
        const members = request.resortIds.map((skiResortId, position) => ({
          skiResortId,
          position,
        }));
        if (!request.id) {
          const created = await transaction.resortDisplayGroup.create({
            data: { label: request.label, members: { create: members } },
            include: groupInclude,
          });
          return { status: "saved" as const, group: serialize(created) };
        }
        const current = await transaction.resortDisplayGroup.findUnique({
          where: { id: request.id },
          select: { updatedAt: true },
        });
        if (!current) return { status: "not_found" as const };
        const expected = new Date(request.expectedUpdatedAt ?? "");
        if (current.updatedAt.getTime() !== expected.getTime())
          return { status: "conflict" as const };
        const updated = await transaction.resortDisplayGroup.updateMany({
          where: { id: request.id, updatedAt: current.updatedAt },
          data: { label: request.label },
        });
        if (updated.count !== 1) throw new DisplayGroupConflict();
        await transaction.resortDisplayGroupMember.deleteMany({
          where: { groupId: request.id },
        });
        await transaction.resortDisplayGroupMember.createMany({
          data: members.map(member => ({ ...member, groupId: request.id! })),
        });
        const saved = await transaction.resortDisplayGroup.findUniqueOrThrow({
          where: { id: request.id },
          include: groupInclude,
        });
        return { status: "saved" as const, group: serialize(saved) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof DisplayGroupConflict ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034")
    )
      return { status: "conflict" };
    throw error;
  }
}

export async function deleteDisplayGroupDirect(
  rawRequest: DisplayGroupDeleteRequest,
): Promise<DisplayGroupDeleteResult> {
  const request = displayGroupDeleteRequestSchema.parse(rawRequest);
  const deleted = await prisma.resortDisplayGroup.deleteMany({
    where: { id: request.id, updatedAt: new Date(request.expectedUpdatedAt) },
  });
  if (deleted.count === 1) return { status: "deleted" };
  const exists = await prisma.resortDisplayGroup.findUnique({
    where: { id: request.id },
    select: { id: true },
  });
  return { status: exists ? "conflict" : "not_found" };
}
