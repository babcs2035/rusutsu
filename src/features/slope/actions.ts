"use server";

import * as editor from "./server/editorMutations";

/** ブラウザーから applySlopeFeatureOrder の認可済み処理を呼び出す． */
export async function applySlopeFeatureOrder(
  ...args: Parameters<typeof editor.applySlopeFeatureOrder>
): ReturnType<typeof editor.applySlopeFeatureOrder> {
  return editor.applySlopeFeatureOrder(...args);
}

/** ブラウザーから refreshSlopeElevations の認可済み処理を呼び出す． */
export async function refreshSlopeElevations(
  ...args: Parameters<typeof editor.refreshSlopeElevations>
): ReturnType<typeof editor.refreshSlopeElevations> {
  return editor.refreshSlopeElevations(...args);
}

/** ブラウザーから saveSlopeEdits の認可済み処理を呼び出す． */
export async function saveSlopeEdits(
  ...args: Parameters<typeof editor.saveSlopeEdits>
): ReturnType<typeof editor.saveSlopeEdits> {
  return editor.saveSlopeEdits(...args);
}

/** ブラウザーから setOsmSlopeConfirmed の認可済み処理を呼び出す． */
export async function setOsmSlopeConfirmed(
  ...args: Parameters<typeof editor.setOsmSlopeConfirmed>
): ReturnType<typeof editor.setOsmSlopeConfirmed> {
  return editor.setOsmSlopeConfirmed(...args);
}
