"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Settings, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { StatusMark } from "@/features/resort-detail/components/CompactInfo";
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
}: {
  settings: MapDisplaySettings;
  onChange: (settings: MapDisplaySettings) => void;
  variant: MapTileVariant;
  onBackgroundChange: (variant: MapTileVariant, monochrome: boolean) => void;
  onStatusChange: (status: FinalizedFeatureStatus, checked: boolean) => void;
}) {
  return (
    <Dialog>
      <DialogTrigger
        aria-label="地図の設定"
        className="flex h-6 shrink-0 items-center justify-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        <Settings className="size-[18px]" aria-hidden="true" />
        設定
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="z-[900]" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-[901] max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-700 shadow-xl outline-none">
          <DialogTitle className="pr-9 text-base font-semibold text-slate-900">
            地図の設定
          </DialogTitle>
          <DialogDescription className="mt-2 text-xs">
            変更は地図にすぐ反映されます。
          </DialogDescription>
          <div className="my-4 divide-y divide-slate-100">
            {(
              [
                { key: "showCourseNames", label: "コース名を表示" },
                { key: "showLiftNames", label: "リフト名を表示" },
                { key: "showUngroomed", label: "非圧雪コースを点線表示" },
              ] as const
            ).map(item => (
              <label
                key={item.key}
                className="flex min-h-12 cursor-pointer items-center justify-between gap-4 text-sm"
              >
                {item.label}
                <Switch
                  checked={settings[item.key]}
                  onCheckedChange={checked =>
                    onChange({ ...settings, [item.key]: checked })
                  }
                />
              </label>
            ))}
          </div>
          <fieldset className="mb-5">
            <legend className="mb-2 text-sm font-semibold">地図の表示</legend>
            <div className="flex flex-col gap-2">
              <SegmentedControl
                options={[
                  { value: "pale", label: "標準" },
                  { value: "photo", label: "航空写真" },
                ]}
                value={variant}
                onChange={value =>
                  onBackgroundChange(value, settings.monochrome)
                }
                itemClassName="min-h-11 flex-1 px-4 text-sm"
                ariaLabel={option => `背景を${option.label}にする`}
              />
              <SegmentedControl
                options={[
                  { value: "mono", label: "白黒" },
                  { value: "color", label: "カラー" },
                ]}
                value={settings.monochrome ? "mono" : "color"}
                onChange={value =>
                  onBackgroundChange(variant, value === "mono")
                }
                itemClassName="min-h-11 flex-1 px-4 text-sm"
                ariaLabel={option => `背景を${option.label}にする`}
              />
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">
              表示するコースの営業状況
            </legend>
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
              {COURSE_STATUS_OPTIONS.map(option => (
                <label
                  key={option.value}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 text-sm hover:bg-slate-50"
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
                  <span aria-hidden="true">
                    {option.value === "unknown" ? (
                      <span className="text-sm font-semibold text-slate-700">
                        不明
                      </span>
                    ) : (
                      <StatusMark symbol={option.symbol as "○" | "△" | "×"} />
                    )}
                  </span>
                  {option.value !== "unknown" && option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <DialogClose
            aria-label="設定を閉じる"
            className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-full hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <X className="size-5" />
          </DialogClose>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
