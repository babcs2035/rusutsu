"use server";

import { requireAdmin } from "@/lib/requireAdmin";
import { readReviewForEdit, writeReviewFiles } from "./server/reviewFiles";
import type {
  ReviewActionResult,
  ReviewEditData,
  SaveReviewRequest,
} from "./types";

export async function loadReviewForEdit(
  resortId: string,
): Promise<ReviewEditData> {
  await requireAdmin();
  return readReviewForEdit(resortId);
}

export async function saveReviewFiles(
  request: SaveReviewRequest,
): Promise<ReviewActionResult> {
  await requireAdmin();
  return writeReviewFiles(request);
}
