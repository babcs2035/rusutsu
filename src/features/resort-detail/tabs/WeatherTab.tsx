"use client";

import { useMemo, useState } from "react";
import { SnowForecastEmbed } from "@/features/weather/WeatherChart";
import { getWeathernewsLinks } from "@/features/weather/weatherLinks";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import { ResortTabs } from "../components/ResortTabs";
import { useSimultaneousView } from "../components/SimultaneousToggle";
import type { Resort } from "../types";

// 各サイト1件ずつの4リンクはスマホでも横1列。複数地点のリンクは折り返してよい。
const weatherLinkClassName =
  "shrink-0 whitespace-nowrap rounded-full px-1.5 py-1.5 text-[11px] font-medium hover:no-underline @min-[21rem]/weather-links:text-xs @min-[22rem]/weather-links:px-2 @min-[28rem]/weather-links:text-sm";
const redWeatherLinkClassName = cn(
  weatherLinkClassName,
  "bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800",
);
const blueWeatherLinkClassName = cn(
  weatherLinkClassName,
  "bg-blue-50 text-blue-900 hover:bg-blue-100 hover:text-blue-700",
);

type WeatherMember = Pick<
  Resort,
  "id" | "nameJa" | "shortName" | "weatherIds" | "latitude" | "longitude"
> & { label?: string };

/** 「〇〇も同時に表示」中に、天気を切り替えて見るスキー場。最初は開いたスキー場 */
const useWeatherMembers = (resort: Resort): WeatherMember[] => {
  const { active, partners } = useSimultaneousView(resort);
  if (!partners.length) return [];
  return [resort, ...partners].map(member => ({
    ...member,
    label: active?.memberLabels[member.id],
  }));
};

export const WeatherTab = ({ resort }: { resort: Resort }) => {
  const members = useWeatherMembers(resort);
  const [selectedId, setSelectedId] = useState(resort.id);
  const activeMember = members.find(member => member.id === selectedId) ?? null;
  const shown = activeMember ?? resort;
  const weatherIds = shown.weatherIds;
  const latitude = shown.latitude;
  const longitude = shown.longitude;
  const resortName = shown.nameJa;
  const snowForecastLinks = useMemo(() => {
    const links: Array<{
      id: string;
      displayName: string | null;
      url: string;
    }> = [];
    const seen = new Set<string>();
    const addSnowForecastLink = (
      id: string | null | undefined,
      displayName?: string | null,
    ) => {
      if (!id) return;
      if (seen.has(id)) {
        const existing = links.find(link => link.id === id);
        if (existing && displayName) existing.displayName = displayName;
        return;
      }
      seen.add(id);
      links.push({
        id,
        displayName: displayName || id,
        url: `https://ja.snow-forecast.com/resorts/${id}/6day/mid`,
      });
    };

    const merged = weatherIds;

    for (const entry of merged?.snowForecast ?? []) {
      addSnowForecastLink(
        entry.snowForecastId,
        entry.displayName || entry.snowForecastName || null,
      );
    }
    addSnowForecastLink(merged?.SnowForecastId, merged?.SnowForecastName);

    return links;
  }, [weatherIds]);

  const tenkiJpLinks = useMemo(() => {
    const mergedEntry = weatherIds;

    if (!mergedEntry?.tenkijp || mergedEntry.tenkijp.length === 0) return [];

    return mergedEntry.tenkijp.map(t => ({
      id: t.tenkijpId,
      displayName: t.displayName || t.tenkijpName || null,
      url: `https://tenki.jp/season/ski/${t.tenkijpId}/`,
    }));
  }, [weatherIds]);

  const weathernewsLinks = getWeathernewsLinks(weatherIds);

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if ((e as unknown as { detail: number }).detail > 0) {
      (e.currentTarget as HTMLAnchorElement).blur();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {members.length > 1 && (
        <ResortTabs
          members={members}
          activeId={activeMember?.id ?? resort.id}
          onChange={setSelectedId}
          label="天気を見るスキー場"
        />
      )}
      <section className="@container/weather-links min-w-0">
        <h3 className="text-base text-gray-900 font-semibold mb-3 font-[var(--font-heading)]">
          リンク一覧
        </h3>
        <div className="flex flex-wrap items-center gap-1 mb-6 @min-[22rem]/weather-links:gap-1.5 @min-[28rem]/weather-links:gap-2">
          {snowForecastLinks.length === 1 && (
            <ExternalLinkComponent
              href={snowForecastLinks[0].url}
              onClick={handleLinkClick}
              className={redWeatherLinkClassName}
            >
              Snow Forecast
            </ExternalLinkComponent>
          )}
          {snowForecastLinks.length > 1 &&
            snowForecastLinks.map(link => (
              <ExternalLinkComponent
                key={link.id}
                href={link.url}
                onClick={handleLinkClick}
                className={redWeatherLinkClassName}
              >
                {`Snow Forecast ${link.displayName}`}
              </ExternalLinkComponent>
            ))}
          {tenkiJpLinks.length === 1 && (
            <ExternalLinkComponent
              href={tenkiJpLinks[0].url}
              onClick={handleLinkClick}
              className={blueWeatherLinkClassName}
            >
              tenki.jp
            </ExternalLinkComponent>
          )}

          {tenkiJpLinks.length > 1 &&
            tenkiJpLinks.map(link => (
              <ExternalLinkComponent
                key={link.id}
                href={link.url}
                onClick={handleLinkClick}
                className={blueWeatherLinkClassName}
              >
                {`tenki.jp ${link.displayName}`}
              </ExternalLinkComponent>
            ))}

          {(() => {
            const lat = latitude;
            const lon = longitude;
            const hasCoords =
              typeof lat === "number" && typeof lon === "number";
            const windyUrl = hasCoords
              ? `https://www.windy.com/${lat}/${lon}?${lat},${lon},14,i:pressure,p:cities`
              : null;

            return (
              <>
                {weathernewsLinks.map(link => (
                  <ExternalLinkComponent
                    key={`weathernews-${link.id}`}
                    href={link.url}
                    onClick={handleLinkClick}
                    className={blueWeatherLinkClassName}
                  >
                    {weathernewsLinks.length === 1
                      ? "ウェザーニュース"
                      : `ウェザーニュース ${link.displayName}`}
                  </ExternalLinkComponent>
                ))}

                {windyUrl && (
                  <ExternalLinkComponent
                    key="windy"
                    href={windyUrl}
                    onClick={handleLinkClick}
                    className={redWeatherLinkClassName}
                  >
                    Windy
                  </ExternalLinkComponent>
                )}
              </>
            );
          })()}
        </div>
        {snowForecastLinks.length > 0 &&
          snowForecastLinks.map((link, index) => (
            <div key={link.id}>
              <h3
                className={cn(
                  "text-base text-gray-900 font-semibold mb-4 font-[var(--font-heading)]",
                  index !== 0 && "mt-6",
                )}
              >
                {snowForecastLinks.length === 1
                  ? "Snow Forecast 予報"
                  : `Snow Forecast 予報 (${link.displayName})`}
              </h3>
              <SnowForecastEmbed
                snowForecastSlug={link.id}
                resortName={resortName}
              />
            </div>
          ))}
      </section>
    </div>
  );
};
