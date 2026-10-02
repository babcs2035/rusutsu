import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type AdminSkiResortRecord,
  type AdminSkiResortUpdate,
  type AdminSkiResortUpdateResult,
  adminSkiResortRecordSchema,
  adminSkiResortUpdateSchema,
} from "@/server/ski-resorts/adminContract";
import { projectLinkedResort, projectResort } from "./detailProjection";
import {
  linkedAreaDefaults,
  mergeResortSummary,
  type ResortMergeRequest,
  type ResortMergeResult,
  type ResortUnlinkRequest,
  type ResortUnlinkResult,
  resortMergeRequestSchema,
  resortUnlinkRequestSchema,
  type TicketGroupRequest,
  type TicketGroupResult,
  ticketGroupRequestSchema,
} from "./mergeContract";
import { ensureMergedGeometryDocuments } from "./mergeGeometry";
import {
  type PublicSkiResortRecord,
  publicSkiResortSelect,
} from "./publicProjection";
import { readingRelationsSelect } from "./readingContract";

/**
 * 公開一覧と全国地図に出すスキー場。完全統合（MERGED）は親だけ、
 * 連携エリア（LINKED）は子だけを出す。
 */
export const publicResortWhere = {
  isActive: true,
  OR: [
    { mergedIntoId: null, linkKind: "MERGED" },
    { mergedInto: { is: { linkKind: "LINKED" } } },
  ],
} satisfies Prisma.SkiResortWhereInput;

/** 名前の参照用。連携エリアの親（料金・レビューの登録先）と子の両方を含む。 */
const namedResortWhere = {
  isActive: true,
  OR: [{ mergedIntoId: null }, { mergedInto: { is: { linkKind: "LINKED" } } }],
} satisfies Prisma.SkiResortWhereInput;

/** コース・リフト編集の単位。連携エリアは親でまとめて編集する。 */
const editorResortWhere = {
  isActive: true,
  mergedIntoId: null,
} satisfies Prisma.SkiResortWhereInput;

export const fullResortQuery = {
  where: publicResortWhere,
  select: publicSkiResortSelect,
  orderBy: { nameJa: "asc" },
} satisfies Prisma.SkiResortFindManyArgs;

export const resortDetailQuery = {
  // Legacy Weather JSON and LatestReport rows are not used by the detail UI.
  // Current operations and weather links are projected by their own services.
  select: publicSkiResortSelect,
} satisfies Prisma.SkiResortDefaultArgs;

export type FullSkiResortRecord = PublicSkiResortRecord;

export type SkiResortDetailRecord = PublicSkiResortRecord;

export type SkiResortMapRecord = Awaited<
  ReturnType<typeof findSkiResortsForMapDirect>
>[number];

const adminSkiResortSelect = {
  id: true,
  mergedIntoId: true,
  sourceResortIds: true,
  linkKind: true,
  ticketGroupId: true,
  updatedAt: true,
  nameJa: true,
  nameEn: true,
  shortName: true,
  ...readingRelationsSelect,
  readingNeedsReview: true,
  isActive: true,
  prefecture: true,
  town: true,
  latitude: true,
  longitude: true,
  topElevation: true,
  baseElevation: true,
  verticalDrop: true,
  numberOfCourses: true,
  longestCourse: true,
  steepestSlope: true,
  beginnersCoursesPercent: true,
  intermediateCoursesPercent: true,
  advancedCoursesPercent: true,
  courseImages: true,
  typeNotPressed: true,
  typePressed: true,
  typeBump: true,
  angleMax: true,
  angleAvg: true,
  numberOfLifts: true,
  ropeways: true,
  gondolas: true,
  quadLifts: true,
  tripleLifts: true,
  pairLifts: true,
  singleLifts: true,
  otherLifts: true,
  liftCapacity: true,
  weekdayOpen: true,
  weekdayClose: true,
  weekendOpen: true,
  weekendClose: true,
  timesComment: true,
  website: true,
  skiersPercent: true,
  snowboardersPercent: true,
  sources: true,
  descriptionShort: true,
  descriptionLong: true,
  outlineImages: true,
  condition: true,
  status: true,
  review: true,
} satisfies Prisma.SkiResortSelect;

type AdminSkiResortRow = Prisma.SkiResortGetPayload<{
  select: typeof adminSkiResortSelect;
}>;

