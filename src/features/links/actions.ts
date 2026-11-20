"use server";

import * as editor from "./server/editorMutations";

/** ブラウザーから saveResortLink の認可済み処理を呼び出す． */
export async function saveResortLink(
  ...args: Parameters<typeof editor.saveResortLink>
): ReturnType<typeof editor.saveResortLink> {
  return editor.saveResortLink(...args);
}
