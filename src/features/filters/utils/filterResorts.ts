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

type KeywordTokenizer = (keyword: string) => string[];

/** Cache normalized keyword tokens once for each filter object and keyword. */
export function createKeywordTokenCache(
  tokenize: KeywordTokenizer = toSearchTokens,
): (filters: Filters) => string[] {
  const cache = new WeakMap<Filters, { keyword: string; tokens: string[] }>();
  return filters => {
    const previous = cache.get(filters);
    if (previous?.keyword === filters.keyword) return previous.tokens;

    const tokens = tokenize(filters.keyword);
    cache.set(filters, { keyword: filters.keyword, tokens });
    return tokens;
  };
}

const getKeywordTokens = createKeywordTokenCache();
const resortKeywordHaystacks = new WeakMap<MapSkiResort, string>();

const matchesKeyword = (resort: MapSkiResort, tokens: string[]) => {
  if (tokens.length === 0) return true;
  // 一覧の DTO は読込時のスナップショットなので，同じ施設を検索する間は再利用できる．
  let haystack = resortKeywordHaystacks.get(resort);
  if (haystack === undefined) {
    haystack = buildKeywordHaystack(resort);
    resortKeywordHaystacks.set(resort, haystack);
  }
  return tokens.every(token => haystack.includes(token));
};

export const isFilterActive = (filters: Filters) => {
  const liftTicket = filters.liftTicket ?? DEFAULT_LIFT_TICKET_SEARCH_INPUT;
  return (
    filters.keyword.trim() !== "" ||
    filters.prefectures.length > 0 ||
    filters.yukiMagi ||
    filters.passPrograms.length > 0 ||
    filters.evCharger ||
    hasNumericFilterValue(filters.minVertical) ||
    hasNumericFilterValue(filters.minBaseElevation) ||
    hasNumericFilterValue(filters.maxBaseElevation) ||
    hasNumericFilterValue(filters.minTopElevation) ||
    hasNumericFilterValue(filters.maxTopElevation) ||
    hasNumericFilterValue(filters.minCourses) ||
    hasNumericFilterValue(filters.minLifts) ||
    hasNumericFilterValue(filters.minCourseDistance) ||
    hasNumericFilterValue(filters.maxPrice) ||
    isLiftTicketFilterActive(liftTicket)
  );
};

export const areFiltersEqual = (left: Filters, right: Filters) => {
  const leftLiftTicket = left.liftTicket ?? DEFAULT_LIFT_TICKET_SEARCH_INPUT;
  const rightLiftTicket = right.liftTicket ?? DEFAULT_LIFT_TICKET_SEARCH_INPUT;
  return (
    left.keyword === right.keyword &&
    left.yukiMagi === right.yukiMagi &&
    left.passPrograms.length === right.passPrograms.length &&
    left.passPrograms.every(id => right.passPrograms.includes(id)) &&
    left.evCharger === right.evCharger &&
    left.minVertical === right.minVertical &&
    left.minBaseElevation === right.minBaseElevation &&
    left.maxBaseElevation === right.maxBaseElevation &&
    left.minTopElevation === right.minTopElevation &&
    left.maxTopElevation === right.maxTopElevation &&
    left.minCourses === right.minCourses &&
    left.minLifts === right.minLifts &&
    left.minCourseDistance === right.minCourseDistance &&
    left.scaleBasis === right.scaleBasis &&
    left.maxPrice === right.maxPrice &&
    leftLiftTicket.visitDate === rightLiftTicket.visitDate &&
    leftLiftTicket.usePreference === rightLiftTicket.usePreference &&
    leftLiftTicket.party.length === rightLiftTicket.party.length &&
    leftLiftTicket.party.every((group, index) => {
      const otherGroup = rightLiftTicket.party[index];
      return (
        otherGroup !== undefined &&
        group.id === otherGroup.id &&
        group.category === otherGroup.category &&
        group.baseCategory === otherGroup.baseCategory &&
        group.age === otherGroup.age &&
        group.count === otherGroup.count &&
        group.rental?.sport === otherGroup.rental?.sport &&
        (group.rental?.items ?? []).length ===
          (otherGroup.rental?.items ?? []).length &&
        (group.rental?.items ?? []).every(
          (item, itemIndex) => item === otherGroup.rental?.items[itemIndex],
        )
      );
    }) &&
    (leftLiftTicket.days ?? []).length ===
      (rightLiftTicket.days ?? []).length &&
    (leftLiftTicket.days ?? []).every((day, index) => {
      const otherDay = rightLiftTicket.days?.[index];
      return (
        otherDay !== undefined &&
        day.id === otherDay.id &&
        day.date === otherDay.date &&
        day.duration.kind === otherDay.duration.kind &&
        (day.duration.kind !== "day" ||
          otherDay.duration.kind !== "day" ||
          day.duration.withNight === otherDay.duration.withNight) &&
        (day.duration.kind !== "hours" ||
          otherDay.duration.kind !== "hours" ||
          day.duration.hours === otherDay.duration.hours)
      );
    }) &&
    left.prefectures.length === right.prefectures.length &&
    left.prefectures.every(
      (prefecture, index) => prefecture === right.prefectures[index],
    )
  );
};

