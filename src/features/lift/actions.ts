"use server";

import * as editor from "./server/editorMutations";

/** ブラウザーから refreshLiftElevations の認可済み処理を呼び出す． */
export async function refreshLiftElevations(
  ...args: Parameters<typeof editor.refreshLiftElevations>
): ReturnType<typeof editor.refreshLiftElevations> {
  return editor.refreshLiftElevations(...args);
}

/** ブラウザーから saveLiftEdits の認可済み処理を呼び出す． */
export async function saveLiftEdits(
  ...args: Parameters<typeof editor.saveLiftEdits>
): ReturnType<typeof editor.saveLiftEdits> {
  return editor.saveLiftEdits(...args);
}

/** ブラウザーから saveResortLinks の認可済み処理を呼び出す． */
export async function saveResortLinks(
  ...args: Parameters<typeof editor.saveResortLinks>
): ReturnType<typeof editor.saveResortLinks> {
  return editor.saveResortLinks(...args);
}

/** ブラウザーから setLiftConfirmed の認可済み処理を呼び出す． */
export async function setLiftConfirmed(
  ...args: Parameters<typeof editor.setLiftConfirmed>
): ReturnType<typeof editor.setLiftConfirmed> {
  return editor.setLiftConfirmed(...args);
}
