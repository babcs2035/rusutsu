"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  getDataDocument,
  writeDataDocuments,
} from "@/server/data-documents/client";
import { DataDocumentConflictError } from "@/server/data-documents/contract";
import { readSplitArea, splitAssignmentDocumentKey } from "./server/splitAreas";
import {
  SPLIT_LAYER_KINDS,
  type SplitAssignmentDocument,
  type SplitSaveResult,
} from "./types";

const saveSchema = z.object({
  areaId: z.string().regex(/^[a-z0-9-]+$/u),
  layers: z.array(
    z.object({
      kind: z.enum(SPLIT_LAYER_KINDS),
      sourceHash: z.string(),
      memberIds: z.array(z.string()),
    }),
  ),
});

export async function saveMapSplit(input: unknown): Promise<SplitSaveResult> {
  await requireAdmin();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "入力が不正です。" };
  const request = parsed.data;
  try {
    const area = await readSplitArea(request.areaId);
    if (!area) return { ok: false, message: "対象のエリアが見つかりません。" };
    const memberIds = new Set(area.members.map(member => member.id));
    const layers: SplitAssignmentDocument["layers"] = [];
    for (const layer of area.layers) {
      const requested = request.layers.find(item => item.kind === layer.kind);
      if (
        !requested ||
        requested.sourceHash !== layer.sourceHash ||
        requested.memberIds.length !== layer.lines.length
      )
        return {
          ok: false,
          message:
            "元の地図が更新されています。再読み込みしてからやり直してください。",
        };
      if (requested.memberIds.some(id => !memberIds.has(id)))
        return { ok: false, message: "振り分け先のスキー場が不正です。" };
      layers.push({
        kind: layer.kind,
        sourceKey: layer.sourceKey,
        sourceHash: layer.sourceHash,
        assignments: layer.lines.map((line, i) => ({
          index: line.index,
          name: line.name,
          memberId: requested.memberIds[i] as string,
        })),
      });
    }
    const savedAt = new Date().toISOString();
    const content: SplitAssignmentDocument = {
      version: 1,
      areaId: area.id,
      members: area.members,
      savedAt,
      layers,
    };
    const key = splitAssignmentDocumentKey(area.id);
    const current = await getDataDocument(key);
    await writeDataDocuments([
      {
        key,
        content: `${JSON.stringify(content, null, 2)}\n`,
        mediaType: "application/json",
        expectedHash: current?.hash ?? null,
      },
    ]);
    return { ok: true, savedAt };
  } catch (error) {
    if (error instanceof DataDocumentConflictError)
      return {
        ok: false,
        message: "別の画面で保存されています。再読み込みしてください。",
      };
    console.error("Failed to save map split", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return { ok: false, message: "保存できませんでした。" };
  }
}
