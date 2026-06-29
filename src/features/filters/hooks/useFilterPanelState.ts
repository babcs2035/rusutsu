"use client";

import { useId, useMemo, useState } from "react";
import type { MapSkiResort } from "@/types/skiResorts";
import { DEFAULT_FILTERS, REGION_PREFECTURES } from "../constants";
import type { Filters, NumericFilterName } from "../types";
import { getActiveFilterLabels } from "../utils/filterLabels";

type Params = {
  filters: Filters;
  resorts: MapSkiResort[];
  onFilterChange: (newFilters: Filters) => void;
};

export const useFilterPanelState = ({
  filters,
  resorts,
  onFilterChange,
}: Params) => {
  const [isElevationDetailOpen, setIsElevationDetailOpen] = useState(false);
  const keywordId = useId();
  const statusId = useId();
  const yukiMagiId = useId();
  const beginnerFriendlyId = useId();
  const minVerticalId = useId();
  const minBaseElevationId = useId();
  const maxBaseElevationId = useId();
  const minTopElevationId = useId();
  const maxTopElevationId = useId();
  const minCoursesId = useId();
  const minLiftsId = useId();

  const availablePrefectureSet = useMemo(
    () => new Set(resorts.map(resort => resort.prefecture).filter(Boolean)),
    [resorts],
  );

  const regionOptions = useMemo(
    () =>
      Object.entries(REGION_PREFECTURES)
        .map(([region, prefectures]) => ({
          region,
          prefectures: prefectures.filter(prefecture =>
            availablePrefectureSet.has(prefecture),
          ),
        }))
        .filter(option => option.prefectures.length > 0),
    [availablePrefectureSet],
  );

  const activeFilterLabels = getActiveFilterLabels(filters, regionOptions);
  const collapsedDetailLabels = activeFilterLabels.filter(
    label => !label.startsWith("キーワード:"),
  );

  const handleTextInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    onFilterChange({ ...filters, [name]: value });
  };

  const handleNumericInputChange = (name: NumericFilterName, value: string) => {
    const digitsOnly = value.replace(/\D/g, "");
    onFilterChange({
      ...filters,
      [name]: digitsOnly === "" ? null : parseInt(digitsOnly, 10),
    });
  };

  const handlePrefectureChange = (prefecture: string, checked: boolean) => {
    const nextPrefectures = checked
      ? [...filters.prefectures, prefecture]
      : filters.prefectures.filter(selected => selected !== prefecture);
    onFilterChange({ ...filters, prefectures: nextPrefectures });
  };

  const handleRegionPrefecturesChange = (
    prefectures: string[],
    checked: boolean,
  ) => {
    const nextPrefectures = checked
      ? Array.from(new Set([...filters.prefectures, ...prefectures]))
      : filters.prefectures.filter(selected => !prefectures.includes(selected));
    onFilterChange({ ...filters, prefectures: nextPrefectures });
  };

  const handleCheckboxChange = (
    name: "status" | "yukiMagi" | "beginnerFriendly",
    checked: boolean,
  ) => {
    onFilterChange({ ...filters, [name]: checked });
  };

  const handleReset = () => {
    onFilterChange(DEFAULT_FILTERS);
  };

  const handleResetClick = () => {
    if (!window.confirm("検索フィルタをリセットしますか？")) return;
    handleReset();
  };

  return {
    collapsedDetailLabels,
    handleCheckboxChange,
    handleNumericInputChange,
    handlePrefectureChange,
    handleRegionPrefecturesChange,
    handleResetClick,
    handleTextInputChange,
    ids: {
      beginnerFriendlyId,
      keywordId,
      maxBaseElevationId,
      maxTopElevationId,
      minBaseElevationId,
      minCoursesId,
      minLiftsId,
      minTopElevationId,
      minVerticalId,
      statusId,
      yukiMagiId,
    },
    isElevationDetailOpen,
    regionOptions,
    setIsElevationDetailOpen,
  };
};
