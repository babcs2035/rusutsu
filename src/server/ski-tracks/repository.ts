// 同一ユーザーの登録を直列化し，重複と保存件数上限を保つ．
import type { SkiTrackImport } from "@prisma/client";
import type { TrackAnalysis } from "@/features/ski-tracks/contract";
import { prisma } from "@/lib/prisma";

export const MAX_SAVED_TRACKS = 500;

type TrackSaveResult =
  | { status: "missing" }
  | { status: "full" }
  | { status: "saved"; row: SkiTrackImport; duplicate: boolean };

/** 解析済みの滑走記録を，所有者ごとに一意かつ上限内で保存する． */
export async function saveAnalyzedTrack(
  userId: string,
  fileHash: string,
  fileName: string,
  analysis: TrackAnalysis,
): Promise<TrackSaveResult> {
  return prisma.$transaction(async tx => {
    // 追加だけを直列化し，ファイルの解析中はロックを持たない．
    const [owner] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE id = ${userId} FOR UPDATE
    `;
    if (!owner) return { status: "missing" };
    const previous = await tx.skiTrackImport.findUnique({
      where: { userId_fileHash: { userId, fileHash } },
    });
    if (previous) return { status: "saved", row: previous, duplicate: true };
    if (
      (await tx.skiTrackImport.count({ where: { userId } })) >= MAX_SAVED_TRACKS
    )
      return { status: "full" };
    const row = await tx.skiTrackImport.create({
      data: {
        userId,
        fileHash,
        fileName,
        recordedAt: new Date(analysis.start),
        analysis,
      },
    });
    return { status: "saved", row, duplicate: false };
  });
}
