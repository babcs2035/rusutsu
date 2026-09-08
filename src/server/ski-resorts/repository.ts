import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type AdminSkiResortRecord,
  type AdminSkiResortUpdate,
  type AdminSkiResortUpdateResult,
  adminSkiResortRecordSchema,
  adminSkiResortUpdateSchema,
} from "@/server/ski-resorts/adminContract";
import {
  mergeResortSummary,
  type ResortMergeRequest,
  type ResortMergeResult,
  resortMergeRequestSchema,
} from "./mergeContract";
import { ensureMergedGeometryDocuments } from "./mergeGeometry";
import {
  type PublicSkiResortRecord,
  publicSkiResortSchema,
  publicSkiResortSelect,
} from "./publicProjection";
import { readingRelationsSelect } from "./readingContract";

export const fullResortQuery = {
  where: { isActive: true, mergedIntoId: null },
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

export async function findSkiResortsForMapDirect() {
  return prisma.skiResort.findMany({
    where: { isActive: true, mergedIntoId: null },
    select: {
      id: true,
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
    },
    orderBy: { nameJa: "asc" },
  });
}

export async function findSkiResortByIdDirect(
  id: string,
): Promise<SkiResortDetailRecord | null> {
  const source = await prisma.skiResort.findUnique({
    where: { id },
    select: { mergedIntoId: true },
  });
  const row = await prisma.skiResort.findFirst({
    where: {
      id: source?.mergedIntoId ?? id,
      isActive: true,
      mergedIntoId: null,
    },
    ...resortDetailQuery,
  });
  return row ? projectResort(row) : null;
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
      isActive: true,
      mergedIntoId: null,
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
  const expectedDate = new Date(expectedUpdatedAt);
  const nextUpdatedAt = new Date(
    Math.max(Date.now(), expectedDate.getTime() + 1),
  );

  const { nameRuby, formerNames, ...scalars } = data;
  return prisma.$transaction(async transaction => {
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
  });
}

const projectResort = (
  row: Prisma.SkiResortGetPayload<{ select: typeof publicSkiResortSelect }>,
): PublicSkiResortRecord =>
  publicSkiResortSchema.parse({
    ...row,
    courses: [
      ...row.courses,
      ...row.mergedMembers.flatMap(member => member.courses),
    ],
    lifts: [...row.lifts, ...row.mergedMembers.flatMap(member => member.lifts)],
    tickets: [
      ...row.tickets,
      ...row.mergedMembers.flatMap(member => member.tickets),
    ],
  });

class MergeConflict extends Error {}

export async function mergeAdminSkiResortsDirect(
  rawRequest: ResortMergeRequest,
): Promise<ResortMergeResult> {
  const request = resortMergeRequestSchema.parse(rawRequest);
  try {
    return await prisma.$transaction(
      async transaction => {
        if (
          await transaction.skiResort.findUnique({
            where: { id: request.id },
            select: { id: true },
          })
        )
          return { status: "id_exists" as const };
        const rows = await transaction.skiResort.findMany({
          where: { id: { in: request.sources.map(source => source.id) } },
          select: { ...adminSkiResortSelect, yukiMagiId: true },
        });
        if (
          rows.length !== request.sources.length ||
          rows.some(row => row.mergedIntoId || row.sourceResortIds.length)
        )
          return { status: "invalid_sources" as const };
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