const serializeAdminSkiResort = (
  resort: AdminSkiResortRow,
): AdminSkiResortRecord =>
  adminSkiResortRecordSchema.parse({
    ...resort,
    updatedAt: resort.updatedAt.toISOString(),
  });

export async function findSkiResortsDirect(): Promise<FullSkiResortRecord[]> {
  return (await prisma.skiResort.findMany(fullResortQuery)).map(projectResort);
}

const mapResortSelect = {
  id: true,
  mergedIntoId: true,
  sourceResortIds: true,
  nameJa: true,
  nameEn: true,
  shortName: true,
  ...readingRelationsSelect,
  prefecture: true,
  town: true,
  latitude: true,
  longitude: true,
  topElevation: true,
  baseElevation: true,
  verticalDrop: true,
  numberOfCourses: true,
  numberOfLifts: true,
  beginnersCoursesPercent: true,
  status: true,
  yukiMagiId: true,
} satisfies Prisma.SkiResortSelect;

export async function findSkiResortsForEditorDirect() {
  return prisma.skiResort.findMany({
    where: editorResortWhere,
    select: mapResortSelect,
    orderBy: { nameJa: "asc" },
  });
}

/** 連携エリアの親と、所属するスキー場ID（結合時の順）。 */
export async function findLinkedAreasDirect() {
  const parents = await prisma.skiResort.findMany({
    where: { linkKind: "LINKED", mergedMembers: { some: {} } },
    select: {
      id: true,
      nameJa: true,
      isActive: true,
      sourceResortIds: true,
      mergedMembers: { select: { id: true } },
    },
    orderBy: { id: "asc" },
  });
  return parents.map(parent => {
    const memberIds = new Set(parent.mergedMembers.map(member => member.id));
    return {
      id: parent.id,
      nameJa: parent.nameJa,
      isActive: parent.isActive,
      memberIds: [
        ...parent.sourceResortIds.filter(id => memberIds.has(id)),
        ...[...memberIds].filter(id => !parent.sourceResortIds.includes(id)),
      ],
    };
  });
}

export async function findSkiResortsForMapDirect() {
  return prisma.skiResort.findMany({
    where: publicResortWhere,
    select: mapResortSelect,
    orderBy: { nameJa: "asc" },
  });
}

export async function findSkiResortByIdDirect(
  id: string,
): Promise<SkiResortDetailRecord | null> {
  const source = await prisma.skiResort.findUnique({
    where: { id },
    select: {
      mergedIntoId: true,
      ticketGroupId: true,
      mergedInto: { select: { linkKind: true } },
    },
  });
  const ticketPartners = source?.ticketGroupId
    ? await prisma.skiResort.findMany({
        where: {
          ...publicResortWhere,
          ticketGroupId: source.ticketGroupId,
          id: { not: id },
        },
        select: { id: true, nameJa: true, shortName: true },
        orderBy: { nameJa: "asc" },
      })
    : [];
  if (source?.mergedIntoId && source.mergedInto?.linkKind === "LINKED") {
    const [own, area] = await Promise.all([
      prisma.skiResort.findFirst({
        where: { id, isActive: true },
        ...resortDetailQuery,
      }),
      prisma.skiResort.findFirst({
        where: { id: source.mergedIntoId, isActive: true, mergedIntoId: null },
        ...resortDetailQuery,
      }),
    ]);
    if (!own) return null;
    if (!area) return { ...projectResort(own), ticketPartners };
    return { ...projectLinkedResort(own, area), ticketPartners };
  }
  const row = await prisma.skiResort.findFirst({
    where: {
      id: source?.mergedIntoId ?? id,
      isActive: true,
      mergedIntoId: null,
    },
    ...resortDetailQuery,
  });
  return row ? { ...projectResort(row), ticketPartners } : null;
}

export async function findSkiResortWeatherDirect(id: string) {
  return prisma.weather.findMany({
    where: { skiResortId: id, skiResort: { isActive: true } },
    orderBy: { date: "desc" },
    take: 7,
  });
}

export async function findYukiMagiListDirect() {
  return prisma.yukiMagi.findMany({ orderBy: { name: "asc" } });
}

