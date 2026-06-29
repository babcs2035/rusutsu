export type ResortPriority = "selected" | "filter-match" | "normal";

export const getResortPriority = ({
  resortId,
  filteredResortIdSet,
  isFilterActive,
  selectedResortIdSet,
}: {
  resortId: string;
  filteredResortIdSet?: Set<string>;
  isFilterActive: boolean;
  selectedResortIdSet: Set<string>;
}): ResortPriority => {
  if (selectedResortIdSet.has(resortId)) return "selected";
  if (isFilterActive && filteredResortIdSet?.has(resortId)) {
    return "filter-match";
  }
  return "normal";
};

export const getResortPriorityRank = (priority: ResortPriority): number => {
  if (priority === "selected") return 2;
  if (priority === "filter-match") return 1;
  return 0;
};

export const getMarkerZIndexOffset = (priority: ResortPriority): number => {
  if (priority === "selected") return 10000;
  if (priority === "filter-match") return 5000;
  return 0;
};
