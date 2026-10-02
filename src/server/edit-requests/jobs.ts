import "server-only";
import { enrichLiftElevations } from "@/features/lift/server/elevation";
import { enrichSlopeElevations } from "@/features/slope/server/elevation";
import { usesRemoteDataApi } from "@/lib/internalDataApiClient";
import { prisma, withPostgresAdvisoryLock } from "@/lib/prisma";
import {
  getDataDocument,
  writeDataDocuments,
} from "@/server/data-documents/client";
import { updateSavedElevations } from "@/server/elevationJob";
import type { ElevationTask } from "./contract";

export async function drainEditRequestJobs() {
  if (usesRemoteDataApi() || process.env.DISABLE_EDIT_REQUEST_JOBS === "true")
    return;
  // Session lock covers the network call as well as writes, across app replicas.
  await withPostgresAdvisoryLock(0x45524954, 1, async () => {
    const jobs = await prisma.editRequestJob.findMany({
      where: {
        status: { in: ["PENDING", "FAILED", "RUNNING"] },
        attempts: { lt: 5 },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    for (const job of jobs) {
      const task = job.payload as unknown as ElevationTask;
      await prisma.editRequestJob.update({
        where: { id: job.id },
        data: {
          status: "RUNNING",
          attempts: { increment: 1 },
          lastError: null,
        },
      });
      try {
        const current = await getDataDocument(task.key);
        if (current?.hash !== task.hash) {
          await prisma.editRequestJob.update({
            where: { id: job.id },
            data: { status: "SUPERSEDED" },
          });
          continue;
        }
        await updateSavedElevations(task, {
          read: getDataDocument,
          write: writeDataDocuments,
          enrich: () =>
            task.kind === "slope"
              ? enrichSlopeElevations(
                  task.source,
                  undefined,
                  JSON.parse(task.content),
                )
              : enrichLiftElevations(JSON.parse(task.content)),
        });
        await prisma.editRequestJob.update({
          where: { id: job.id },
          data: { status: "DONE" },
        });
      } catch {
        await prisma.editRequestJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            lastError: "標高更新に失敗しました。次の実行時に再試行します。",
          },
        });
      }
    }
  });
}
