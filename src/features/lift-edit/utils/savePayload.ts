import { DETAIL_KEYS, NUMERIC_DETAIL_KEYS } from "../constants";
import type { EditorLift, SaveLiftPayload } from "../types";
import { isSameMidstation } from "./liftOps";

const numericKeySet = new Set<string>(NUMERIC_DETAIL_KEYS);

// 既存の lift_detail と同じく、数値として読める値は数値で保存する
const toStoredValue = (key: string, value: string): string | number => {
  if (!numericKeySet.has(key)) return value;
  const trimmed = value.trim();
  if (trimmed === "") return value;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : value;
};

// 編集結果を lift_before の feature properties へ組み立てる。
// @id は読み込んだ値をそのまま維持し、空欄の詳細フィールドは保存しない。
export const liftToSavePayload = (lift: EditorLift): SaveLiftPayload => {
  const properties: Record<string, unknown> = {};
  if (lift.osmId !== null) properties["@id"] = lift.osmId;
  if (lift.name !== "") properties.name = lift.name;
  if (isSameMidstation(lift.midstation, lift.original.midstation)) {
    // 未変更なら（標高付き配列や空文字も含めて）読み込んだ生の値を維持する
    if (lift.midstationRaw !== null && lift.midstationRaw !== undefined) {
      properties.midstation = lift.midstationRaw;
    }
  } else if (lift.midstation !== null) {
    properties.midstation = lift.midstation;
  }
  // 中間駅を削除した場合（変更ありかつ null）はキー自体を書き込まない
  for (const key of DETAIL_KEYS) {
    const value = lift.detail[key];
    if (value !== "") properties[key] = toStoredValue(key, value);
  }
  // aerialway / start_date などの未対応フィールドをそのまま引き継ぐ
  for (const [key, value] of Object.entries(lift.extras)) {
    if (!(key in properties)) properties[key] = value;
  }
  return {
    targetSkiId: lift.skiId,
    properties,
    coordinates: lift.coordinates,
  };
};
