"use server";

import { readReviewForEdit, writeReviewFiles } from "./server/reviewFiles";
import type {
  ReviewActionResult,
  ReviewEditData,
  SaveReviewRequest,
} from "./types";

export async function loadReviewForEdit(
  resortId: string,
): Promise<ReviewEditData> {
  return readReviewForEdit(resortId);
}

export async function saveReviewFiles(
  request: SaveReviewRequest,
): Promise<ReviewActionResult> {
  return writeReviewFiles(request);
}
