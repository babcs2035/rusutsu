"use server";

import * as editor from "./server/editorMutations";

/** ブラウザーから saveReviewFiles の認可済み処理を呼び出す． */
export async function saveReviewFiles(
  ...args: Parameters<typeof editor.saveReviewFiles>
): ReturnType<typeof editor.saveReviewFiles> {
  return editor.saveReviewFiles(...args);
}
