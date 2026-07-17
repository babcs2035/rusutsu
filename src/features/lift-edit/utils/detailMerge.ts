import { DETAIL_KEYS } from "../constants";
import type {
  DetailMatchMethod,
  EditorLift,
  LiftDetail,
  LiftDetailEntry,
} from "../types";

export const createEmptyLiftDetail = (): LiftDetail => ({
  speed: "",
  type: "",
  hood: "",
  capacity: "",
  distance: "",
  vertical: "",
  top: "",
  bottom: "",
  footrest: "",
  towers: "",
  oilShield: "",
  maker: "",
  year: "",
  note: "",
  searchWord: "",
  morning: "",
  night: "",
});

export const toDetailString = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === "string" ? value.trim() : "";
};

// lift_detail のエントリを編集用の LiftDetail へ変換する
// （一部データで maker が make というキーで入っているため両方見る）
export const entryToDetail = (entry: LiftDetailEntry): LiftDetail => {
  const detail = createEmptyLiftDetail();
  for (const key of DETAIL_KEYS) {
    detail[key] = toDetailString(entry[key]);
  }
  if (detail.maker === "") {
    detail.maker = toDetailString(entry.make);
  }
  return detail;
};

// lift_detail 側の値（非空）を優先し、空欄は現在の値を残す
export const mergeDetailEntry = (
  lift: EditorLift,
  entry: LiftDetailEntry,
  entryIndex: number,
  method: DetailMatchMethod,
): EditorLift => {
  const entryDetail = entryToDetail(entry);
  const merged: LiftDetail = { ...lift.detail };
  const mergedFields: Partial<LiftDetail> = {};
  for (const key of DETAIL_KEYS) {
    if (entryDetail[key] !== "") {
      merged[key] = entryDetail[key];
      mergedFields[key] = entryDetail[key];
    }
  }
  return {
    ...lift,
    detail: merged,
    detailMatch: {
      method,
      detailName: typeof entry.name === "string" ? entry.name : "",
      entryIndex,
      mergedFields,
    },
  };
};

// lift_detail との結合を解除して、読み込み時点の詳細へ戻す
export const unmergeDetailEntry = (lift: EditorLift): EditorLift => ({
  ...lift,
  detail: { ...lift.original.detail },
  detailMatch: null,
});