export async function findSkiResortNamesDirect(ids?: string[]) {
  return prisma.skiResort.findMany({
    where: {
      ...namedResortWhere,
      ...(ids ? { id: { in: ids } } : {}),
    },
    select: { id: true, nameJa: true, shortName: true },
    orderBy: { id: "asc" },
  });
}

export async function findExistingSkiResortIdsDirect(ids: string[]) {
  if (ids.length === 0) return [];
  const resorts = await prisma.skiResort.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  return resorts.map(resort => resort.id);
}

export async function findAdminSkiResortsDirect(): Promise<
  AdminSkiResortRecord[]
> {
  const resorts = await prisma.skiResort.findMany({
    select: adminSkiResortSelect,
    orderBy: [{ isActive: "desc" }, { nameJa: "asc" }],
  });
  return resorts.map(serializeAdminSkiResort);
}

export async function updateAdminSkiResortDirect(
  id: string,
  expectedUpdatedAt: string,
  data: AdminSkiResortUpdate,
): Promise<AdminSkiResortUpdateResult> {
  return prisma.$transaction(transaction =>
    updateAdminSkiResortInTransaction(transaction, id, expectedUpdatedAt, data),
  );
}

export async function updateAdminSkiResortInTransaction(
  transaction: Prisma.TransactionClient,
  id: string,
  expectedUpdatedAt: string,
  data: AdminSkiResortUpdate,
): Promise<AdminSkiResortUpdateResult> {
  const expectedDate = new Date(expectedUpdatedAt);
  const nextUpdatedAt = new Date(
    Math.max(Date.now(), expectedDate.getTime() + 1),
  );

  const { nameRuby, formerNames, ...scalars } = data;

  const update = await transaction.skiResort.updateMany({
    where: { id, updatedAt: expectedDate },
    data: { ...scalars, updatedAt: nextUpdatedAt },
  });

  if (update.count === 0) {
    const current = await transaction.skiResort.findUnique({
      where: { id },
      select: { updatedAt: true },
    });
    return current
      ? {
          status: "conflict" as const,
          currentUpdatedAt: current.updatedAt.toISOString(),
        }
      : { status: "not_found" as const };
  }

  await transaction.skiResortRubySegment.deleteMany({
    where: { skiResortId: id },
  });
  await transaction.skiResortFormerName.deleteMany({
    where: { skiResortId: id },
  });
  if (nameRuby.length)
    await transaction.skiResortRubySegment.createMany({
      data: nameRuby.map((segment, position) => ({
        skiResortId: id,
        position,
        text: segment.text,
        ruby: segment.ruby ?? null,
      })),
    });
  for (const [position, entry] of formerNames.entries()) {
    await transaction.skiResortFormerName.create({
      data: {
        skiResortId: id,
        position,
        name: entry.name,
        reading: entry.reading ?? null,
        nameRuby: {
          create: (
            entry.nameRuby ??
            (entry.reading ? [{ text: entry.name, ruby: entry.reading }] : [])
          ).map((segment, segmentPosition) => ({
            position: segmentPosition,
            text: segment.text,
            ruby: segment.ruby ?? null,
          })),
        },
      },
    });
  }
  const resort = await transaction.skiResort.findUniqueOrThrow({
    where: { id },
    select: adminSkiResortSelect,
  });
  return { status: "updated", resort: serializeAdminSkiResort(resort) };
}

class MergeConflict extends Error {}

