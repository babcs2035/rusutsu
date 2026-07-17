import { DETAIL_KEYS, DETAIL_LABELS } from "../constants";
import type { EditorLift, LiftDetailKey } from "../types";
import {
  distanceM,
  formatDistanceM,
  hasMidstationChange,
  isSameCoordinates,
} from "./liftOps";

export type FieldChange = {
  key: string;
  label: string;
  before: string;
  after: string;
};

export type LiftChanges = {
  lift: EditorLift;
  skiIdChange: { before: string; after: string } | null;
  geometryChange: string | null;
  fieldChanges: FieldChange[];
  mergedFields: FieldChange[];
};

const describeMidstationChange = (lift: EditorLift): string | null => {
  if (!hasMidstationChange(lift)) return null;
  const before = lift.original.midstation;
  const after = lift.midstation;
  if (before === null && after !== null) return "中間駅を追加";
  if (before !== null && after === null) return "中間駅を削除";
  if (before !== null && after !== null) {
    return `中間駅を移動（${formatDistanceM(distanceM(before, after))}）`;
  }
  return null;
};

const describeGeometryChange = (lift: EditorLift): string | null => {
  const parts: string[] = [];
  const before = lift.original.coordinates;
  const after = lift.coordinates;
  if (!isSameCoordinates(before, after)) {
    if (lift.isNew) {
      parts.push(`新規追加（${after.length} 点）`);
    } else if (before.length !== after.length) {
      parts.push(`頂点数 ${before.length} → ${after.length}`);
    } else {
      const moved = before
        .map((pair, index) => ({
          index,
          distance: distanceM(pair, after[index]),
        }))
        .filter(item => item.distance > 0);
      const maxMove = Math.max(...moved.map(item => item.distance));
      parts.push(
        `${moved.length} 点を移動（最大 ${formatDistanceM(maxMove)}）`,
      );
    }
  }
  const midstationChange = describeMidstationChange(lift);
  if (midstationChange) parts.push(midstationChange);
  return parts.length > 0 ? parts.join(" / ") : null;
};

// 確認画面用に 1 リフト分の変更内容をまとめる
export const collectLiftChanges = (lift: EditorLift): LiftChanges => {
  const fieldChanges: FieldChange[] = [];
  if (lift.name !== lift.original.name) {
    fieldChanges.push({
      key: "name",
      label: "リフト名",
      before: lift.original.name,
      after: lift.name,
    });
  }
  if (lift.aerialway !== lift.original.aerialway) {
    fieldChanges.push({
      key: "aerialway",
      label: "aerialway",
      before: lift.original.aerialway,
      after: lift.aerialway,
    });
  }
  for (const key of DETAIL_KEYS) {
    if (lift.detail[key] !== lift.original.detail[key]) {
      fieldChanges.push({
        key,
        label: DETAIL_LABELS[key],
        before: lift.original.detail[key],
        after: lift.detail[key],
      });
    }
  }

  const mergedFields: FieldChange[] = Object.entries(
    lift.detailMatch?.mergedFields ?? {},
  ).map(([key, value]) => ({
    key,
    label: DETAIL_LABELS[key as LiftDetailKey] ?? key,
    before: lift.original.detail[key as LiftDetailKey] ?? "",
    after: value ?? "",
  }));

  return {
    lift,
    skiIdChange:
      lift.skiId !== lift.original.skiId
        ? { before: lift.original.skiId, after: lift.skiId }
        : null,
    geometryChange: describeGeometryChange(lift),
    fieldChanges,
    mergedFields,
  };
};

export const hasAnyChange = (changes: LiftChanges): boolean =>
  changes.skiIdChange !== null ||
  changes.geometryChange !== null ||
  changes.fieldChanges.length > 0 ||
  changes.mergedFields.length > 0;
