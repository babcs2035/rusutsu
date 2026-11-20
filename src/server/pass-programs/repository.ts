import "server-only";

import { prisma } from "@/lib/prisma";
import {
  createPassProgramMatcher,
  type MatchedPassProgramEntry,
  matchPassProgramEntries,
} from "@/private/scripts/pass-programs/match";
import { replaceResortLinksDirect } from "@/server/resort-links/repository";
import type { PassProgramSync, PassProgramSyncResult } from "./contract";

const EDITOR_ID = "pass-programs";
const NSD_LINK_SOURCE = "nsdKids";

/** NSDキッズの紹介ページを、リンク集の「シーズン券・共通パス」の行にする */
const nsdKidsLinks = (entries: MatchedPassProgramEntry[]) => {
  const seen = new Set<string>();
  return entries.flatMap(entry => {
    if (!entry.skiResortId || !entry.url || seen.has(entry.skiResortId))
      return [];
    seen.add(entry.skiResortId);
    return [
      {
        resortId: entry.skiResortId,
        type: "pass",
        category: null,
        label: null,
        url: entry.url,
        note: null,
        sortOrder: 0,
      },
    ];
  });
};

/**
 * 1サービス分の対象スキー場一覧を、今のDBと比べて入れ替える（dryRun なら比べるだけ）。
 * 一覧から消えた名前は removedAt を付けて残す。件数が半分未満に減ったときは、サイトの不調とみなして書かない。
 */
export async function syncPassProgramDirect(
  input: PassProgramSync,
): Promise<PassProgramSyncResult> {
  const resorts = await prisma.skiResort.findMany({
    where: { isActive: true, mergedIntoId: null },
    select: {
      id: true,
      nameJa: true,
      shortName: true,
      prefecture: true,
      formerNames: { select: { name: true } },
    },
  });
  const entries = matchPassProgramEntries(
    input.programId,
    input.entries,
    createPassProgramMatcher(resorts),
  );
  const names = entries.map(entry => entry.name);
  if (new Set(names).size !== names.length)
    throw new Error("同じ名前が2回あります。");

  const current = await prisma.passProgramResort.findMany({
    where: { programId: input.programId },
    select: { id: true, name: true, skiResortId: true, removedAt: true },
  });
  const active = current.filter(row => !row.removedAt);
  const activeByName = new Map(active.map(row => [row.name, row]));
  const crawled = new Set(names);
  const removed = active.filter(row => !crawled.has(row.name));
  const links = input.programId === "nsdKids" ? nsdKidsLinks(entries) : null;
  const shrinkBlocked =
    !input.allowShrink && entries.length < active.length / 2;
  const result: PassProgramSyncResult = {
    programId: input.programId,
    dryRun: input.dryRun,
    before: active.length,
    total: entries.length,
    added: entries
      .filter(entry => !activeByName.has(entry.name))
      .map(entry => entry.name),
    removed: removed.map(row => row.name),
    rematched: entries.flatMap(entry => {
      const row = activeByName.get(entry.name);
      return row && row.skiResortId !== entry.skiResortId
        ? [{ name: entry.name, from: row.skiResortId, to: entry.skiResortId }]
        : [];
    }),
    unmatched: entries
      .filter(entry => !entry.skiResortId)
      .map(entry => ({ name: entry.name, candidates: entry.candidates })),
    links: links?.length ?? null,
    shrinkBlocked,
  };
  if (input.dryRun || shrinkBlocked) return result;

  const now = new Date();
  await prisma.$transaction(
    async transaction => {
      for (const entry of entries) {
        const data = {
          url: entry.url,
          prefecture: entry.prefecture,
          skiResortId: entry.skiResortId,
          lastSeenAt: now,
          removedAt: null,
        };
        await transaction.passProgramResort.upsert({
          where: {
            programId_name: { programId: input.programId, name: entry.name },
          },
          update: data,
          create: {
            programId: input.programId,
            name: entry.name,
            firstSeenAt: now,
            ...data,
          },
        });
      }
      if (removed.length > 0)
        await transaction.passProgramResort.updateMany({
          where: { id: { in: removed.map(row => row.id) } },
          data: { removedAt: now },
        });
    },
    { timeout: 60_000 },
  );
  if (links && links.length > 0)
    await replaceResortLinksDirect({
      scope: { kind: "source", source: NSD_LINK_SOURCE },
      editor: { kind: "crawler", id: EDITOR_ID },
      links,
    });
  return result;
}
