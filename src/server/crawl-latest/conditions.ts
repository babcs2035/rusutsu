import "server-only";
import {
  type ResortConditions,
  sourceUrls,
} from "@/features/resort-detail/utils/currentConditions";
import { readBundledResortConditions } from "@/lib/bundledResortConditions";
import { prisma } from "@/lib/prisma";

export async function readAvailableConditions(
  resortId: string,
): Promise<ResortConditions> {
  const result: ResortConditions = { weather: null, comment: null };
  const rows = await prisma.crawlLatestCurrent.findMany({
    where: { skiResortId: resortId, kind: { in: ["WEATHER", "COMMENT"] } },
    select: {
      kind: true,
      snapshot: {
        select: {
          data: true,
          sourceUrls: true,
          run: { select: { observedAt: true } },
        },
      },
    },
  });
  for (const row of rows) {
    result[row.kind === "WEATHER" ? "weather" : "comment"] = {
      data: row.snapshot.data,
      sourceUrls: sourceUrls(row.snapshot.sourceUrls),
      time: row.snapshot.run.observedAt.toISOString(),
    };
  }
  if (result.weather && result.comment) return result;
  const captured = await readBundledResortConditions(resortId);
  result.weather ??= captured.weather;
  result.comment ??= captured.comment;
  return result;
}
