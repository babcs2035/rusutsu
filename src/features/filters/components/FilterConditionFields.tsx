"use client";

import { SegmentedControl } from "@/shared/components/SegmentedControl";
import { PASS_PROGRAMS, YUKIMAJI_URL } from "@/shared/passPrograms";
import type { MapSkiResort } from "@/types/skiResorts";
import { useFilterPanelState } from "../hooks/useFilterPanelState";
import type { Filters, ScaleBasis } from "../types";
import {
  CompactMetricFilter,
  ElevationFilterRow,
  FilterToggle,
  PrefectureFilter,
  ToggleSection,
} from "./FilterControls";

// 縦線で字下げしたぶん、4桁（標高 3000）が収まる最小幅まで詰める
const MOBILE_NUMBER_INPUT_WIDTH = "3rem";

const SCALE_BASIS_OPTIONS = [
  { value: "total", label: "全体" },
  { value: "open", label: "営業中のみ" },
] as const satisfies readonly { value: ScaleBasis; label: string }[];

/**
 * 通常の検索と同じ絞り込み条件（雪マジ・シーズン券・標高差・都道府県など）。
 * 料金計算は含めないので、比較リストへの追加など料金の要らない画面でも使う。
 */
export const FilterConditionFields = ({
  filters,
  resorts,
  onFilterChange,
  onKeyboardInputBlur,
  onKeyboardInputFocus,
}: {
  filters: Filters;
  resorts: MapSkiResort[];
  onFilterChange: (newFilters: Filters) => void;
  onKeyboardInputBlur?: () => void;
  onKeyboardInputFocus?: () => void;
}) => {
  const {
    handleCheckboxChange,
    handleNumericInputChange,
    handlePassProgramChange,
    handlePrefectureChange,
    handleRegionPrefecturesChange,
    ids,
    isElevationDetailOpen,
    regionOptions,
    setIsElevationDetailOpen,
  } = useFilterPanelState({ filters, resorts, onFilterChange });
  const {
    evChargerId,
    maxBaseElevationId,
    maxTopElevationId,
    minBaseElevationId,
    minCourseDistanceId,
    minCoursesId,
    minLiftsId,
    minTopElevationId,
    minVerticalId,
    passProgramIdPrefix,
    yukiMagiId,
  } = ids;
  const scaleBasis = filters.scaleBasis ?? "total";
  return (
    <>
      {/* Quick filters: 雪マジ → シーズン券・キッズパス → EV充電 */}
      {/* 枠が20rem未満（幅320pxのスマホ）では6文字の名前が切れるので2列にする */}
      <div className="@container">
        <div className="grid grid-cols-2 gap-1.5 @[20rem]:grid-cols-3 md:gap-2">
          <FilterToggle
            id={yukiMagiId}
            label="雪マジ"
            checked={filters.yukiMagi}
            onChange={checked => handleCheckboxChange("yukiMagi", checked)}
            link={{ href: YUKIMAJI_URL, name: "雪マジ" }}
          />
          {PASS_PROGRAMS.map(program => (
            <FilterToggle
              key={program.id}
              id={`${passProgramIdPrefix}-${program.id}`}
              label={program.label}
              checked={filters.passPrograms.includes(program.id)}
              onChange={checked => handlePassProgramChange(program.id, checked)}
              link={{ href: program.url, name: program.name }}
            />
          ))}
          <FilterToggle
            id={evChargerId}
            label="EV充電"
            checked={filters.evCharger}
            onChange={checked => handleCheckboxChange("evCharger", checked)}
          />
        </div>
      </div>

      {/* Metric filters */}
      {/* 切替が効く範囲を、都道府県と同じ左の縦線で囲って示す */}
      <div>
        <div className="flex h-7 items-center gap-2">
          <span className="text-gray-900 font-bold text-sm">規模で絞る</span>
          <SegmentedControl
            options={SCALE_BASIS_OPTIONS}
            value={scaleBasis}
            onChange={next => onFilterChange({ ...filters, scaleBasis: next })}
            ariaLabel={option =>
              option.value === "open"
                ? "営業中のコース・リフトだけで規模を絞り込む"
                : "全体の規模で絞り込む"
            }
            itemClassName="h-7 px-2.5 text-xs"
          />
        </div>
        <div className="ml-2 mt-1 flex flex-col gap-2 border-l-2 border-gray-200 pl-2">
          <div className="grid grid-cols-2 items-center gap-x-1.5 gap-y-2 md:gap-x-2">
            <CompactMetricFilter
              label="標高差"
              id={minVerticalId}
              name="minVertical"
              value={filters.minVertical}
              inputWidth={MOBILE_NUMBER_INPUT_WIDTH}
              unit="m"
              onBlur={onKeyboardInputBlur}
              onChange={handleNumericInputChange}
              onFocus={onKeyboardInputFocus}
            />
            <CompactMetricFilter
              label="滑走距離"
              id={minCourseDistanceId}
              name="minCourseDistance"
              value={filters.minCourseDistance}
              inputWidth={MOBILE_NUMBER_INPUT_WIDTH}
              unit="km"
              onBlur={onKeyboardInputBlur}
              onChange={handleNumericInputChange}
              onFocus={onKeyboardInputFocus}
            />
            <CompactMetricFilter
              label="コース数"
              id={minCoursesId}
              name="minCourses"
              value={filters.minCourses}
              inputWidth={MOBILE_NUMBER_INPUT_WIDTH}
              unit="本"
              onBlur={onKeyboardInputBlur}
              onChange={handleNumericInputChange}
              onFocus={onKeyboardInputFocus}
            />
            <CompactMetricFilter
              label="リフト数"
              id={minLiftsId}
              name="minLifts"
              value={filters.minLifts}
              inputWidth={MOBILE_NUMBER_INPUT_WIDTH}
              unit="本"
              onBlur={onKeyboardInputBlur}
              onChange={handleNumericInputChange}
              onFocus={onKeyboardInputFocus}
            />
          </div>
          <ToggleSection
            isOpen={isElevationDetailOpen}
            label="詳細フィルタ"
            onToggle={() => setIsElevationDetailOpen(prev => !prev)}
          >
            <div className="flex flex-col gap-1.5">
              <ElevationFilterRow
                label="山麓標高"
                minId={minBaseElevationId}
                minName="minBaseElevation"
                minValue={filters.minBaseElevation}
                maxId={maxBaseElevationId}
                maxName="maxBaseElevation"
                maxValue={filters.maxBaseElevation}
                unit="m"
                onBlur={onKeyboardInputBlur}
                onChange={handleNumericInputChange}
                onFocus={onKeyboardInputFocus}
              />
              <ElevationFilterRow
                label="山頂標高"
                minId={minTopElevationId}
                minName="minTopElevation"
                minValue={filters.minTopElevation}
                maxId={maxTopElevationId}
                maxName="maxTopElevation"
                maxValue={filters.maxTopElevation}
                unit="m"
                onBlur={onKeyboardInputBlur}
                onChange={handleNumericInputChange}
                onFocus={onKeyboardInputFocus}
              />
            </div>
          </ToggleSection>
        </div>
      </div>

      {/* Prefecture filter */}
      <PrefectureFilter
        regionOptions={regionOptions}
        selectedPrefectures={filters.prefectures}
        onPrefectureChange={handlePrefectureChange}
        onRegionPrefecturesChange={handleRegionPrefecturesChange}
      />
    </>
  );
};
