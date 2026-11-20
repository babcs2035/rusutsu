"use server";

import { runEdit } from "@/server/edit-requests/workflow";

import { writeReviewFiles } from "./server/reviewFiles";
import type { ReviewActionResult, SaveReviewRequest } from "./types";

export async function saveReviewFiles(
  request: SaveReviewRequest,
): Promise<ReviewActionResult> {
  return runEdit("review", request.resortId, request, async () => {
    return writeReviewFiles(request);
  });
}
