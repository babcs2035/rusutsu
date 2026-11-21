"use server";

import * as corrections from "@/server/corrections/mutations";

/** ブラウザーから匿名の情報修正を送信する． */
export async function submitCorrection(
  ...args: Parameters<typeof corrections.submitCorrection>
): ReturnType<typeof corrections.submitCorrection> {
  return corrections.submitCorrection(...args);
}

/** ブラウザーから管理者の審査結果を記録する． */
export async function decideCorrectionItem(
  ...args: Parameters<typeof corrections.decideCorrectionItem>
): ReturnType<typeof corrections.decideCorrectionItem> {
  return corrections.decideCorrectionItem(...args);
}

/** ブラウザーから審査中の修正案を調整する． */
export async function adjustCorrectionItem(
  ...args: Parameters<typeof corrections.adjustCorrectionItem>
): ReturnType<typeof corrections.adjustCorrectionItem> {
  return corrections.adjustCorrectionItem(...args);
}
