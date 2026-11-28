"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  getSnowForecastLinks,
  useWeatherLinks,
} from "@/features/weather/useWeatherLinks";
import { WeatherLinkChips } from "@/features/weather/WeatherLinkChips";
import { getResortLabelName } from "@/lib/resortAliases";
import { CompactSnowForecastEmbed } from "./CompactSnowForecastEmbed";
import { CompareResortDetailButton } from "./CompareResortNameCell";
import { COMPARE_WEATHER_GRID_CLASS } from "./constants";
import type { Elevation, Resort } from "./types";
import "./CompareWeatherTab.css";

export const CompareWeatherTab = ({
  resorts,
  onSelectResort,
}: {
  resorts: Resort[];
  isSidePanel: boolean;
  /** 「詳細」で開くスキー場。渡さなければボタンを出さない */
  onSelectResort?: (id: string) => void;
}) => (
  // 他タブと同じく @container の親でカードを横に並べる（列数は constants.ts）
  <div className="@container min-w-0">
    <div className={COMPARE_WEATHER_GRID_CLASS}>
      {resorts.map(resort => (
        <ResortWeatherPanel
          key={resort.id}
          resort={resort}
          onSelectResort={onSelectResort}
        />
      ))}
    </div>
  </div>
);

const ResortWeatherPanel = ({
  resort,
  onSelectResort,
}: {
  resort: Resort;
  onSelectResort?: (id: string) => void;
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
          <div className="weather-info-name flex min-w-0 items-center gap-2">
            <h3 className="min-w-0 text-sm text-gray-900 font-semibold leading-tight break-words font-heading">
              {getResortLabelName(resort.id, resort.nameJa, resort.shortName)}
            </h3>
            {onSelectResort && (
              <CompareResortDetailButton
                resortId={resort.id}
                onSelectResort={onSelectResort}
                className="ml-auto"
              />
            )}
          </div>

          <WeatherLinkChips links={links} />
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
