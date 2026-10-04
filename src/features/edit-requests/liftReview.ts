import { DETAIL_LABELS } from "@/features/lift/constants";
import type { EditPlan } from "@/server/edit-requests/contract";
import {
  buildFeatureReview,
  type FeatureReview,
  type FeatureReviewField,
  type FeatureReviewItem,
} from "./featureReview";

export type LiftReviewField = FeatureReviewField;
export type LiftReviewItem = FeatureReviewItem;
export type LiftReview = FeatureReview;

const FIELD_ORDER = [
  "name",
  "aerialway",
  "type",
  "speed",
  "capacity",
  "distance",
  "vertical",
  "top",
  "bottom",
  "midstation",
  "hood",
  "footrest",
  "towers",
  "oilShield",
  "maker",
  "year",
  "morning",
  "night",
  "note",
  "searchWord",
  "link",
];
const INTERNAL_KEYS = new Set(["entityId", "@id", "resort"]);
const FIELD_LABELS: Record<string, string> = {
  name: "名称",
  aerialway: "設備の種類",
  midstation: "中間駅",
  ...DETAIL_LABELS,
};
const AERIALWAY_LABELS: Record<string, string> = {
  chair_lift: "リフト",
  gondola: "ゴンドラ",
  cable_car: "ケーブルカー",
  drag_lift: "シュレップリフト",
  magic_carpet: "動く歩道",
  mixed_lift: "コンビリフト",
};

function readable(value: unknown, key: string): string {
  if (value === undefined || value === null || value === "") return "未設定";
  if (value === "○") return "あり";
  if (value === "×") return "なし";
  if (key === "aerialway" && typeof value === "string")
    return AERIALWAY_LABELS[value] ?? value;
  if (key === "midstation") return "あり";
  if (typeof value === "object") return "設定あり";
  return String(value);
}

export function buildLiftReview(plan: EditPlan): LiftReview {
  return buildFeatureReview(plan, {
    isFeatureDocument: key => key.includes("/lift_before/"),
    mappingSection: "lifts",
    fieldOrder: FIELD_ORDER,
    internalKeys: INTERNAL_KEYS,
    labels: FIELD_LABELS,
    readable,
    unnamed: "名称未設定のリフト",
  });
}
