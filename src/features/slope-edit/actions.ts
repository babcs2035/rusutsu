"use server";

import {
  readSlopeBeforeGeojson,
  readSlopeDetailEntries,
} from "./server/slopeFiles";
import type { SlopeSourceData } from "./types";

// 既存の slope_before / slope_detail をサーバー側で読み込む（読み取り専用）
export async function loadSlopeSourceData(
  resortId: string,
): Promise<SlopeSourceData> {
  const [geojson, details] = await Promise.all([
    readSlopeBeforeGeojson(resortId),
    readSlopeDetailEntries(resortId),
  ]);
  return { geojson, details };
}
