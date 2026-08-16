"use client";

import { Filter, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TicketPartyEditor } from "@/features/lift-ticket/components/TicketPartyEditor";
import { DEFAULT_LIFT_TICKET_SEARCH_INPUT } from "@/features/lift-ticket/utils/calculateLiftTicket";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import type { MapSkiResort } from "@/types/skiResorts";
import {
  CompactMetricFilter,
  ElevationFilterRow,
  FilterToggle,
  PrefectureFilter,
  ToggleSection,
} from "./components/FilterControls";
import { useFilterPanelState } from "./hooks/useFilterPanelState";
import type { Filters } from "./types";

type Props = {
  filters: Filters;
  resorts: MapSkiResort[];
  resultCount: number;
  isExpanded: boolean;
  canCollapse?: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  onFilterChange: (newFilters: Filters) => void;
  onKeyboardInputBlur?: () => void;
  onKeyboardInputFocus?: () => void;
  onSearch: () => void;
  reserveHeaderActionSpace?: boolean;
  scrollContent?: boolean;
  showKeywordSearch?: boolean;
  title?: string;
};

const MOBILE_NUMBER_INPUT_WIDTH = "3.25rem";

const ResultCountBadge = ({ count }: { count: number }) => (
  <Badge
    variant="secondary"
    className="bg-blue-50 text-blue-900 text-base font-black leading-none whitespace-nowrap md:text-xs md:h-[26px] h-[30px] md:px-2.5 px-2.5"
  >
    {count.toLocaleString()}件
  </Badge>
);

