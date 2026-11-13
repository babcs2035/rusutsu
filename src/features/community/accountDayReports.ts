"use server";

import { getShareMaps } from "@/server/share/data";
import { getDayReports } from "./actions";
import { idSchema, observedOnSchema } from "./contract";
import { dayResorts } from "./dayShare";

/** 投稿一覧を閉じずに、その日の地図と投稿を表示する。 */
export async function getAccountDayReports(
  authorId: string,
  observedOn: string,
) {
  if (
    !idSchema.safeParse(authorId).success ||
    !observedOnSchema.safeParse(observedOn).success
  )
    return { ok: false as const, error: "投稿の日付を確認してください。" };
  try {
    const result = await getDayReports(authorId, observedOn);
    if (!result.ok) return result;
    const maps = (
      await getShareMaps(dayResorts(result.data.posts).map(resort => resort.id))
    ).filter(map => map !== null);
    if (!maps.length)
      return {
        ok: false as const,
        error: "この日の地図を表示できませんでした。",
      };
    return { ok: true as const, data: result.data, maps };
  } catch {
    return {
      ok: false as const,
      error: "地図を読み込めませんでした。もう一度お試しください。",
    };
  }
}
