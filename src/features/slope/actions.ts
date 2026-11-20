"use server";

/** ブラウザーから認可済みの編集処理を呼び出す入口． */
export {
  applySlopeFeatureOrder,
  refreshSlopeElevations,
  saveSlopeEdits,
  setOsmSlopeConfirmed,
} from "./server/editorMutations";
