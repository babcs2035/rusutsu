import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import { DEFAULT_LIFT_TICKET_SEARCH_INPUT } from "@/features/lift-ticket/utils/calculateLiftTicket";
import type { Filters, NumericFilterValue, RegionOption } from "../types";

export const hasNumericFilterValue = (
  value: NumericFilterValue | undefined,
): value is number => value != null;

// リフト券フィルタがデフォルト入力から変更されているかを判定する。
// isFilterActive（filterResorts.ts）と同一の判定を共有し，
// デフォルト値（今日・1日券・大人0人）を「フィルタ適用中」として数えないようにする。
export const isLiftTicketFilterActive = (liftTicket: LiftTicketSearchInput) =>
  liftTicket.visitDate !== DEFAULT_LIFT_TICKET_SEARCH_INPUT.visitDate ||
  liftTicket.usePreference !== "full_day" ||
  liftTicket.party.length !== 1 ||
  liftTicket.party[0]?.category !== "adult" ||
  liftTicket.party[0]?.age !== null ||
  liftTicket.party[0]?.count !== 0;

const formatMetersRangeLabel = (
  minValue: NumericFilterValue | undefined,
  maxValue: NumericFilterValue | undefined,
) => {
  if (hasNumericFilterValue(minValue) && hasNumericFilterValue(maxValue)) {
    return `${minValue}〜${maxValue}m`;
  }
  if (hasNumericFilterValue(minValue)) return `${minValue}m〜`;
  if (hasNumericFilterValue(maxValue)) return `〜${maxValue}m`;
  return null;
};

const getLabelRegionName = (region: string) =>
  region === "北海道" ? region : `${region}地方`;

const getPrefectureLabelRegionOptions = (regionOptions: RegionOption[]) =>
  regionOptions.flatMap(({ region, prefectures }) => {
    if (region === "北海道・東北") {
      const hokkaidoPrefectures = prefectures.filter(
        prefecture => prefecture === "北海道",
      );
      const tohokuPrefectures = prefectures.filter(
        prefecture => prefecture !== "北海道",
      );

      return [
        { region: "北海道", prefectures: hokkaidoPrefectures },
        { region: "東北", prefectures: tohokuPrefectures },
      ].filter(option => option.prefectures.length > 0);
    }

    if (region === "四国・九州") {
      const shikokuPrefectures = new Set([
        "徳島県",
        "香川県",
        "愛媛県",
        "高知県",
      ]);
      const shikoku = prefectures.filter(prefecture =>
        shikokuPrefectures.has(prefecture),
      );
      const kyushu = prefectures.filter(
        prefecture => !shikokuPrefectures.has(prefecture),
      );

      return [
        { region: "四国", prefectures: shikoku },
        { region: "九州", prefectures: kyushu },
      ].filter(option => option.prefectures.length > 0);
    }

    return [{ region, prefectures }];
  });

export const getPrefectureFilterLabel = (
  prefectures: string[],
  regionOptions: RegionOption[],
) => {
  const selectedPrefectures = new Set(prefectures);
  const groupedPrefectures = new Set<string>();
  const displayItems: string[] = [];
  const labelRegionOptions = getPrefectureLabelRegionOptions(regionOptions);

  labelRegionOptions.forEach(({ region, prefectures: regionPrefectures }) => {
    const isRegionSelected = regionPrefectures.every(prefecture =>
      selectedPrefectures.has(prefecture),
    );

    if (!isRegionSelected) return;

    displayItems.push(getLabelRegionName(region));
    regionPrefectures.forEach(prefecture => {
      groupedPrefectures.add(prefecture);
    });
  });

  prefectures.forEach(prefecture => {
    if (groupedPrefectures.has(prefecture)) return;

    displayItems.push(prefecture.replace(/[府県]$/, ""));
  });

  return displayItems.join(", ");
};

export const getActiveFilterLabels = (
  filters: Filters,
  regionOptions: RegionOption[],
  options: { includeKeyword?: boolean } = {},
) => {
  const { includeKeyword = true } = options;
  const liftTicket = filters.liftTicket ?? DEFAULT_LIFT_TICKET_SEARCH_INPUT;
  const labels: string[] = [];
  if (includeKeyword && filters.keyword.trim())
    labels.push(`キーワード: ${filters.keyword.trim()}`);
  if (filters.prefectures.length > 0) {
    labels.push(getPrefectureFilterLabel(filters.prefectures, regionOptions));
  }
  if (filters.yukiMagi) labels.push("雪マジ対象");
  if (filters.status) labels.push("営業中のみ");
  if (filters.beginnerFriendly) labels.push("初級者向け");
  if (isLiftTicketFilterActive(liftTicket)) {
    const partyCount = liftTicket.party.reduce(
      (total, group) => total + group.count,
      0,
    );
    labels.push(
      `リフト券 ${liftTicket.visitDate}・${partyCount}人・${
        liftTicket.usePreference === "full_day" ? "1日" : "半日"
      }`,
    );
  }
  if (hasNumericFilterValue(filters.minVertical))
    labels.push(`標高差 ${filters.minVertical}m〜`);
  if (
    hasNumericFilterValue(filters.minBaseElevation) ||
    hasNumericFilterValue(filters.maxBaseElevation)
  ) {
    labels.push(
      `山麓標高 ${formatMetersRangeLabel(
        filters.minBaseElevation,
        filters.maxBaseElevation,
      )}`,
    );
  }
  if (
    hasNumericFilterValue(filters.minTopElevation) ||
    hasNumericFilterValue(filters.maxTopElevation)
  ) {
    labels.push(
      `山頂標高 ${formatMetersRangeLabel(
        filters.minTopElevation,
        filters.maxTopElevation,
      )}`,
    );
  }
  if (hasNumericFilterValue(filters.minCourses))
    labels.push(`コース ${filters.minCourses}本以上`);
  if (hasNumericFilterValue(filters.minLifts))
    labels.push(`リフト ${filters.minLifts}本以上`);
  return labels;
};