export const FilterPanel = ({
  filters,
  resorts,
  resultCount,
  isExpanded,
  onExpandedChange,
  onFilterChange,
  onKeyboardInputBlur,
  onKeyboardInputFocus,
  onSearch,
  reserveHeaderActionSpace = false,
  scrollContent = true,
  showKeywordSearch = true,
  title = "スキー場を検索",
}: Props) => {
  const {
    collapsedDetailLabels,
    handleCheckboxChange,
    handleNumericInputChange,
    handlePrefectureChange,
    handleRegionPrefecturesChange,
    handleResetConfirm,
    resetDialogOpen,
    setResetDialogOpen,
    handleTextInputChange,
    ids,
    isElevationDetailOpen,
    regionOptions,
    setIsElevationDetailOpen,
  } = useFilterPanelState({ filters, resorts, onFilterChange });
  const {
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
  } = ids;

  const isCollapsed = !isExpanded;

  return (
    <div
      className={cn(
        "flex flex-col bg-white",
        isExpanded && scrollContent
          ? "flex-1 min-h-0 overflow-hidden"
          : "flex-shrink-0 min-h-[auto] overflow-visible",
        isExpanded ? "p-4" : isCollapsed ? "px-3 py-1" : "p-4",
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between",
          reserveHeaderActionSpace ? "pr-11" : "pr-0",
        )}
      >
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-gray-900 text-base font-bold font-[var(--font-heading)]">
            <Filter size={16} color="var(--brand-main)" />
            {title}
            <ResultCountBadge count={resultCount} />
          </h2>
        </div>
        <div className="flex flex-shrink-0 gap-2 md:gap-2">
          <ConfirmDialog
            open={resetDialogOpen}
            onOpenChange={setResetDialogOpen}
            title="検索条件のクリア"
            description="キーワード以外の検索フィルタをリセットしますか？"
            onConfirm={handleResetConfirm}
            confirmLabel="クリアする"
          />
          <Button
            aria-label="検索条件をクリア"
            variant="outline"
            className="h-9 gap-1.5 border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-700"
            onClick={() => setResetDialogOpen(true)}
          >
            <RotateCcw size={14} />
            条件をクリア
          </Button>
        </div>
      </div>

      {/* Keyword Search */}
      {showKeywordSearch && (
        <form
          className={cn(
            "flex gap-2 flex-shrink-0",
            isExpanded ? "mt-2 mb-2" : "mt-2",
          )}
          onSubmit={e => {
            e.preventDefault();
            onSearch();
          }}
        >
          <Input
            className="flex-1 min-w-0 h-10 bg-gray-50 border border-gray-200 text-gray-800 placeholder:text-gray-400 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10"
            id={keywordId}
            type="text"
            name="keyword"
            placeholder="スキー場名を入力"
            value={filters.keyword}
            onChange={handleTextInputChange}
            onBlur={onKeyboardInputBlur}
            onFocus={onKeyboardInputFocus}
          />
          <Button
            type="submit"
            variant="default"
            className="flex-shrink-0 w-auto min-w-[7rem] h-9 gap-1 font-bold text-sm"
          >
            <Search size={14} />
            検索
          </Button>
        </form>
      )}

      {/* Collapsed state */}
      {isCollapsed ? (
        <div className="flex gap-1.5 md:gap-2 flex-wrap items-center mt-4">
          {(collapsedDetailLabels.length > 0
            ? collapsedDetailLabels
            : ["条件なし"]
          ).map(label => (
            <Badge
              key={label}
              variant="secondary"
              className="text-gray-700 font-semibold leading-none min-h-[28px] text-sm bg-gray-100"
            >
              {label}
            </Badge>
          ))}
          <Button
            className="flex items-center justify-center gap-1.5 h-8 border border-gray-200 bg-white text-gray-700 text-xs font-medium hover:bg-gray-50 hover:text-gray-900 shadow-sm"
            onClick={() => onExpandedChange(true)}
          >
            <SlidersHorizontal size={14} />
            フィルタを変更
          </Button>
        </div>
      ) : (
        /* Expanded state */
        <div
          className={cn(
            "flex flex-col gap-5 pt-4",
            scrollContent
              ? "flex-1 min-h-0 overflow-y-auto pr-0.5"
              : "flex-shrink-0 min-h-auto",
          )}
        >
          {/* Lift ticket editor */}
          <Alert className="rounded-xl bg-blue-50 border-blue-200">
            <AlertTitle className="text-blue-900 font-bold text-sm">
              日程・人数からリフト券代を比較
            </AlertTitle>
            <AlertDescription>
              <TicketPartyEditor
                value={filters.liftTicket ?? DEFAULT_LIFT_TICKET_SEARCH_INPUT}
                onChange={liftTicket =>
                  onFilterChange({ ...filters, liftTicket })
                }
                compact
                onInputBlur={onKeyboardInputBlur}
                onInputFocus={onKeyboardInputFocus}
              />
            </AlertDescription>
          </Alert>

          {/* Quick filters */}
          <div className="grid grid-cols-3 gap-1.5 md:gap-2">
            <FilterToggle
              id={statusId}
              label="営業中のみ"
              checked={filters.status}
              onChange={checked => handleCheckboxChange("status", checked)}
            />
            <FilterToggle
              id={yukiMagiId}
              label="雪マジ対象"
              checked={filters.yukiMagi}
              onChange={checked => handleCheckboxChange("yukiMagi", checked)}
            />
            <FilterToggle
              id={beginnerFriendlyId}
              label="初級者向け"
              checked={filters.beginnerFriendly}
              onChange={checked =>
                handleCheckboxChange("beginnerFriendly", checked)
              }
            />
          </div>

          {/* Metric filters */}
          <div className="flex flex-col gap-2 md:gap-3">
            <div className="grid grid-cols-3 gap-1.5 md:gap-2">
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
                label="コース数"
                id={minCoursesId}
                name="minCourses"
                value={filters.minCourses}
                inputWidth={MOBILE_NUMBER_INPUT_WIDTH}
                unit=""
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
                unit=""
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

          {/* Prefecture filter */}
          <PrefectureFilter
            regionOptions={regionOptions}
            selectedPrefectures={filters.prefectures}
            onPrefectureChange={handlePrefectureChange}
            onRegionPrefecturesChange={handleRegionPrefecturesChange}
          />
        </div>
      )}
    </div>
  );
};
