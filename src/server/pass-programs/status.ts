import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PASS_PROGRAMS } from "@/shared/passPrograms";

/** 管理画面に「最近の追加・削除」として出す期間 */
const RECENT_DAYS = 30;

const changeSchema = z.object({ name: z.string(), at: z.string() });

export const passProgramStatusSchema = z.object({
  programs: z.array(
    z.object({
      programId: z.string(),
      label: z.string(),
      listUrl: z.string(),
      total: z.number().int(),
      added: z.array(changeSchema),
      removed: z.array(changeSchema),
      /** 名寄せできず、絞り込みに使われていない名前 */
      unmatched: z.array(z.string()),
    }),
  ),
  lastRun: z
    .object({
      status: z.string(),
      message: z.string().nullable(),
      at: z.string(),
    })
    .nullable(),
});
export type PassProgramStatus = z.infer<typeof passProgramStatusSchema>;

/**
 * シーズン券・キッズパスの対象スキー場一覧の状態。最初の取り込みより後に増えた・消えた名前を「変化」とする。
 */
export async function findPassProgramStatusDirect(
  now = new Date(),
): Promise<PassProgramStatus> {
  const since = new Date(now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000);
  const [rows, lastRun] = await Promise.all([
    prisma.passProgramResort.findMany({
      select: {
        programId: true,
        name: true,
        skiResortId: true,
        firstSeenAt: true,
        removedAt: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.crawlLog.findUnique({ where: { crawlerName: "passPrograms" } }),
  ]);
  return {
    programs: PASS_PROGRAMS.map(program => {
      const own = rows.filter(row => row.programId === program.id);
      const firstImport = Math.min(
        ...own.map(row => row.firstSeenAt.getTime()),
      );
      const active = own.filter(row => !row.removedAt);
      return {
        programId: program.id,
        label: program.name,
        listUrl: program.url,
        total: active.length,
        added: active
          .filter(
            row =>
              row.firstSeenAt > since &&
              // 最初の取り込みから1時間以内に入った行は、初回分として数えない
              row.firstSeenAt.getTime() - firstImport > 60 * 60 * 1000,
          )
          .map(row => ({ name: row.name, at: row.firstSeenAt.toISOString() })),
        removed: own
          .filter(row => row.removedAt && row.removedAt > since)
          .map(row => ({
            name: row.name,
            at: (row.removedAt as Date).toISOString(),
          })),
        unmatched: active.filter(row => !row.skiResortId).map(row => row.name),
      };
    }),
    lastRun: lastRun
      ? {
          status: lastRun.status,
          message: lastRun.message,
          at: lastRun.lastRunAt.toISOString(),
        }
      : null,
  };
}
