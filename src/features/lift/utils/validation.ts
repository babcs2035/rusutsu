import { JAPAN_BOUNDS } from "@/features/slope/constants";
import type { ValidationResult } from "@/features/slope/types";
import type { EditorLift, LngLat } from "../types";
import { liftDisplayName } from "./liftOps";

const isFiniteLngLat = (coordinate: LngLat): boolean =>
  Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]);

const isInsideJapan = (coordinate: LngLat): boolean =>
  coordinate[0] >= JAPAN_BOUNDS.minLng &&
  coordinate[0] <= JAPAN_BOUNDS.maxLng &&
  coordinate[1] >= JAPAN_BOUNDS.minLat &&
  coordinate[1] <= JAPAN_BOUNDS.maxLat;

const looksLatLngSwapped = (coordinate: LngLat): boolean =>
  !isInsideJapan(coordinate) && isInsideJapan([coordinate[1], coordinate[0]]);

// 保存前のバリデーション。errors があれば保存しない
export const validateLifts = (
  lifts: EditorLift[],
  knownResortIds: Set<string>,
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  lifts.forEach((lift, index) => {
    const label = liftDisplayName(lift, index);

    if (lift.coordinates.length < 2) {
      errors.push(
        `「${label}」の点が ${lift.coordinates.length} 個しかありません。2 点以上必要です。`,
      );
    }
    if (lift.coordinates.some(coordinate => !isFiniteLngLat(coordinate))) {
      errors.push(`「${label}」に不正な座標が含まれています。`);
      return;
    }
    if (lift.coordinates.some(looksLatLngSwapped)) {
      warnings.push(
        `「${label}」の座標が [経度, 緯度] の順になっていない可能性があります。`,
      );
    } else if (
      lift.coordinates.some(coordinate => !isInsideJapan(coordinate))
    ) {
      warnings.push(
        `「${label}」に日本周辺から明らかに外れた座標が含まれています。`,
      );
    }
    if (!knownResortIds.has(lift.skiId)) {
      errors.push(
        `「${label}」の所属スキー場ID「${lift.skiId}」がスキー場一覧に存在しません。`,
      );
    }
    if (lift.name === "") {
      warnings.push(`「${label}」のリフト名が未入力です。`);
    }
  });

  // 同じ所属スキー場内での @id 重複はエラー
  const seen = new Map<string, string>();
  lifts.forEach((lift, index) => {
    if (!lift.osmId) return;
    const key = `${lift.skiId}:${lift.osmId}`;
    const firstLabel = seen.get(key);
    if (firstLabel !== undefined) {
      errors.push(
        `「${liftDisplayName(lift, index)}」と「${firstLabel}」の @id が重複しています（${lift.osmId}）。`,
      );
    } else {
      seen.set(key, liftDisplayName(lift, index));
    }
  });

  return { errors, warnings };
};
