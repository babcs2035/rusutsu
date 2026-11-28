"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { NumericFilterName, NumericFilterValue } from "../types";

export const PrefectureFilter = ({
  regionOptions,
  selectedPrefectures,
  onPrefectureChange,
  onRegionPrefecturesChange,
  showHeading = true,
}: {
  regionOptions: Array<{ region: string; prefectures: string[] }>;
  selectedPrefectures: string[];
  onPrefectureChange: (prefecture: string, checked: boolean) => void;
  onRegionPrefecturesChange: (prefectures: string[], checked: boolean) => void;
  /** 見出し「都道府県で選ぶ」を出すか。エリアのモーダルは枠の見出しがあるので出さない */
  showHeading?: boolean;
}) => (
  <div>
    {showHeading && (
      <div className="flex items-center gap-2 text-gray-900 font-bold h-7 text-sm">
        <span>都道府県で選ぶ</span>
        {selectedPrefectures.length > 0 && (
          <span className="text-blue-600 font-semibold text-xs">
            {selectedPrefectures.length}件選択中
          </span>
        )}
      </div>
    )}
    {/* 全部の県を1画面に並べる。左の地方名のボタンで、その地方をまとめて選ぶ */}
    <div className="flex flex-col divide-y divide-gray-100">
      {regionOptions.map(({ region, prefectures }) => {
        const isRegionSelected = prefectures.every(prefecture =>
          selectedPrefectures.includes(prefecture),
        );

        return (
          <div
            key={region}
            className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-start gap-1.5 py-1.5"
          >
            <Button
              type="button"
              variant="outline"
              aria-pressed={isRegionSelected}
              aria-label={`${region}を${isRegionSelected ? "すべて解除" : "すべて選択"}`}
              className={cn(
                "flex h-auto min-h-7 flex-col gap-1 rounded-md px-1 py-1.5 leading-none whitespace-nowrap",
                isRegionSelected
                  ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
                  : "border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100",
              )}
              onClick={() =>
                onRegionPrefecturesChange(prefectures, !isRegionSelected)
              }
            >
              <span className="text-xs font-bold leading-none">{region}</span>
              <span
                className={cn(
                  "text-xs font-semibold leading-none",
                  isRegionSelected ? "text-white" : "text-blue-700",
                )}
              >
                {isRegionSelected ? "解除" : "全選択"}
              </span>
            </Button>
            <div className="grid grid-cols-4 gap-1">
              {prefectures.map(prefecture => (
                <FilterToggle
                  key={prefecture}
                  id={`prefecture-${prefecture}`}
                  label={prefecture.replace(/[府県]$/, "")}
                  checked={selectedPrefectures.includes(prefecture)}
                  onChange={checked => onPrefectureChange(prefecture, checked)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

export const ElevationFilterRow = ({
  label,
  minId,
  minName,
  minValue,
  maxId,
  maxName,
  maxValue,
  unit,
  onBlur,
  onChange,
  onFocus,
}: {
  label: string;
  minId: string;
  minName: NumericFilterName;
  minValue: NumericFilterValue;
  maxId?: string;
  maxName?: NumericFilterName;
  maxValue?: NumericFilterValue;
  unit: string;
  onBlur?: () => void;
  onChange: (name: NumericFilterName, value: string) => void;
  onFocus?: () => void;
}) => (
  <div className="grid grid-cols-[64px_max-content_max-content] items-center gap-1.5 md:gap-2">
    <Label
      htmlFor={minId}
      className="text-gray-800 font-semibold whitespace-nowrap block text-sm"
    >
      {label}
    </Label>
    <CompactNumberInput
      id={minId}
      name={minName}
      value={minValue}
      unit={unit}
      suffix="以上"
      onBlur={onBlur}
      onChange={onChange}
      onFocus={onFocus}
    />
    {maxId && maxName ? (
      <CompactNumberInput
        id={maxId}
        name={maxName}
        value={maxValue ?? null}
        unit={unit}
        suffix="以下"
        onBlur={onBlur}
        onChange={onChange}
        onFocus={onFocus}
      />
    ) : (
      <div />
    )}
  </div>
);

export const CompactMetricFilter = ({
  label,
  id,
  name,
  value,
  inputWidth,
  unit,
  onBlur,
  onChange,
  onFocus,
}: {
  label: string;
  id: string;
  name: NumericFilterName;
  value: NumericFilterValue;
  inputWidth: string;
  unit: string;
  onBlur?: () => void;
  onChange: (name: NumericFilterName, value: string) => void;
  onFocus?: () => void;
}) => (
  <div className="grid grid-cols-[3.5rem_auto_auto] items-center justify-start gap-1 min-w-0">
    <Label
      htmlFor={id}
      className="text-gray-800 font-semibold whitespace-nowrap block text-sm"
    >
      {label}
    </Label>
    <CompactNumberInput
      id={id}
      name={name}
      value={value}
      inputWidth={inputWidth}
      unit=""
      suffix=""
      onBlur={onBlur}
      onChange={onChange}
      onFocus={onFocus}
    />
    <span className="flex-shrink-0 whitespace-nowrap text-gray-700 font-semibold text-sm md:text-xs">
      {unit}以上
    </span>
  </div>
);

const CompactNumberInput = ({
  id,
  name,
  value,
  // 4 桁（例: 標高 3000）が px-1.5 のパディング内に表示される最小幅
  inputWidth = "3.25rem",
  unit,
  suffix,
  onBlur,
  onChange,
  onFocus,
}: {
  id: string;
  name: NumericFilterName;
  value: NumericFilterValue;
  inputWidth?: string;
  unit: string;
  suffix: string;
  onBlur?: () => void;
  onChange: (name: NumericFilterName, value: string) => void;
  onFocus?: () => void;
}) => (
  <div className="flex items-center gap-0.75 min-w-0">
    <Input
      id={id}
      type="text"
      name={name}
      inputMode="numeric"
      pattern="[0-9]*"
      value={value == null ? "" : String(value)}
      onBlur={onBlur}
      onChange={e => onChange(name, e.target.value)}
      onFocus={onFocus}
      className="h-9 w-full rounded-md border border-input bg-white px-1.5 py-1 text-sm shadow-sm text-center text-gray-800 placeholder:text-gray-400 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10 outline-none select-none disabled:pointer-events-none disabled:opacity-50"
      style={{
        width: inputWidth,
        scrollMarginTop: "calc(env(safe-area-inset-top, 0px) + 5.5rem)",
      }}
    />
    {(unit || suffix) && (
      <span className="flex-shrink-0 text-gray-700 font-semibold md:text-xs text-sm">
        {unit}
        {suffix}
      </span>
    )}
  </div>
);

const TOGGLE_BASE_CLASS =
  "inline-flex items-center justify-center rounded-md border text-ellipsis overflow-hidden whitespace-nowrap text-xs leading-none focus-visible:ring-0 outline-none select-none disabled:pointer-events-none disabled:opacity-50 h-7 min-w-0 transition-colors";
const TOGGLE_ON_CLASS =
  "font-bold bg-blue-600 border-blue-600 text-white hover:bg-blue-700 hover:text-white";
const TOGGLE_OFF_CLASS =
  "font-semibold border-gray-300 bg-white text-gray-800 hover:bg-gray-50 hover:text-gray-900";

/**
 * 絞り込みのオン・オフ。`link` を渡すと、右にそのサービスのサイトを別タブで開く小さなボタンを付ける。
 */
export const FilterToggle = ({
  id,
  label,
  checked,
  onChange,
  link,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  link?: { href: string; name: string };
}) => {
  // checkedColor は常に "brand.500" (#3b82f6 = blue-600) で使用されるため固定する
  const toggle = (
    <Button
      id={id}
      type="button"
      variant="outline"
      aria-pressed={checked}
      className={`${TOGGLE_BASE_CLASS} ${checked ? TOGGLE_ON_CLASS : TOGGLE_OFF_CLASS} ${
        link ? "flex-1 rounded-r-none px-1.5" : "px-2"
      }`}
      onClick={() => onChange(!checked)}
    >
      {label}
    </Button>
  );
  if (!link) return toggle;
  return (
    <div className="flex min-w-0">
      {toggle}
      <ExternalLinkComponent
        href={link.href}
        aria-label={`${link.name}のサイトを開く`}
        title={`${link.name}のサイトを開く`}
        className="h-7 w-6 shrink-0 justify-center rounded-r-md border border-l-0 border-gray-300 bg-white transition-colors hover:bg-gray-50"
      ></ExternalLinkComponent>
    </div>
  );
};
