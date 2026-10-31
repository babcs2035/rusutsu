import type { LngLat } from "@/features/slope/types";

/**
 * 複数のスキー場を1つにまとめた地図を、スキー場ごとに振り分けるための一時画面の型。
 * 振り分けが終わったら、この機能ごと削除する。
 */

export const SPLIT_LAYER_KINDS = [
  "slope_before",
  "slope_before_osm",
  "lift_before",
] as const;

export type SplitLayerKind = (typeof SPLIT_LAYER_KINDS)[number];

export const SPLIT_LAYER_LABELS: Record<SplitLayerKind, string> = {
  slope_before: "コース",
  slope_before_osm: "コース(OSM)",
  lift_before: "リフト",
};

export type SplitMember = {
  id: string;
  name: string;
};

/** 自動で振り分けた根拠。保存済みの値は "saved" */
export type SplitReason = "saved" | "overlap" | "nearest";

export type SplitLine = {
  /** 元の GeoJSON 内の位置。保存時の対応付けに使う */
  index: number;
  name: string;
  coordinates: LngLat[];
  memberId: string;
  reason: SplitReason;
};

export type SplitLayer = {
  kind: SplitLayerKind;
  sourceKey: string;
  sourceHash: string;
  lines: SplitLine[];
};

export type SplitArea = {
  id: string;
  name: string;
  /** DB の連結エリアなら MERGED / LINKED。スキー場として登録されていない合体地図は null */
  linkKind: "MERGED" | "LINKED" | null;
  members: SplitMember[];
  layers: SplitLayer[];
  savedAt: string | null;
  /** 保存後に元の地図が更新され、保存した振り分けの一部を使えなかった */
  staleLayerKinds: SplitLayerKind[];
};

export type SplitAssignmentDocument = {
  version: 1;
  areaId: string;
  members: SplitMember[];
  savedAt: string;
  layers: {
    kind: SplitLayerKind;
    sourceKey: string;
    sourceHash: string;
    assignments: { index: number; name: string; memberId: string }[];
  }[];
};

export type SplitSaveResult =
  | { ok: true; savedAt: string }
  | { ok: false; message: string };
