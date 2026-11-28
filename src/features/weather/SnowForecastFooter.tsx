"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import { ELEVATION_OPTIONS, type Elevation } from "./useWeatherLinks";

/**
 * Snow Forecast の埋め込みの下に置く行（詳細・比較で共通）。
 * 左に標高の切り替え、右に出典を兼ねた Snow Forecast へのリンク。
 */
export const SnowForecastFooter = ({
  elevation,
  onElevationChange,
  detailUrl,
  className,
}: {
  elevation: Elevation;
  onElevationChange: (elevation: Elevation) => void;
  detailUrl: string;
  className?: string;
}) => (
  // 幅320pxの端末でも1行に収まるよう、行自身の幅が狭いときだけ余白を詰める
  <div
    className={cn(
      "@container/sf-footer flex border-t border-border bg-muted",
      className,
    )}
  >
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 px-3 py-2 @max-[19rem]/sf-footer:gap-1 @max-[19rem]/sf-footer:px-2">
      <div className="flex flex-shrink-0">
        {ELEVATION_OPTIONS.map(option => (
          <Button
            type="button"
            key={option.value}
            variant="ghost"
            aria-pressed={elevation === option.value}
            onClick={() => {
              if (elevation !== option.value) onElevationChange(option.value);
            }}
            className={cn(
              "min-w-max h-8 min-h-0 px-2.5 @max-[19rem]/sf-footer:px-1.5 rounded-md text-xs font-semibold transition-colors",
              // 選択中は押し直しても・ホバーしても同じ見た目を保つ
              elevation === option.value
                ? "border border-border bg-background text-primary shadow-sm hover:bg-background hover:text-primary"
                : "border-transparent bg-transparent text-muted-foreground shadow-none hover:bg-background hover:text-foreground",
            )}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <ExternalLinkComponent
        href={detailUrl}
        className="h-8 flex-shrink-0 gap-1 rounded-md border border-border bg-background px-2 text-xs font-bold text-primary hover:bg-accent"
      >
        Snow Forecastで詳細
        <ExternalLink size={12} />
      </ExternalLinkComponent>
    </div>
  </div>
);
