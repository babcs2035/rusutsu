"use server";

import * as editor from "./server/editorPublication";

/** ブラウザーから previewReviewUpload の認可済み処理を呼び出す． */
export async function previewReviewUpload(
  ...args: Parameters<typeof editor.previewReviewUpload>
): ReturnType<typeof editor.previewReviewUpload> {
  return editor.previewReviewUpload(...args);
}

/** ブラウザーから publishReviewUpload の認可済み処理を呼び出す． */
export async function publishReviewUpload(
  ...args: Parameters<typeof editor.publishReviewUpload>
): ReturnType<typeof editor.publishReviewUpload> {
  return editor.publishReviewUpload(...args);
}
