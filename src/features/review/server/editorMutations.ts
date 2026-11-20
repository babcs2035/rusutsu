/** 編集申請と画面の更新が，同じ入力検証と保存処理を使う． */
import "server-only";

import { runEdit } from "@/server/edit-requests/workflow";
import type { ReviewActionResult, SaveReviewRequest } from "../types";
import { writeReviewFiles } from "./reviewFiles";

export async function saveReviewFiles(
  request: SaveReviewRequest,
): Promise<ReviewActionResult> {
  return runEdit("review", request.resortId, request, async () => {
    return writeReviewFiles(request);
  });
}
