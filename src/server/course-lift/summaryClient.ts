import "server-only";
import { z } from "zod";
import type { ResortOperatingCounts } from "@/features/home/utils/operatingCounts";
import {
  fetchInternalDataApi,
  InternalDataApiError,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import { prisma } from "@/lib/prisma";

const countSchema = z
  .object({
    total: z.number().int().positive(),
    active: z.number().int().nonnegative().nullable(),
  })
  .refine(count => count.active === null || count.active <= count.total);
const responseSchema = z.object({
  summaries: z.record(
    z.string(),
    z.object({
      hasMap: z.boolean(),
      courses: countSchema.nullable(),
      lifts: countSchema.nullable(),
    }),
  ),
});

export async function readOperatingSummaries(): Promise<
  Record<string, ResortOperatingCounts>
> {
  if (usesRemoteDataApi()) {
    let response: Response;
    try {
      response = await fetchInternalDataApi(
        "/api/internal/v1/map-operation-summaries",
      );
    } catch (error) {
      if (error instanceof InternalDataApiError && error.status === 404)
        return {};
      throw error;
    }
    return responseSchema.parse(await response.json()).summaries;
  }
  return findOperatingSummariesDirect();
}
export async function findOperatingSummariesDirect(): Promise<
  Record<string, ResortOperatingCounts>
> {
  const rows = await prisma.skiResortOperationSummary.findMany();
  return Object.fromEntries(
    rows.map(row => [
      row.skiResortId,
      {
        hasMap: row.hasMap,
        courses:
          row.courseTotal === null
            ? null
            : { total: row.courseTotal, active: row.courseActive },
        lifts:
          row.liftTotal === null
            ? null
            : { total: row.liftTotal, active: row.liftActive },
      },
    ]),
  );
}
