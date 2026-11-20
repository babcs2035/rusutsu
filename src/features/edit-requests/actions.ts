"use server";

import * as editor from "@/server/edit-requests/actions";

/** ブラウザーから申請修正を実行する． */
export async function saveRequestCandidate(
  ...args: Parameters<typeof editor.saveRequestCandidate>
): ReturnType<typeof editor.saveRequestCandidate> {
  return editor.saveRequestCandidate(...args);
}

/** ブラウザーから申請を承認する． */
export async function approveEditRequest(
  ...args: Parameters<typeof editor.approveEditRequest>
): ReturnType<typeof editor.approveEditRequest> {
  return editor.approveEditRequest(...args);
}

/** ブラウザーから申請を却下する． */
export async function rejectEditRequest(
  ...args: Parameters<typeof editor.rejectEditRequest>
): ReturnType<typeof editor.rejectEditRequest> {
  return editor.rejectEditRequest(...args);
}

/** ブラウザーから自分の申請を取り下げる． */
export async function withdrawEditRequest(
  ...args: Parameters<typeof editor.withdrawEditRequest>
): ReturnType<typeof editor.withdrawEditRequest> {
  return editor.withdrawEditRequest(...args);
}
