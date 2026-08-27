"use client";

import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import {
  DESKTOP_SNOW_FORECAST_FEED_INITIAL_SCROLL_X,
  DESKTOP_SNOW_FORECAST_FEED_INITIAL_SCROLL_Y,
  ELEVATION_OPTIONS,
  SNOW_FORECAST_FEED_INITIAL_SCROLL_Y_RATIO,
  SNOW_FORECAST_SOURCE_HEIGHT,
  SNOW_FORECAST_SOURCE_WIDTH,
} from "./constants";
import type { Elevation, SnowForecastLink } from "./types";

export const CompactSnowForecastEmbed = ({
  snowForecastLinks,
  selectedSnowForecastId,
  onSnowForecastChange,
  resortName,
  elevation,
  onElevationChange,
}: {
  snowForecastLinks: SnowForecastLink[];
  selectedSnowForecastId: string;
  onSnowForecastChange: (id: string) => void;
  resortName: string;
  elevation: Elevation;
  onElevationChange: (elevation: Elevation) => void;
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isFeedLoading, setIsFeedLoading] = useState(true);
  const selectedSnowForecast =
    snowForecastLinks.find(link => link.id === selectedSnowForecastId) ??
    snowForecastLinks[0];
  const feedUrl = `https://ja.snow-forecast.com/resorts/${selectedSnowForecast.id}/forecasts/feed/${elevation}/m`;
  const detailUrl = selectedSnowForecast.url;
  const sourceWidth = SNOW_FORECAST_SOURCE_WIDTH;
  const sourceHeight = SNOW_FORECAST_SOURCE_HEIGHT;

  const resetFeedScroll = useCallback(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    requestAnimationFrame(() => {
      const maxScrollX =
        scrollContainer.scrollWidth - scrollContainer.clientWidth;
      const maxScrollY =
        scrollContainer.scrollHeight - scrollContainer.clientHeight;
      const shouldApplyInitialScrollX =
        window.matchMedia("(min-width: 48em)").matches;

      scrollContainer.scrollLeft = shouldApplyInitialScrollX
        ? Math.min(DESKTOP_SNOW_FORECAST_FEED_INITIAL_SCROLL_X, maxScrollX)
        : 0;
      scrollContainer.scrollTop = shouldApplyInitialScrollX
        ? Math.min(DESKTOP_SNOW_FORECAST_FEED_INITIAL_SCROLL_Y, maxScrollY)
        : maxScrollY * SNOW_FORECAST_FEED_INITIAL_SCROLL_Y_RATIO;
    });
  }, []);

  useEffect(() => {
    resetFeedScroll();
  }, [resetFeedScroll]);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    let animationFrameId: number | null = null;
    const scheduleResetFeedScroll = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(() => {
        animationFrameId = null;
        resetFeedScroll();
      });
    };

    const mediaQuery = window.matchMedia("(min-width: 48em)");
    mediaQuery.addEventListener("change", scheduleResetFeedScroll);

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleResetFeedScroll);
      return () => {
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
        }
        mediaQuery.removeEventListener("change", scheduleResetFeedScroll);
        window.removeEventListener("resize", scheduleResetFeedScroll);
      };
    }

    const resizeObserver = new ResizeObserver(scheduleResetFeedScroll);
    resizeObserver.observe(scrollContainer);

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      mediaQuery.removeEventListener("change", scheduleResetFeedScroll);
      resizeObserver.disconnect();
    };
  }, [resetFeedScroll]);

  useEffect(() => {
    if (feedUrl) setIsFeedLoading(true);
  }, [feedUrl]);

  return (
    <TooltipProvider>
      <div>
        <div className="w-full max-w-full">
          {/* 幅は親の .weather-feed (flex: 0 0 var(--feed-width)) が保証するため max-w は不要 */}
          <div className="flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white w-full min-w-0">
            {snowForecastLinks.length > 1 && (
              <div className="flex flex-wrap gap-2 p-4 bg-gray-50 border-b border-gray-200">
                {snowForecastLinks.map(link => (
                  <Button
                    type="button"
                    key={link.id}
                    variant="ghost"
                    onClick={() => {
                      onSnowForecastChange(link.id);
                      resetFeedScroll();
                    }}
                    className="flex-1 flex-shrink-0 min-w-max h-auto min-h-0 px-8 py-2 rounded-md bg-white text-red-700 border border-gray-200 shadow-sm text-xs font-semibold hover:bg-white hover:text-red-700"
                  >
                    {link.displayName}
                  </Button>
                ))}
              </div>
            )}

            <div className="snow-forecast-viewport w-full min-w-0">
              <div className="snow-forecast-desktop-elevation-controls flex w-[100px] flex-shrink-0 flex-col gap-2 p-4 bg-gray-50 border-r border-gray-200">
                {ELEVATION_OPTIONS.map(option => (
                  <Button
                    type="button"
                    key={option.value}
                    variant="outline"
                    onClick={() => {
                      onElevationChange(option.value);
                      resetFeedScroll();
                    }}
                    className={cn(
                      "flex-1 min-h-0 min-w-auto px-4 py-2 rounded-md text-xs font-semibold transition-colors",
                      elevation === option.value
                        ? "bg-white text-blue-600 border border-gray-200 shadow-sm"
                        : "bg-transparent text-gray-500 border-transparent shadow-none hover:bg-white hover:text-gray-700",
                    )}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>

              <div
                ref={scrollRef}
                className="relative flex-1 min-w-0 h-full overflow-auto scroll-touch"
              >
                {isFeedLoading && (
                  <div
                    className="absolute inset-0 z-10 flex items-center justify-center gap-8 bg-white text-xs font-medium text-gray-600"
                    aria-live="polite"
                    aria-busy="true"
                  >
                    <Spinner className="h-4 w-4 text-blue-600" />
                    <p>予報を読み込み中...</p>
                  </div>
                )}

                <Tooltip>
                  <TooltipTrigger>
                    <span>
                      <div className="snow-forecast-feed-crop overflow-hidden">
                        <div className="snow-forecast-feed-transform origin-top-left h-[250px] w-[750px] overflow-hidden">
                          <iframe
                            title={`${resortName} Snow-Forecast compact`}
                            src={feedUrl}
                            width={sourceWidth}
                            height={sourceHeight}
                            scrolling="auto"
                            loading="lazy"
                            onLoad={() => {
                              setIsFeedLoading(false);
                              resetFeedScroll();
                            }}
                            className="border-0 block"
                          />
                        </div>
                      </div>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {`${resortName} Snow-Forecast compact`}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* §15: 表示制御は CompareWeatherTab.css のコンテナクエリが単一情報源。
                Tailwind の hidden クラスを付けない（.scrollable-tabs .hidden の
                display: contents !important 上書きでコンテナクエリが勝てなくなる）。
                高さを固定した .snow-forecast-viewport の中に置くと、その外枠の
                overflow: hidden で切り落とされるので、必ず外に出しておく */}
            <div className="snow-forecast-mobile-footer flex-wrap items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-t border-gray-200">
              <div className="flex flex-shrink-0">
                {ELEVATION_OPTIONS.map(option => (
                  <Button
                    type="button"
                    key={option.value}
                    variant="ghost"
                    onClick={() => {
                      onElevationChange(option.value);
                      resetFeedScroll();
                    }}
                    className={cn(
                      "min-w-max h-8 min-h-0 px-3 rounded-md text-xs font-semibold transition-colors",
                      elevation === option.value
                        ? "bg-white text-blue-600 border border-gray-200 shadow-sm"
                        : "bg-transparent text-gray-500 border-transparent shadow-none hover:bg-white hover:text-gray-700",
                    )}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>

              <ExternalLinkComponent
                href={detailUrl}
                className="h-8 flex-shrink-0 gap-1 rounded-md border border-blue-200 bg-white px-3 text-xs font-bold text-blue-700 hover:bg-blue-50"
              >
                詳細はこちら
                <ExternalLink size={12} />
              </ExternalLinkComponent>
            </div>

            {/* §15: 表示制御はコンテナクエリ（CompareWeatherTab.css）のみに集約。
                hidden md:block を併用すると 678-768px 域で wide モードなのに
                出典行だけが非表示になる */}
            <p className="snow-forecast-desktop-source mt-6 w-full text-xs text-gray-500 font-medium text-center">
              この詳細は{" "}
              <ExternalLinkComponent
                href={detailUrl}
                className="text-blue-600 underline hover:text-blue-700"
              >
                Snow Forecast
              </ExternalLinkComponent>
              から
            </p>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};
