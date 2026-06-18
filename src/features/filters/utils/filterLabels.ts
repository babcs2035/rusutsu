import type { Filters, NumericFilterValue, RegionOption } from "../types";

export const hasNumericFilterValue = (
  value: NumericFilterValue | undefined,
): value is number => value != null;

export const getPrefectureFilterLabel = (
  prefectures: string[],
  regionOptions: RegionOption[],
) => {
  const selectedPrefectures = new Set(prefectures);
  const groupedPrefectures = new Set<string>();
  const displayItems: string[] = [];

  regionOptions.forEach(({ region, prefectures: regionPrefectures }) => {
    const isRegionSelected = regionPrefectures.every(prefecture =>
      selectedPrefectures.has(prefecture),
    );

    if (!isRegionSelected) return;

    displayItems.push(`${region}地方`);
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
) => {
  const labels: string[] = [];
  if (filters.keyword.trim())
    labels.push(`キーワード: ${filters.keyword.trim()}`);
  if (filters.prefectures.length > 0) {
    labels.push(getPrefectureFilterLabel(filters.prefectures, regionOptions));
  }
  if (filters.yukiMagi) labels.push("雪マジ対象");
  if (filters.beginnerFriendly) labels.push("初級者向け");
  if (hasNumericFilterValue(filters.minVertical))
    labels.push(`標高差 ${filters.minVertical}m以上`);
  if (hasNumericFilterValue(filters.minBaseElevation))
    labels.push(`山麓標高 ${filters.minBaseElevation}m以上`);
  if (hasNumericFilterValue(filters.maxBaseElevation))
    labels.push(`山麓標高 ${filters.maxBaseElevation}m以下`);
  if (hasNumericFilterValue(filters.minTopElevation))
    labels.push(`山頂標高 ${filters.minTopElevation}m以上`);
  if (hasNumericFilterValue(filters.maxTopElevation))
    labels.push(`山頂標高 ${filters.maxTopElevation}m以下`);
  if (hasNumericFilterValue(filters.minCourses))
    labels.push(`コース ${filters.minCourses}本以上`);
  if (hasNumericFilterValue(filters.minLifts))
    labels.push(`リフト ${filters.minLifts}本以上`);
  return labels;
};
