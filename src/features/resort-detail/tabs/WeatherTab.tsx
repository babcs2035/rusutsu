"use client";

import { useMemo } from "react";
import { SnowForecastEmbed } from "@/features/weather/WeatherChart";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { Resort } from "../types";

export const WeatherTab = ({ resort }: { resort: Resort }) => {
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

    const merged = resort.weatherIds;

    for (const entry of merged?.snowForecast ?? []) {
      addSnowForecastLink(
        entry.snowForecastId,
        entry.displayName || entry.snowForecastName || null,
      );
    }
    addSnowForecastLink(merged?.SnowForecastId, merged?.SnowForecastName);

    return links;
  }, [resort.weatherIds]);

  const tenkiJpLinks = useMemo(() => {
    const mergedEntry = resort.weatherIds;

    if (!mergedEntry?.tenkijp || mergedEntry.tenkijp.length === 0) return [];

    return mergedEntry.tenkijp.map(t => ({
      id: t.tenkijpId,
      displayName: t.displayName || t.tenkijpName || null,
      url: `https://tenki.jp/season/ski/${t.tenkijpId}/`,
    }));
  }, [resort.weatherIds]);

  const weathernewsSpotId = resort.weatherIds?.weathernewsSpotId ?? null;

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if ((e as unknown as { detail: number }).detail > 0) {
      (e.currentTarget as HTMLAnchorElement).blur();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-base text-gray-900 font-semibold mb-3 font-[var(--font-heading)]">
          リンク一覧
        </h3>
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {snowForecastLinks.length === 1 && (
            <ExternalLinkComponent
              href={snowForecastLinks[0].url}
              onClick={handleLinkClick}
              className="px-3 py-2 rounded-full bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 hover:text-red-800 hover:no-underline"
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
                className="px-3 py-2 rounded-full bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 hover:text-red-800 hover:no-underline"
              >
                {`Snow Forecast ${link.displayName}`}
              </ExternalLinkComponent>
            ))}
          {tenkiJpLinks.length === 1 && (
            <ExternalLinkComponent
              href={tenkiJpLinks[0].url}
              onClick={handleLinkClick}
              className="px-3 py-2 rounded-full bg-blue-50 text-blue-900 text-sm font-medium hover:bg-blue-100 hover:text-blue-700 hover:no-underline"
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
                className="px-3 py-2 rounded-full bg-blue-50 text-blue-900 text-sm font-medium hover:bg-blue-100 hover:text-blue-700 hover:no-underline"
              >
                {`tenki.jp ${link.displayName}`}
              </ExternalLinkComponent>
            ))}

          {(() => {
            const weathernewsUrl = weathernewsSpotId
              ? `https://weathernews.jp/ski/spot/${weathernewsSpotId}/`
              : null;

            const lat = resort.latitude;
            const lon = resort.longitude;
            const hasCoords =
              typeof lat === "number" && typeof lon === "number";
            const windyUrl = hasCoords
              ? `https://www.windy.com/${lat}/${lon}?${lat},${lon},14,i:pressure,p:cities`
              : null;

            return (
              <>
                {weathernewsUrl && (
                  <ExternalLinkComponent
                    key="weathernews"
                    href={weathernewsUrl}
                    onClick={handleLinkClick}
                    className="px-3 py-2 rounded-full bg-blue-50 text-blue-900 text-sm font-medium hover:bg-blue-100 hover:text-blue-700 hover:no-underline"
                  >
                    ウェザーニュース
                  </ExternalLinkComponent>
                )}

                {windyUrl && (
                  <ExternalLinkComponent
                    key="windy"
                    href={windyUrl}
                    onClick={handleLinkClick}
                    className="px-3 py-2 rounded-full bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 hover:text-red-800 hover:no-underline"
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
                resortName={resort.nameJa}
              />
            </div>
          ))}
      </section>
    </div>
  );
};
