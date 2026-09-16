import type { CrawlMonitorCategorySummary } from "@/server/crawl-latest/adminContract";
import {
  CATEGORY_KINDS,
  CATEGORY_LABELS,
  categoryTone,
  STATE_LABELS,
} from "../utils/labels";
import { StatusPill } from "./StatusPill";

const countLabel = (category: CrawlMonitorCategorySummary): string => {
  if (category.kind === "COMMENT" || category.kind === "WEATHER") {
    return category.state === "SUCCESS" ? "" : STATE_LABELS[category.state];
  }
  if (category.state !== "SUCCESS") return STATE_LABELS[category.state];
  return category.usableItemCount === category.itemCount
    ? `${category.itemCount}件`
    : `${category.usableItemCount}/${category.itemCount}件`;
};

/** 4カテゴリを常に同じ並びで出す。無い場合も枠を残して「取れていない」が分かるようにする。 */
export function CategoryBadges({
  categories,
}: {
  categories: readonly CrawlMonitorCategorySummary[];
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {CATEGORY_KINDS.map(kind => {
        const category = categories.find(entry => entry.kind === kind);
        if (!category) {
          return (
            <StatusPill key={kind} tone="muted">
              {CATEGORY_LABELS[kind]} なし
            </StatusPill>
          );
        }
        const suffix = countLabel(category);
        return (
          <StatusPill
            key={kind}
            tone={categoryTone(category)}
            title={`${STATE_LABELS[category.state]} / 検証: ${category.validationState}`}
          >
            {CATEGORY_LABELS[kind]}
            {suffix ? ` ${suffix}` : ""}
          </StatusPill>
        );
      })}
    </div>
  );
}
