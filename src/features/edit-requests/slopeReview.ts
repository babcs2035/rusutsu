import { COURSE_DETAIL_LABELS } from "@/features/slope/constants";
import type { EditPlan } from "@/server/edit-requests/contract";
import {
  courseGroupingLabel,
  readCourseGrouping,
} from "@/shared/course-lift/identity";
import { buildFeatureReview, type FeatureReview } from "./featureReview";

export type SlopeReview = FeatureReview;

const FIELD_ORDER = [
  "name",
  "level",
  "distance",
  "avg",
  "max",
  "piste",
  "morning",
  "night",
  "courseGrouping",
  "note",
  "searchWord",
  "youtubeUrl",
  "image",
];
const INTERNAL_KEYS = new Set([
  "entityId",
  "@id",
  "resort",
  "nameUnknown",
  "groupingReviewed",
  "assignment_method",
]);
const FIELD_LABELS: Record<string, string> = {
  name: "名称",
  courseGrouping: "コースのまとめ方",
  ...COURSE_DETAIL_LABELS,
};
const PISTE_LABELS: Record<string, string> = {
  "○": "圧雪",
  "△": "一部圧雪",
  "×": "非圧雪",
};

function readable(value: unknown, key: string): string {
  if (value === undefined || value === null || value === "") return "未設定";
  if (key === "piste" && typeof value === "string")
    return PISTE_LABELS[value] ?? value;
  if (value === "○") return "あり";
  if (value === "×") return "なし";
  if (key === "courseGrouping") {
    const grouping = readCourseGrouping(value);
    if (!grouping) return "未設定";
    return `${grouping.name}（${grouping.kind === "routes" ? "別ルート" : "連続"}・${courseGroupingLabel(grouping)}）`;
  }
  if (typeof value === "object") return "設定あり";
  return String(value);
}

export const isSlopeFeatureDocument = (key: string) =>
  key.includes("/slope_before/") || key.includes("/slope_before_osm/");

export function buildSlopeReview(plan: EditPlan): SlopeReview {
  return buildFeatureReview(plan, {
    isFeatureDocument: isSlopeFeatureDocument,
    mappingSection: "courses",
    fieldOrder: FIELD_ORDER,
    internalKeys: INTERNAL_KEYS,
    labels: FIELD_LABELS,
    hideUnchangedUnknown: true,
    readable,
    unnamed: "名称未設定のコース",
  });
}
