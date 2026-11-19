"use client";

import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { NumericFilterName, NumericFilterValue } from "../types";

export const PrefectureFilter = ({
  regionOptions,
  selectedPrefectures,
  onPrefectureChange,
  onRegionPrefecturesChange,
}: {
  regionOptions: Array<{ region: string; prefectures: string[] }>;
  selectedPrefectures: string[];
  onPrefectureChange: (prefecture: string, checked: boolean) => void;
  onRegionPrefecturesChange: (prefectures: string[], checked: boolean) => void;
}) => (
  <div>
    <div className="flex items-center gap-2 text-gray-900 font-bold h-7 text-sm">
      <span>都道府県で選ぶ</span>
      {selectedPrefectures.length > 0 && (
        <span className="text-blue-600 font-semibold text-xs">
          {selectedPrefectures.length}件選択中
        </span>
      )}
    </div>
    <div className="border-l-2 border-gray-200 ml-2 pl-2 mt-0.5">
      <div className="flex flex-col gap-0.75 md:gap-1">
        {regionOptions.map(({ region, prefectures }) => {
          const isRegionSelected = prefectures.every(prefecture =>
            selectedPrefectures.includes(prefecture),
          );

          return (
            <Card
              key={region}
              className="overflow-hidden border-gray-200 bg-gray-50"
            >
              <CardContent className="p-0">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-gray-800 font-bold truncate text-xs">
                    {region}
                  </span>
                  <Button
                    type="button"
                    variant={isRegionSelected ? "default" : "outline"}
                    className="inline-flex items-center justify-center rounded-md text-xs font-medium whitespace-nowrap focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none select-none disabled:pointer-events-none disabled:opacity-50 h-4 min-w-[72px] px-2 leading-none text-xs"
                    onClick={() =>
                      onRegionPrefecturesChange(prefectures, !isRegionSelected)
                    }
                  >
                    {isRegionSelected ? "解除" : "全選択"}
                  </Button>
                </div>

                <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] gap-0.5 mt-0.5 p-1">
                  {prefectures.map(prefecture => (
                    <FilterToggle
                      key={prefecture}
                      id={`prefecture-${prefecture}`}
                      label={prefecture.replace(/[府県]$/, "")}
                      checked={selectedPrefectures.includes(prefecture)}
                      onChange={checked =>
                        onPrefectureChange(prefecture, checked)
                      }
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  </div>
);

export const ToggleSection = ({
  isOpen,
  label,
  meta,
  onToggle,
  children,
}: {
  isOpen: boolean;
  label: string;
  meta?: string;
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <div>
    <Button
      type="button"
      variant="ghost"
      className="justify-start text-left text-sm font-semibold text-gray-800 hover:bg-gray-50 hover:text-gray-900 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10 w-full h-7 text-sm transition-colors"
      onClick={onToggle}
      aria-expanded={isOpen}
    >
      <span className="inline-block h-[13px] w-[13px]">
        {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </span>
      <span>{label}</span>
      {meta && (
        <span className="text-blue-600 font-medium md:text-xs text-xs">
          {meta}
        </span>
      )}
    </Button>
    {isOpen && (
      <div className="border-l-2 border-gray-200 ml-2 pl-2 mt-0.5">
        {children}
      </div>
    )}
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
        className="h-7 w-6 shrink-0 justify-center rounded-r-md border border-l-0 border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800"
      >
        <ExternalLink className="h-3 w-3" aria-hidden />
      </ExternalLinkComponent>
    </div>
  );
};
