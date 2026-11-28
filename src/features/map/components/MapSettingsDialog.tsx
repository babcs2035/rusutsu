"use client";

import { Settings } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusMark } from "@/features/resort-detail/components/CompactInfo";
import { cn } from "@/lib/utils";
import { Modal } from "@/shared/components/Modal";
import { SegmentedControl } from "@/shared/components/SegmentedControl";
import type { FinalizedFeatureStatus, MapTileVariant } from "../types";
import {
  COURSE_STATUS_OPTIONS,
  type MapDisplaySettings,
} from "../utils/mapDisplaySettings";

export function MapSettingsDialog({
  settings,
  onChange,
  variant,
  onBackgroundChange,
  onStatusChange,
  courseColorMode,
  onCourseColorModeChange,
  triggerClassName,
}: {
  settings: MapDisplaySettings;
  onChange: (settings: MapDisplaySettings) => void;
  variant: MapTileVariant;
  onBackgroundChange: (variant: MapTileVariant, monochrome: boolean) => void;
  onStatusChange: (status: FinalizedFeatureStatus, checked: boolean) => void;
  courseColorMode: "difficulty" | "slope";
  onCourseColorModeChange: (mode: "difficulty" | "slope") => void;
  /** 周りのボタンに高さ・文字を合わせるときに渡す */
  triggerClassName?: string;
}) {
  return (
    <Modal
      trigger={
        <button
          type="button"
          aria-label="地図の設定"
          className={cn(
            "flex h-6 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-gray-300 bg-white px-2 text-xs font-semibold text-black shadow-sm hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-600 md:h-8 md:text-sm",
            triggerClassName,
          )}
        >
          <Settings
            className="size-[18px]"
            strokeWidth={2.5}
            aria-hidden="true"
          />
          設定
        </button>
      }
      title="設定"
      closeLabel="設定を閉じる"
      className="max-w-sm p-5"
    >
      <fieldset className="my-4 border-t border-slate-100 pt-3">
        <legend className="mb-2 text-sm font-semibold md:text-base">
          地図
        </legend>
        <div className="grid grid-cols-2 gap-1.5">
          <SegmentedControl
            options={[
              { value: "pale", label: "標準" },
              { value: "photo", label: "航空写真" },
            ]}
            value={variant}
            onChange={value => onBackgroundChange(value, settings.monochrome)}
            itemClassName="h-8 flex-1 whitespace-nowrap px-1 text-xs md:px-2 md:text-sm"
            ariaLabel={option => `背景を${option.label}にする`}
          />
          <SegmentedControl
            options={[
              { value: "mono", label: "白黒" },
              { value: "color", label: "カラー" },
            ]}
            value={settings.monochrome ? "mono" : "color"}
            onChange={value => onBackgroundChange(variant, value === "mono")}
            itemClassName="h-8 flex-1 whitespace-nowrap px-1 text-xs md:px-2 md:text-sm"
            ariaLabel={option => `背景を${option.label}にする`}
          />
        </div>
      </fieldset>
      <fieldset className="border-t border-slate-100 py-3">
        <legend className="mb-1 text-sm font-semibold md:text-base">
          コース
        </legend>
        <Label className="min-h-9 cursor-pointer justify-between gap-3 text-sm font-medium md:text-base">
          コースを表示
          <Switch
            checked={settings.showCourses}
            onCheckedChange={checked =>
              onChange({ ...settings, showCourses: checked })
            }
          />
        </Label>
        {settings.showCourses && (
          <div className="mt-1 divide-y divide-slate-100">
            {settings.showCourseNames && (
              <div className="pb-2">
                <div className="grid grid-cols-2 gap-1.5">
                  {COURSE_STATUS_OPTIONS.map(option => (
                    <Label
                      key={option.value}
                      className="min-h-8 cursor-pointer gap-1.5 rounded-md border border-slate-200 px-2 text-xs whitespace-nowrap hover:bg-slate-50 md:text-sm"
                    >
                      <Checkbox
                        aria-label={
                          option.value === "unknown" ? option.label : undefined
                        }
                        checked={settings.courseStatuses[option.value]}
                        onCheckedChange={checked =>
                          onStatusChange(option.value, checked === true)
                        }
                      />
                      <span
                        aria-hidden="true"
                        className="inline-flex items-center leading-none"
                      >
                        {option.value === "unknown" ? (
                          <span className="font-semibold text-slate-700">
                            不明
                          </span>
                        ) : (
                          <StatusMark
                            symbol={option.symbol as "○" | "△" | "×"}
                          />
                        )}
                      </span>
                      {option.value !== "unknown" && option.label}
                    </Label>
                  ))}
                </div>
              </div>
            )}
            <Label className="min-h-9 cursor-pointer justify-between gap-3 text-sm md:text-base">
              コース名を表示
              <Switch
                checked={settings.showCourseNames}
                onCheckedChange={checked =>
                  onChange({ ...settings, showCourseNames: checked })
                }
              />
            </Label>
            <Label className="min-h-9 cursor-pointer justify-between gap-3 text-sm md:text-base">
              非圧雪コースを点線表示
              <Switch
                checked={settings.showUngroomed}
                onCheckedChange={checked =>
                  onChange({ ...settings, showUngroomed: checked })
                }
              />
            </Label>
            <div className="grid grid-cols-2 items-center gap-1.5 py-2">
              <p className="whitespace-nowrap text-sm md:text-base">
                コース色分け
              </p>
              <SegmentedControl
                className="min-w-0"
                options={[
                  { value: "difficulty", label: "難易度" },
                  { value: "slope", label: "斜度" },
                ]}
                value={courseColorMode}
                onChange={onCourseColorModeChange}
                itemClassName="h-8 flex-1 whitespace-nowrap px-1 text-xs md:px-2 md:text-sm"
                ariaLabel={option =>
                  `コースの色分けを${option.label}に切り替え`
                }
              />
            </div>
          </div>
        )}
      </fieldset>
      <fieldset className="border-t border-slate-100 pt-3">
        <legend className="mb-1 text-sm font-semibold md:text-base">
          リフト
        </legend>
        <Label className="min-h-9 cursor-pointer justify-between gap-3 text-sm font-medium md:text-base">
          リフトを表示
          <Switch
            checked={settings.showLifts}
            onCheckedChange={checked =>
              onChange({ ...settings, showLifts: checked })
            }
          />
        </Label>
        {settings.showLifts && (
          <Label className="min-h-9 cursor-pointer justify-between gap-3 border-t border-slate-100 text-sm md:text-base">
            リフト名を表示
            <Switch
              checked={settings.showLiftNames}
              onCheckedChange={checked =>
                onChange({ ...settings, showLiftNames: checked })
              }
            />
          </Label>
        )}
      </fieldset>
    </Modal>
  );
}
