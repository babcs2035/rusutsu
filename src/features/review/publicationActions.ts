"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { InternalDataApiError } from "@/lib/internalDataApiClient";
import { requireAdmin } from "@/lib/requireAdmin";
import { readExistingSkiResortIds } from "@/lib/skiResortData";
import * as client from "@/server/data-documents/client";
import { DataDocumentConflictError } from "@/server/data-documents/contract";
import { prepareReviewPublication, publishReview } from "./server/publication";
import {
  reviewContentSchema,
  reviewPublicationSchema,
} from "./server/publicationContract";

const errorMessage = (error: unknown) => {
  if (error instanceof ZodError)
    return error.issues
      .slice(0, 12)
      .map(issue => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
  if (
    error instanceof DataDocumentConflictError ||
    (error instanceof InternalDataApiError && error.status === 409)
  )
    return "確認後に本番データが変更されました。再度読み込んで差分を確認してください。";
  return "読み込みまたは保存に失敗しました。接続設定を確認してください。";
};

export async function previewReviewUpload(raw: unknown) {
  await requireAdmin();
  try {
    const content = reviewContentSchema.parse(raw);
    if (!(await readExistingSkiResortIds([content.resortId])).length)
      return {
        ok: false as const,
        error: "このスキー場IDは登録されていません。",
      };
    return {
      ok: true as const,
      preview: await prepareReviewPublication(client, content),
    };
  } catch (error) {
    return { ok: false as const, error: errorMessage(error) };
  }
}

export async function publishReviewUpload(raw: unknown) {
  await requireAdmin();
  try {
    const publication = reviewPublicationSchema.parse(raw);
    if (
      !(await readExistingSkiResortIds([publication.content.resortId])).length
    )
      return {
        ok: false as const,
        error: "このスキー場IDは登録されていません。",
      };
    await publishReview(client, publication);
    revalidatePath("/admin/review");
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: errorMessage(error) };
  }
}
