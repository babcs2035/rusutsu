import "server-only";
import {
  type ResortConditions,
  sourceUrls,
} from "@/features/resort-detail/utils/currentConditions";
import { prisma } from "@/lib/prisma";

/**
 * 公開画面の天気・コメント。採用済みの現在値だけを使い、掲載なし（EMPTY）は
 * 出さない。Git管理の過去の取得結果では補わない。
 */
export async function readAvailableConditions(
  resortId: string,
): Promise<ResortConditions> {
  const result: ResortConditions = {
    weather: null,
    comment: null,
    news: null,
  };
  const rows = await prisma.crawlLatestCurrent.findMany({
    where: {
      skiResortId: resortId,
      kind: { in: ["WEATHER", "COMMENT", "NEWS"] },
    },
    select: {
      kind: true,
      snapshot: {
        select: {
          state: true,
          data: true,
          sourceUrls: true,
          run: { select: { observedAt: true } },
        },
      },
    },
  });
  for (const row of rows) {
    if (row.snapshot.state !== "SUCCESS") continue;
    const key =
      row.kind === "WEATHER"
        ? "weather"
        : row.kind === "NEWS"
          ? "news"
          : "comment";
    result[key] = {
      data: row.snapshot.data,
      sourceUrls: sourceUrls(row.snapshot.sourceUrls),
      time: row.snapshot.run.observedAt.toISOString(),
    };
  }
  return result;
}
