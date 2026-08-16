import { DEFAULT_LIFT_TICKET_SEARCH_INPUT } from "@/features/lift-ticket/utils/calculateLiftTicket";
import {
  normalizeSearchText,
  toSearchTokens,
} from "@/shared/utils/japaneseSearchText";
import type { MapSkiResort } from "@/types/skiResorts";
import type { Filters } from "../types";
import {
  hasNumericFilterValue,
  isLiftTicketFilterActive,
} from "./filterLabels";

/**
 * キーワード検索の対象となる文字列を組み立てる。
 * 正式名称・英名・所在地に加え、ふりがな（読み）と旧名称・旧名称の読みを含める。
 */
const buildKeywordHaystack = (resort: MapSkiResort) =>
  normalizeSearchText(
    [
      resort.nameJa,
      resort.nameEn ?? "",
      resort.prefecture,
      resort.town,
      resort.reading ?? "",
      ...resort.formerNames.flatMap(formerName => [
        formerName.name,
        formerName.reading ?? "",
      ]),
    ].join(" "),
  );

const matchesKeyword = (resort: MapSkiResort, keyword: string) => {
  const tokens = toSearchTokens(keyword);
  if (tokens.length === 0) return true;
  const haystack = buildKeywordHaystack(resort);
  return tokens.every(token => haystack.includes(token));
};

export const isFilterActive = (filters: Filters) => {
  const liftTicket = filters.liftTicket ?? DEFAULT_LIFT_TICKET_SEARCH_INPUT;
  return (
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
    hasNumericFilterValue(filters.minLifts) ||
    isLiftTicketFilterActive(liftTicket)
  );
};

export const areFiltersEqual = (left: Filters, right: Filters) => {
  const leftLiftTicket = left.liftTicket ?? DEFAULT_LIFT_TICKET_SEARCH_INPUT;
  const rightLiftTicket = right.liftTicket ?? DEFAULT_LIFT_TICKET_SEARCH_INPUT;
  return (
    left.keyword === right.keyword &&
    left.status === right.status &&
    left.yukiMagi === right.yukiMagi &&
    left.beginnerFriendly === right.beginnerFriendly &&
    left.minVertical === right.minVertical &&
    left.minBaseElevation === right.minBaseElevation &&
    left.maxBaseElevation === right.maxBaseElevation &&
    left.minTopElevation === right.minTopElevation &&
    left.maxTopElevation === right.maxTopElevation &&
    left.minCourses === right.minCourses &&
    left.minLifts === right.minLifts &&
    leftLiftTicket.visitDate === rightLiftTicket.visitDate &&
    leftLiftTicket.usePreference === rightLiftTicket.usePreference &&
    leftLiftTicket.party.length === rightLiftTicket.party.length &&
    leftLiftTicket.party.every((group, index) => {
      const otherGroup = rightLiftTicket.party[index];
      return (
        otherGroup !== undefined &&
        group.id === otherGroup.id &&
        group.category === otherGroup.category &&
        group.age === otherGroup.age &&
        group.count === otherGroup.count
      );
    }) &&
    left.prefectures.length === right.prefectures.length &&
    left.prefectures.every(
      (prefecture, index) => prefecture === right.prefectures[index],
    )
  );
};

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
    !matchesKeyword(resort, filters.keyword)
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
