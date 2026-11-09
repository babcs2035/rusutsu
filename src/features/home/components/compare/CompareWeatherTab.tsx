"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { getResortLabelName } from "@/lib/resortAliases";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import { CompactSnowForecastEmbed } from "./CompactSnowForecastEmbed";
import { COMPARE_WEATHER_GRID_CLASS } from "./constants";
import type { Elevation, Resort, WeatherLink } from "./types";
import {
  getSnowForecastLinks,
  useWeatherLinks,
} from "./useCompareWeatherLinks";
import "./CompareWeatherTab.css";

export const CompareWeatherTab = ({
  resorts,
}: {
  resorts: Resort[];
  isSidePanel: boolean;
}) => (
  // 他タブと同じく @container の親でカードを横に並べる（列数は constants.ts）
  <div className="@container min-w-0">
    <div className={COMPARE_WEATHER_GRID_CLASS}>
      {resorts.map(resort => (
        <ResortWeatherPanel key={resort.id} resort={resort} />
      ))}
    </div>
  </div>
);

const ResortWeatherPanel = ({ resort }: { resort: Resort }) => {
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
  const hasMultipleLinks =
    new Set(availableLinks.map(link => link.kind)).size < availableLinks.length;

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
    <div className="weather-panel-container min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white px-2 pt-2 pb-2 shadow-sm">
      <div className="weather-panel-content flex w-full min-w-0 flex-col gap-1.5">
        <div className="weather-info flex-shrink-0">
          <h3 className="weather-info-name text-sm text-gray-900 font-semibold leading-tight font-[var(--font-heading)]">
            {getResortLabelName(resort.id, resort.nameJa, resort.shortName)}
          </h3>

          {availableLinks.length > 0 && (
            <div
              className={cn(
                "weather-links flex gap-1",
                hasMultipleLinks && "weather-links-multiple",
              )}
            >
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
      "flex items-center justify-center rounded-md text-xs font-extrabold text-center",
      "transition-colors duration-150",
      link.bg,
      link.hoverBg,
      link.color,
    )}
  >
    <span className="whitespace-nowrap">{link.label}</span>
  </ExternalLinkComponent>
);
