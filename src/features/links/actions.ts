"use server";

import { requireAdmin } from "@/lib/requireAdmin";
import { readAdminSkiResorts } from "@/lib/skiResortData";
import {
  getDataDocument,
  writeDataDocuments,
} from "@/server/data-documents/client";
import { DataDocumentConflictError } from "@/server/data-documents/contract";
import {
  type LinkSaveResult,
  linkSaveSchema,
  normalizeLinkList,
  patchLinksDocument,
} from "./model";

export async function saveResortLink(input: unknown): Promise<LinkSaveResult> {
  await requireAdmin();
  const parsed = linkSaveSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      message: parsed.error.issues.map(issue => issue.message).join("\n"),
    };
  const request = parsed.data;
  try {
    const resorts = await readAdminSkiResorts();
    if (
      !resorts.some(
        resort =>
          resort.id === request.resortId && resort.mergedIntoId === null,
      )
    )
      return {
        ok: false,
        message: "スキー場が存在しないか、別のスキー場に結合されています。",
      };
    for (let attempt = 0; attempt < 3; attempt++) {
      const document = await getDataDocument("SkiResortLinks.json");
      const content = patchLinksDocument(document?.content ?? null, request);
      try {
        await writeDataDocuments([
          {
            key: "SkiResortLinks.json",
            content,
            mediaType: "application/json",
            expectedHash: document?.hash ?? null,
          },
        ]);
        return { ok: true, links: normalizeLinkList(request.links) };
      } catch (error) {
        if (error instanceof DataDocumentConflictError && attempt < 2) continue;
        throw error;
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("この項目は"))
      return { ok: false, message: error.message };
    console.error("Failed to save resort link", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
  }
  return {
    ok: false,
    message:
      "保存できませんでした。入力内容は残っています。時間を置いて再度お試しください。",
  };
}
