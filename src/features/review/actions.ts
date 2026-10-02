"use server";

import { requireEditor } from "@/lib/requireEditor";

import { runEdit } from "@/server/edit-requests/workflow";

import { readReviewForEdit, writeReviewFiles } from "./server/reviewFiles";
import type {
  ReviewActionResult,
  ReviewEditData,
  SaveReviewRequest,
} from "./types";

export async function loadReviewForEdit(
  resortId: string,
): Promise<ReviewEditData> {
  await requireEditor();
  return readReviewForEdit(resortId);
}

export async function saveReviewFiles(
  request: SaveReviewRequest,
): Promise<ReviewActionResult> {
  return runEdit("review", request.resortId, request, async () => {
    return writeReviewFiles(request);
  });
}
