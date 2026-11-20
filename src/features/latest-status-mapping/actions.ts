"use server";

import * as editor from "./server/editorMutations";

/** ブラウザーから saveLatestStatusMapping の認可済み処理を呼び出す． */
export async function saveLatestStatusMapping(
  ...args: Parameters<typeof editor.saveLatestStatusMapping>
): ReturnType<typeof editor.saveLatestStatusMapping> {
  return editor.saveLatestStatusMapping(...args);
}
