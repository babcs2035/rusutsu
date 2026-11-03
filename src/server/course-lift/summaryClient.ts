import "server-only";
import { z } from "zod";
import type { ResortOperatingCounts } from "@/features/home/utils/operatingCounts";
import {
  fetchInternalDataApi,
  InternalDataApiError,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import { prisma } from "@/lib/prisma";
import {
  calculateMapOperationSummaries,
  OPERATION_SUMMARY_VERSION,
} from "./operations";
import { writeOperationSummaries } from "./operationWrites";

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
  // 初回再構築が同時に走った場合だけ再試行する。通常の読み取りには追加SQLを出さない。
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(
        async tx => {
          const stored = await tx.skiResortOperationSummary.findMany();
          // 次のクロールまで旧版のコース数が残らないよう、旧版だけ読み取り時に再集計する。
          const updated = new Map(
            (
              await calculateMapOperationSummaries(
                tx,
                stored
                  .filter(
                    row => row.calculationVersion < OPERATION_SUMMARY_VERSION,
                  )
                  .map(row => row.skiResortId),
              )
            ).map(row => [row.skiResortId, row]),
          );
          // 移行時の再集計を保存し、次の画面読み取りで同じ計算を繰り返さない。
          await writeOperationSummaries(tx, [...updated.values()]);
          const rows = stored.map(row => updated.get(row.skiResortId) ?? row);
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
        },
        { isolationLevel: "RepeatableRead" },
      );
    } catch (error) {
      const details =
        error && typeof error === "object"
          ? (error as { code?: string; meta?: { code?: string } })
          : {};
      const retryable =
        details.code === "P2034" ||
        (details.code === "P2010" &&
          ["40001", "40P01"].includes(details.meta?.code ?? ""));
      if (!retryable || attempt >= 2) throw error;
    }
  }
}