export async function mergeAdminSkiResortsDirect(
  rawRequest: ResortMergeRequest,
): Promise<ResortMergeResult> {
  const parsed = resortMergeRequestSchema.parse(rawRequest);
  try {
    return await prisma.$transaction(
      async transaction => {
        const rows = await transaction.skiResort.findMany({
          where: { id: { in: parsed.sources.map(source => source.id) } },
          select: { ...adminSkiResortSelect, yukiMagiId: true },
        });
        if (
          rows.length !== parsed.sources.length ||
          rows.some(row => row.mergedIntoId || row.sourceResortIds.length)
        )
          return { status: "invalid_sources" as const };
        // 連携エリアで省略した ID・名称・引き継ぎ元は、選んだ順のスキー場から決める。
        const defaults = linkedAreaDefaults(
          parsed.sources.flatMap(source =>
            rows.filter(row => row.id === source.id),
          ),
        );
        let id = parsed.id;
        if (!id) {
          const candidates = defaults.idCandidates(20);
          const taken = new Set(
            (
              await transaction.skiResort.findMany({
                where: { id: { in: candidates } },
                select: { id: true },
              })
            ).map(row => row.id),
          );
          id = candidates.find(candidate => !taken.has(candidate));
          if (!id) return { status: "id_exists" as const };
        } else if (
          await transaction.skiResort.findUnique({
            where: { id },
            select: { id: true },
          })
        )
          return { status: "id_exists" as const };
        const request = {
          ...parsed,
          id,
          nameJa: parsed.nameJa ?? defaults.nameJa,
          nameEn: parsed.nameEn ?? defaults.nameEn,
          primaryId: parsed.primaryId ?? defaults.primaryId,
        };
        if (
          rows.some(
            row =>
              row.updatedAt.getTime() !==
              new Date(
                request.sources.find(source => source.id === row.id)
                  ?.expectedUpdatedAt ?? "",
              ).getTime(),
          )
        )
          return { status: "conflict" as const };
        const primary = rows.find(row => row.id === request.primaryId);
        if (!primary) return { status: "invalid_sources" as const };
        const members = rows.map(({ yukiMagiId: _yukiMagiId, ...row }) =>
          serializeAdminSkiResort(row),
        );
        const primaryMember = members.find(member => member.id === primary.id);
        if (!primaryMember) return { status: "invalid_sources" as const };
        const summary = mergeResortSummary(primaryMember, members);
        const {
          id: _id,
          updatedAt: _updated,
          mergedIntoId: _parent,
          sourceResortIds: _sources,
          linkKind: _linkKind,
          ticketGroupId: _ticketGroupId,
          ...editable
        } = summary;
        const {
          nameRuby: _ruby,
          formerNames: _former,
          ...scalars
        } = adminSkiResortUpdateSchema.parse(editable);
        const sourceResortIds = [
          request.primaryId,
          ...request.sources
            .map(source => source.id)
            .filter(id => id !== request.primaryId),
        ];
        const created = await transaction.skiResort.create({
          data: {
            ...scalars,
            id: request.id,
            nameJa: request.nameJa,
            nameEn: request.nameEn,
            shortName: null,
            readingNeedsReview: true,
            isActive: true,
            yukiMagiId: primary.yukiMagiId,
            sourceResortIds,
            linkKind: request.kind,
          },
          select: adminSkiResortSelect,
        });
        await ensureMergedGeometryDocuments(
          transaction,
          request.id,
          sourceResortIds.map(id => ({
            id,
            nameJa: members.find(member => member.id === id)?.nameJa ?? id,
          })),
          { linked: request.kind === "LINKED" },
        );
        for (const source of request.sources) {
          const result = await transaction.skiResort.updateMany({
            where: {
              id: source.id,
              updatedAt: new Date(source.expectedUpdatedAt),
              mergedIntoId: null,
            },
            data: {
              mergedIntoId: request.id,
              updatedAt: new Date(
                Math.max(
                  Date.now(),
                  new Date(source.expectedUpdatedAt).getTime() + 1,
                ),
              ),
            },
          });
          if (result.count !== 1) throw new MergeConflict();
        }
        const sources = await transaction.skiResort.findMany({
          where: { mergedIntoId: request.id },
          select: adminSkiResortSelect,
        });
        return {
          status: "created" as const,
          resort: serializeAdminSkiResort(created),
          sources: sources.map(serializeAdminSkiResort),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30_000,
      },
    );
  } catch (error) {
    if (
      error instanceof MergeConflict ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034")
    )
      return { status: "conflict" };
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return { status: "id_exists" };
    throw error;
  }
}

const bumpedUpdatedAt = (expected: Date) =>
  new Date(Math.max(Date.now(), expected.getTime() + 1));

const isRetryableConflict = (error: unknown) =>
  error instanceof MergeConflict ||
  (error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034");

/**
 * 連携エリアを解除する。子は通常のスキー場に戻し、親は非公開にして残す。
 * 親の地図・料金・レビューは消さず、子の元の地図データもそのまま使える。
 */
export async function unlinkAdminSkiResortsDirect(
  rawRequest: ResortUnlinkRequest,
): Promise<ResortUnlinkResult> {
  const request = resortUnlinkRequestSchema.parse(rawRequest);
  const expected = new Date(request.expectedUpdatedAt);
  try {
    return await prisma.$transaction(
      async transaction => {
        const parent = await transaction.skiResort.findUnique({
          where: { id: request.id },
          select: { linkKind: true, mergedIntoId: true, updatedAt: true },
        });
        if (parent?.linkKind !== "LINKED" || parent.mergedIntoId)
          return { status: "not_linked" as const };
        if (parent.updatedAt.getTime() !== expected.getTime())
          return { status: "conflict" as const };
        const members = await transaction.skiResort.findMany({
          where: { mergedIntoId: request.id },
          select: { id: true, updatedAt: true },
        });
        if (!members.length) return { status: "not_linked" as const };
        for (const member of members) {
          const result = await transaction.skiResort.updateMany({
            where: {
              id: member.id,
              updatedAt: member.updatedAt,
              mergedIntoId: request.id,
            },
            data: {
              mergedIntoId: null,
              updatedAt: bumpedUpdatedAt(member.updatedAt),
            },
          });
          if (result.count !== 1) throw new MergeConflict();
        }
        const resort = await transaction.skiResort.update({
          where: { id: request.id },
          data: { isActive: false, updatedAt: bumpedUpdatedAt(expected) },
          select: adminSkiResortSelect,
        });
        const sources = await transaction.skiResort.findMany({
          where: { id: { in: members.map(member => member.id) } },
          select: adminSkiResortSelect,
        });
        return {
          status: "unlinked" as const,
          resort: serializeAdminSkiResort(resort),
          sources: sources.map(serializeAdminSkiResort),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (isRetryableConflict(error)) return { status: "conflict" };
    throw error;
  }
}

/** 共通券の関係を設定・解除する。地図や詳細は統合しない。 */
export async function updateTicketGroupDirect(
  rawRequest: TicketGroupRequest,
): Promise<TicketGroupResult> {
  const request = ticketGroupRequestSchema.parse(rawRequest);
  try {
    return await prisma.$transaction(
      async transaction => {
        const targets =
          request.action === "set" ? request.resorts : [request.resort];
        const rows = await transaction.skiResort.findMany({
          where: { id: { in: targets.map(target => target.id) } },
          select: { id: true, updatedAt: true, ticketGroupId: true },
        });
        if (rows.length !== targets.length)
          return { status: "invalid_resorts" as const };
        if (
          rows.some(
            row =>
              row.updatedAt.getTime() !==
              new Date(
                targets.find(target => target.id === row.id)
                  ?.expectedUpdatedAt ?? "",
              ).getTime(),
          )
        )
          return { status: "conflict" as const };

        let ticketGroupId: string | null;
        let ids: string[];
        if (request.action === "set") {
          // 既存のグループに追加するときは、そのグループへまとめる。
          const existing = [
            ...new Set(rows.flatMap(row => row.ticketGroupId ?? [])),
          ];
          if (existing.length > 1)
            return { status: "invalid_resorts" as const };
          ticketGroupId = existing[0] ?? randomUUID();
          ids = rows.map(row => row.id);
        } else {
          const groupId = rows[0].ticketGroupId;
          if (!groupId) return { status: "invalid_resorts" as const };
          const remaining = await transaction.skiResort.findMany({
            where: { ticketGroupId: groupId, id: { not: rows[0].id } },
            select: { id: true },
          });
          ticketGroupId = null;
          // 1件だけ残るグループは意味がないので、残りも外す。
          ids = [
            rows[0].id,
            ...(remaining.length === 1 ? [remaining[0].id] : []),
          ];
        }
        for (const id of ids) {
          const row = rows.find(item => item.id === id);
          const result = await transaction.skiResort.updateMany({
            where: row ? { id, updatedAt: row.updatedAt } : { id },
            data: {
              ticketGroupId,
              updatedAt: bumpedUpdatedAt(row?.updatedAt ?? new Date()),
            },
          });
          if (result.count !== 1) throw new MergeConflict();
        }
        const resorts = await transaction.skiResort.findMany({
          where: { id: { in: ids } },
          select: adminSkiResortSelect,
        });
        return {
          status: "updated" as const,
          resorts: resorts.map(serializeAdminSkiResort),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (isRetryableConflict(error)) return { status: "conflict" };
    throw error;
  }
}
