"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { SnowForecastFooter } from "./SnowForecastFooter";
import { SnowForecastLoading } from "./SnowForecastLoading";
import type { Elevation } from "./useWeatherLinks";

/**
 * 予報の左端にある余白の分だけ、最初から右へ送っておく。
 * 比較の天気カード（CompareWeatherTab.css の translate(-40px) scale(0.92)）と
 * 同じ位置から見せる。手で横スクロールはできる
 */
const INITIAL_SCROLL_X = 44;

export const SnowForecastEmbed = ({
  snowForecastSlug,
  resortName,
}: {
  snowForecastSlug: string;
  resortName: string;
}) => {
  const [elevation, setElevation] = useState<Elevation>("mid");
  const feedUrl = `https://ja.snow-forecast.com/resorts/${snowForecastSlug}/forecasts/feed/${elevation}/m`;
  const detailUrl = `https://ja.snow-forecast.com/resorts/${snowForecastSlug}/6day/${elevation}`;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const isLoading = loadedUrl !== feedUrl;

  // 地点が変わったときだけ初期位置へ戻す。標高の切り替えでは今の位置を保つ
  // biome-ignore lint/correctness/useExhaustiveDependencies: 地点の切り替えで送り直す
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = INITIAL_SCROLL_X;
  }, [snowForecastSlug]);

  return (
    // 枠は比較の天気カードの埋め込みと同じ
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="relative">
        {isLoading && <SnowForecastLoading />}
        <div
          ref={scrollRef}
          className="overflow-x-auto overflow-y-hidden scroll-touch"
        >
          <iframe
            title={`${resortName} Snow-Forecast`}
            src={feedUrl}
            width="100%"
            height={260}
            scrolling="auto"
            loading="lazy"
            onLoad={() => setLoadedUrl(feedUrl)}
            className="min-w-[720px] block border-0 bg-transparent"
          />
        </div>
      </div>
      <div>
        <SnowForecastFooter
          elevation={elevation}
          onElevationChange={setElevation}
          detailUrl={detailUrl}
        />
      </div>
    </div>
  );
};
