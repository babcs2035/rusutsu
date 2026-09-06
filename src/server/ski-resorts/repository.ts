import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type AdminSkiResortRecord,
  type AdminSkiResortUpdate,
  type AdminSkiResortUpdateResult,
  adminSkiResortRecordSchema,
} from "@/server/ski-resorts/adminContract";
import {
  type PublicSkiResortRecord,
  publicSkiResortSchema,
  publicSkiResortSelect,
} from "./publicProjection";
import { readingRelationsSelect } from "./readingContract";

export const fullResortQuery = {
  where: { isActive: true },
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
  return (await prisma.skiResort.findMany(fullResortQuery)).map(row =>
    publicSkiResortSchema.parse(row),
  );
}

export async function findSkiResortsForMapDirect() {
  return prisma.skiResort.findMany({
    where: { isActive: true },
    select: {
      id: true,
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
  return publicSkiResortSchema.nullable().parse(
    await prisma.skiResort.findFirst({
      where: { id, isActive: true },
      ...resortDetailQuery,
    }),
  );
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
    if (formerNames.length)
      await transaction.skiResortFormerName.createMany({
        data: formerNames.map((entry, position) => ({
          skiResortId: id,
          position,
          name: entry.name,
          reading: entry.reading ?? null,
        })),
      });
    const resort = await transaction.skiResort.findUniqueOrThrow({
      where: { id },
      select: adminSkiResortSelect,
    });
    return { status: "updated", resort: serializeAdminSkiResort(resort) };
  });
}
