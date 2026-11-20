"use client";

import { SegmentedControl } from "@/shared/components/SegmentedControl";
import { PASS_PROGRAMS, YUKIMAJI_URL } from "@/shared/passPrograms";
import type { MapSkiResort } from "@/types/skiResorts";
import { useFilterPanelState } from "../hooks/useFilterPanelState";
import type { Filters, NumericFilterName, ScaleBasis } from "../types";
import {
  CompactMetricFilter,
  ElevationFilterRow,
  FilterToggle,
  PrefectureFilter,
} from "./FilterControls";

// 縦線で字下げしたぶん、4桁（標高 3000）が収まる最小幅まで詰める
const MOBILE_NUMBER_INPUT_WIDTH = "3rem";

const SCALE_BASIS_OPTIONS = [
  { value: "total", label: "全体" },
  { value: "open", label: "営業中のみ" },
] as const satisfies readonly { value: ScaleBasis; label: string }[];

/** 規模の入力欄。数字を入れると、その値以上のスキー場に絞る */
const SCALE_FIELDS = [
  { name: "minCourseDistance", label: "滑走距離", unit: "km" },
  { name: "minVertical", label: "標高差", unit: "m" },
  { name: "minCourses", label: "コース数", unit: "本" },
  { name: "minLifts", label: "リフト数", unit: "本" },
] as const satisfies readonly {
  name: NumericFilterName;
  label: string;
  unit: string;
}[];

type FieldsProps = {
  filters: Filters;
  resorts: MapSkiResort[];
  onFilterChange: (newFilters: Filters) => void;
  onKeyboardInputBlur?: () => void;
  onKeyboardInputFocus?: () => void;
};

/** 都道府県の選択。エリアのモーダルと、比較リストへの追加で使う */
export const FilterAreaFields = ({
  filters,
  resorts,
  onFilterChange,
  showHeading = true,
}: Pick<FieldsProps, "filters" | "resorts" | "onFilterChange"> & {
  showHeading?: boolean;
}) => {
  const {
    handlePrefectureChange,
    handleRegionPrefecturesChange,
    regionOptions,
  } = useFilterPanelState({ filters, resorts, onFilterChange });
  return (
    <PrefectureFilter
      regionOptions={regionOptions}
      selectedPrefectures={filters.prefectures}
      onPrefectureChange={handlePrefectureChange}
      onRegionPrefecturesChange={handleRegionPrefecturesChange}
      showHeading={showHeading}
    />
  );
};

/** 雪マジ・シーズン券・EV充電と、規模（滑走距離・標高差・コース数・リフト数・標高） */
export const FilterDetailFields = ({
  filters,
  resorts,
  onFilterChange,
  onKeyboardInputBlur,
  onKeyboardInputFocus,
}: FieldsProps) => {
  const {
    handleCheckboxChange,
    handleNumericInputChange,
    handlePassProgramChange,
    ids,
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
  const numberIds: Record<(typeof SCALE_FIELDS)[number]["name"], string> = {
    minCourseDistance: minCourseDistanceId,
    minVertical: minVerticalId,
    minCourses: minCoursesId,
    minLifts: minLiftsId,
  };

  return (
    <>
      {/* 雪マジ → シーズン券・キッズパス → EV充電 */}
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
        <div className="mt-1.5 flex flex-col gap-1.5">
          <div className="grid grid-cols-2 items-center gap-x-1.5 gap-y-1.5 md:gap-x-2">
            {SCALE_FIELDS.map(field => (
              <CompactMetricFilter
                key={field.name}
                label={field.label}
                id={numberIds[field.name]}
                name={field.name}
                value={filters[field.name]}
                inputWidth={MOBILE_NUMBER_INPUT_WIDTH}
                unit={field.unit}
                onBlur={onKeyboardInputBlur}
                onChange={handleNumericInputChange}
                onFocus={onKeyboardInputFocus}
              />
            ))}
          </div>
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
      </div>
    </>
  );
};

/**
 * 通常の検索と同じ絞り込み条件（雪マジ・シーズン券・規模・都道府県）。
 * 料金計算は含めないので、比較リストへの追加など料金の要らない画面で使う。
 */
export const FilterConditionFields = (props: FieldsProps) => (
  <>
    <FilterDetailFields {...props} />
    <FilterAreaFields
      filters={props.filters}
      resorts={props.resorts}
      onFilterChange={props.onFilterChange}
    />
  </>
);
