import type { LiftDetailKey } from "./types";

export const DRAFT_STORAGE_PREFIX = "rusutsu-lift-edit-draft:";

export const SPEED_OPTIONS = ["高速", "低速", ""] as const;
export const TYPE_OPTIONS = ["リフト", "ゴンドラ", "ケーブルカー", ""] as const;
export const MARK_OPTIONS = ["○", "×", ""] as const;

// lift_before の properties に現れる aerialway の値
export const AERIALWAY_OPTIONS = [
  "chair_lift",
  "gondola",
  "cable_car",
  "rope_tow",
  "magic_carpet",
  "drag_lift",
  "platter",
  "t-bar",
  "j-bar",
  "mixed_lift",
  "",
] as const;

// 保存時に数値へ戻すフィールド（既存 lift_detail の型に合わせる）
export const NUMERIC_DETAIL_KEYS: LiftDetailKey[] = [
  "capacity",
  "distance",
  "vertical",
  "towers",
  "year",
  "top",
  "bottom",
];

// lift_detail 側を優先して結合する詳細フィールドの一覧
export const DETAIL_KEYS: LiftDetailKey[] = [
  "speed",
  "type",
  "hood",
  "capacity",
  "distance",
  "vertical",
  "top",
  "bottom",
  "footrest",
  "towers",
  "oilShield",
  "maker",
  "year",
  "note",
  "searchWord",
  "morning",
  "night",
];

export const DETAIL_LABELS: Record<LiftDetailKey, string> = {
  speed: "速度",
  type: "種類",
  hood: "フード",
  capacity: "定員（人）",
  distance: "距離（m）",
  vertical: "標高差（m）",
  top: "山頂駅",
  bottom: "山麓駅",
  footrest: "フットレスト",
  towers: "支柱数",
  oilShield: "オイルシールド",
  maker: "メーカー",
  year: "設置年",
  note: "備考",
  searchWord: "検索ワード",
  morning: "早朝営業",
  night: "ナイター営業",
};

export const RESORT_INITIAL_ZOOM = 14;