export const matchesFilters = (resort: MapSkiResort, filters: Filters) => {
  if (filters.yukiMagi && !resort.yukiMagiId) return false;
  if (
    filters.passPrograms.some(id => !(resort.passProgramIds ?? []).includes(id))
  )
    return false;
  if (filters.evCharger && !resort.evChargerSummary) return false;
  if (
    filters.prefectures.length > 0 &&
    !filters.prefectures.includes(resort.prefecture)
  ) {
    return false;
  }
  if (
    filters.keyword.trim() !== "" &&
    !matchesKeyword(resort, getKeywordTokens(filters))
  ) {
    return false;
  }
  const isOpenBasis = filters.scaleBasis === "open";
  if (hasNumericFilterValue(filters.minVertical)) {
    // 営業中は、滑走できる（○・△）コースだけの最高点と最低点の差
    const open = resort.operatingCounts.openElevation;
    const vertical = isOpenBasis
      ? open
        ? open.top - open.base
        : null
      : resort.verticalDrop;
    if (vertical === null || vertical < filters.minVertical) return false;
  }
  // 営業中は、滑走できる（○・△）コースだけの山麓・山頂
  const elevation = isOpenBasis
    ? (resort.operatingCounts.openElevation ?? null)
    : { top: resort.topElevation, base: resort.baseElevation };
  const usesElevation =
    hasNumericFilterValue(filters.minBaseElevation) ||
    hasNumericFilterValue(filters.maxBaseElevation) ||
    hasNumericFilterValue(filters.minTopElevation) ||
    hasNumericFilterValue(filters.maxTopElevation);
  if (usesElevation && elevation === null) return false;
  if (elevation) {
    if (
      hasNumericFilterValue(filters.minBaseElevation) &&
      filters.minBaseElevation > elevation.base
    )
      return false;
    if (
      hasNumericFilterValue(filters.maxBaseElevation) &&
      filters.maxBaseElevation < elevation.base
    )
      return false;
    if (
      hasNumericFilterValue(filters.minTopElevation) &&
      filters.minTopElevation > elevation.top
    )
      return false;
    if (
      hasNumericFilterValue(filters.maxTopElevation) &&
      filters.maxTopElevation < elevation.top
    )
      return false;
  }
  if (hasNumericFilterValue(filters.minCourses)) {
    const courses = isOpenBasis
      ? (resort.operatingCounts.courses?.active ?? null)
      : resort.numberOfCourses;
    if (courses === null || courses < filters.minCourses) return false;
  }
  if (hasNumericFilterValue(filters.minLifts)) {
    const lifts = isOpenBasis
      ? (resort.operatingCounts.lifts?.active ?? null)
      : resort.numberOfLifts;
    if (lifts === null || lifts < filters.minLifts) return false;
  }
  if (hasNumericFilterValue(filters.minCourseDistance)) {
    // 滑走距離は地図のコースから集計した値（m）。地図の無いスキー場は対象外
    const distance = resort.operatingCounts.courseDistance;
    const meters = isOpenBasis
      ? (distance?.open ?? null)
      : (distance?.total ?? null);
    if (meters === null || meters < filters.minCourseDistance * 1000)
      return false;
  }
  return true;
};
