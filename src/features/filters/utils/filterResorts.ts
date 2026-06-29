import type { MapSkiResort } from "@/types/skiResorts";
import type { Filters } from "../types";
import { hasNumericFilterValue } from "./filterLabels";

export const isFilterActive = (filters: Filters) =>
  filters.keyword.trim() !== "" ||
  filters.prefectures.length > 0 ||
  filters.status ||
  filters.yukiMagi ||
  filters.beginnerFriendly ||
  hasNumericFilterValue(filters.minVertical) ||
  hasNumericFilterValue(filters.minBaseElevation) ||
  hasNumericFilterValue(filters.maxBaseElevation) ||
  hasNumericFilterValue(filters.minTopElevation) ||
  hasNumericFilterValue(filters.maxTopElevation) ||
  hasNumericFilterValue(filters.minCourses) ||
  hasNumericFilterValue(filters.minLifts);

export const matchesFilters = (resort: MapSkiResort, filters: Filters) => {
  if (filters.status && !resort.status?.includes("滑走可")) return false;
  if (filters.yukiMagi && !resort.yukiMagiId) return false;
  if (filters.beginnerFriendly && resort.beginnersCoursesPercent < 30) {
    return false;
  }
  if (
    filters.prefectures.length > 0 &&
    !filters.prefectures.includes(resort.prefecture)
  ) {
    return false;
  }
  if (
    filters.keyword.trim() !== "" &&
    !`${resort.nameJa} ${resort.nameEn ?? ""} ${resort.prefecture} ${
      resort.town
    }`
      .toLowerCase()
      .includes(filters.keyword.trim().toLowerCase())
  ) {
    return false;
  }
  if (
    hasNumericFilterValue(filters.minVertical) &&
    filters.minVertical > resort.verticalDrop
  ) {
    return false;
  }
  if (
    hasNumericFilterValue(filters.minBaseElevation) &&
    filters.minBaseElevation > resort.baseElevation
  ) {
    return false;
  }
  if (
    hasNumericFilterValue(filters.maxBaseElevation) &&
    filters.maxBaseElevation < resort.baseElevation
  ) {
    return false;
  }
  if (
    hasNumericFilterValue(filters.minTopElevation) &&
    filters.minTopElevation > resort.topElevation
  ) {
    return false;
  }
  if (
    hasNumericFilterValue(filters.maxTopElevation) &&
    filters.maxTopElevation < resort.topElevation
  ) {
    return false;
  }
  if (
    hasNumericFilterValue(filters.minCourses) &&
    filters.minCourses > resort.numberOfCourses
  ) {
    return false;
  }
  if (
    hasNumericFilterValue(filters.minLifts) &&
    filters.minLifts > resort.numberOfLifts
  ) {
    return false;
  }
  return true;
};
