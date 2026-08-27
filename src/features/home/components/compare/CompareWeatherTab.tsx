"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { getResortLabelName } from "@/lib/resortAliases";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import { CompactSnowForecastEmbed } from "./CompactSnowForecastEmbed";
import {
  DESKTOP_WEATHER_LINK_WIDTH,
  DESKTOP_WEATHER_RESORT_INFO_WIDTH,
  SNOW_FORECAST_FEED_TOTAL_WIDTH,
} from "./constants";
import type { Elevation, Resort, WeatherLink } from "./types";
import {
  getSnowForecastLinks,
  useWeatherLinks,
} from "./useCompareWeatherLinks";
import "./CompareWeatherTab.css";

export const CompareWeatherTab = ({
  resorts,
  isSidePanel,
}: {
  resorts: Resort[];
  isSidePanel: boolean;
}) => {
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [infoWidth, setInfoWidth] = useState<number | null>(null);

  useEffect(() => {
    const probe = measureRef.current;
    if (!probe) return;

    let maxNameWidth = 0;
    for (const resort of resorts) {
      probe.textContent = getResortLabelName(resort.id, resort.nameJa);
      maxNameWidth = Math.max(
        maxNameWidth,
        Math.ceil(probe.getBoundingClientRect().width),
      );
    }
    probe.textContent = "";

    const linkWidth = Number.parseInt(DESKTOP_WEATHER_LINK_WIDTH, 10) || 0;
    const baseWidth = Math.max(maxNameWidth, linkWidth);
    const nextWidth = isSidePanel
      ? Math.min(
          baseWidth,
          Number.parseInt(DESKTOP_WEATHER_RESORT_INFO_WIDTH, 10),
        )
      : baseWidth;

    setInfoWidth(nextWidth > 0 ? nextWidth : null);
  }, [isSidePanel, resorts]);

  // §15: このパネルはコンテナクエリを唯一のレスポンシブ機構とするため，
  // ビューポートベースの md: ではなく表示形態（isSidePanel）で分岐する
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-1 overflow-x-auto pb-0",
        isSidePanel ? "gap-12" : "gap-3",
      )}
    >
      <span
        ref={measureRef}
        className="text-sm font-semibold absolute invisible whitespace-nowrap pointer-events-none font-[var(--font-heading)]"
      />
      {resorts.map(resort => (
        <ResortWeatherPanel
          key={resort.id}
          resort={resort}
          infoWidth={infoWidth}
          isSidePanel={isSidePanel}
        />
      ))}
    </div>
  );
};

const ResortWeatherPanel = ({
  resort,
  infoWidth,
  isSidePanel,
}: {
  resort: Resort;
  infoWidth: number | null;
  isSidePanel: boolean;
}) => {
  const [snowForecastElevation, setSnowForecastElevation] =
    useState<Elevation>("mid");
  const [selectedSnowForecastId, setSelectedSnowForecastId] = useState<
    string | null
  >(null);
  const snowForecastLinks = useMemo(
    () => getSnowForecastLinks(resort, snowForecastElevation),
    [resort, snowForecastElevation],
  );
  const selectedSnowForecast =
    snowForecastLinks.find(link => link.id === selectedSnowForecastId) ??
    snowForecastLinks[0] ??
    null;
  const links = useWeatherLinks(resort, snowForecastElevation);
  const availableLinks = links.filter(
    (link): link is WeatherLink & { url: string } => Boolean(link.url),
  );

  useEffect(() => {
    if (snowForecastLinks.length === 0) {
      if (selectedSnowForecastId !== null) setSelectedSnowForecastId(null);
      return;
    }

    if (!snowForecastLinks.some(link => link.id === selectedSnowForecastId)) {
      setSelectedSnowForecastId(snowForecastLinks[0].id);
    }
  }, [selectedSnowForecastId, snowForecastLinks]);

  return (
    <div
      className={cn(
        "weather-panel-container",
        "border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm",
        // md:pb-8 は md: 発火時（≥768px）に isSidePanel=true となるため到達不能だった
        // モバイルは Snow Forecast 本体を早く見せたいので外側の余白も詰める
        isSidePanel ? "px-8 pt-8 pb-4" : "px-3 pt-2.5 pb-2",
        // gap は flex/grid でのみ有効。この要素は block であるため gap-8 は dead class だった
        "w-full",
      )}
      style={
        infoWidth
          ? ({
              "--weather-info-width": `${infoWidth}px`,
              "--feed-width": SNOW_FORECAST_FEED_TOTAL_WIDTH,
            } as React.CSSProperties)
          : undefined
      }
    >
      <div
        className={cn(
          "weather-panel-content flex items-stretch w-full min-w-0",
          isSidePanel ? "gap-8" : "gap-1.5",
        )}
      >
        <div className="weather-info flex-shrink-0">
          <h3 className="weather-info-name text-sm text-gray-900 font-semibold leading-tight font-[var(--font-heading)]">
            {getResortLabelName(resort.id, resort.nameJa)}
          </h3>

          {availableLinks.length > 0 && (
            <div className="weather-links scroll-touch flex gap-4">
              {availableLinks.map(link => (
                <WeatherLinkButton
                  key={`${link.kind}-${link.id}`}
                  link={link}
                />
              ))}
            </div>
          )}
        </div>

        <div className="weather-feed min-w-0">
          {selectedSnowForecast ? (
            <CompactSnowForecastEmbed
              snowForecastLinks={snowForecastLinks}
              selectedSnowForecastId={selectedSnowForecast.id}
              onSnowForecastChange={setSelectedSnowForecastId}
              resortName={resort.nameJa}
              elevation={snowForecastElevation}
              onElevationChange={setSnowForecastElevation}
            />
          ) : (
            <Card>
              <CardContent className="flex min-h-[50px] items-center justify-center">
                <p className="text-sm font-semibold text-gray-500">
                  Snow Forecast の予報リンクが見つかりませんでした。
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

const WeatherLinkButton = ({
  link,
}: {
  link: WeatherLink & { url: string };
}) => (
  <ExternalLinkComponent
    href={link.url}
    className={cn(
      "weather-link",
      // 幅の狭いパネルでの高さ・余白は CompareWeatherTab.css のコンテナクエリ側で詰める
      "flex flex-shrink-0 items-center justify-center min-h-28 px-8 rounded-md text-xs font-extrabold text-center",
      "transition-colors duration-150",
      link.bg,
      link.hoverBg,
      link.color,
    )}
  >
    {link.label}
  </ExternalLinkComponent>
);
